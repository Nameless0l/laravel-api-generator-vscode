import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getWebviewContent } from './getWebviewContent';
import * as fs from 'fs';
import * as path from 'path';
import { ArtisanRunner } from '../services/artisanRunner';
import { EntityScanner } from '../services/entityScanner';
import { StubPreview } from '../services/stubPreview';
import { EntityConfig } from '../types';

export class GeneratorPanel {
    public static currentPanel: GeneratorPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly artisan: ArtisanRunner;
    private readonly scanner: EntityScanner;
    private disposables: vscode.Disposable[] = [];
    private onDidGenerate: (() => void) | undefined;

    private constructor(
        panel: vscode.WebviewPanel,
        private workspaceRoot: string
    ) {
        this.panel = panel;
        this.artisan = new ArtisanRunner(workspaceRoot);
        this.scanner = new EntityScanner(workspaceRoot);

        const nonce = crypto.randomBytes(16).toString('hex');
        this.panel.webview.html = getWebviewContent(this.panel.webview, nonce);

        this.panel.webview.onDidReceiveMessage(
            (message) => this.handleMessage(message),
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    static show(workspaceRoot: string, onDidGenerate?: () => void): void {
        if (GeneratorPanel.currentPanel) {
            GeneratorPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            GeneratorPanel.currentPanel.onDidGenerate = onDidGenerate;
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'laravelApiGenerator',
            'Laravel API Generator',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        GeneratorPanel.currentPanel = new GeneratorPanel(panel, workspaceRoot);
        GeneratorPanel.currentPanel.onDidGenerate = onDidGenerate;
    }

    private async handleMessage(message: { type: string; payload?: EntityConfig; action?: string; name?: string }): Promise<void> {
        switch (message.type) {
            case 'generate':
                if (message.payload) {
                    await this.handleGenerate(message.payload);
                }
                break;
            case 'preview':
                if (message.payload) {
                    this.handlePreview(message.payload);
                }
                break;
            case 'action':
                if (message.action) {
                    await this.handleAction(message.action);
                }
                break;
            case 'requestPreviewCode':
                if (message.payload) {
                    this.handlePreviewCode(message.payload);
                }
                break;
            case 'importJson':
                await this.handleImportJson();
                break;
            case 'checkEntityExists':
                if (message.name) {
                    const modelPath = path.join(this.workspaceRoot, 'app', 'Models', `${message.name}.php`);
                    this.panel.webview.postMessage({
                        type: 'entityExistsResult',
                        exists: fs.existsSync(modelPath),
                    });
                }
                break;
        }
    }

    private async handleGenerate(config: EntityConfig): Promise<void> {
        const result = await this.artisan.generate(config);

        this.panel.webview.postMessage({
            type: 'generationResult',
            success: result.success,
            output: result.output,
            errors: result.errors,
        });

        if (result.success && this.onDidGenerate) {
            this.onDidGenerate();
        }
    }

    private async handleAction(action: string): Promise<void> {
        let result;
        switch (action) {
            case 'migrate':
                result = await this.artisan.migrate();
                break;
            case 'seed': {
                const confirm = await vscode.window.showWarningMessage(
                    'This will drop all tables and re-run all migrations + seeders. All existing data will be lost.',
                    { modal: true },
                    'Continue'
                );
                if (confirm !== 'Continue') {
                    this.panel.webview.postMessage({
                        type: 'actionResult',
                        success: true,
                        output: 'Seed cancelled.',
                    });
                    return;
                }
                result = await this.artisan.seed();
                break;
            }
            case 'test':
                result = await this.artisan.test();
                break;
            case 'routes':
                result = await this.artisan.routes();
                break;
            case 'generateJson':
                result = await this.artisan.generateFromJson();
                this.panel.webview.postMessage({
                    type: 'jsonGenerateResult',
                    success: result.success,
                    output: result.output || result.errors.join('\n'),
                });
                if (result.success && this.onDidGenerate) {
                    this.onDidGenerate();
                }
                return;
            case 'docs': {
                const serve = await this.artisan.startServe();
                if (serve.success && serve.port) {
                    vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${serve.port}/docs/api`));
                    this.panel.webview.postMessage({
                        type: 'actionResult',
                        success: true,
                        output: `Server running on port ${serve.port}. Opening API docs...`,
                    });
                } else {
                    this.panel.webview.postMessage({
                        type: 'actionResult',
                        success: false,
                        output: serve.error || 'Could not start or find Laravel server.',
                    });
                }
                return;
            }
            default:
                return;
        }

        this.panel.webview.postMessage({
            type: 'actionResult',
            success: result.success,
            output: result.output || result.errors.join('\n'),
        });
    }

    private handlePreview(config: EntityConfig): void {
        const files = this.scanner
            .getEntityFiles(config.name)
            .map((f) => `${f.exists ? '⚠ EXISTS' : '  NEW  '} ${f.path}`);

        this.panel.webview.postMessage({
            type: 'previewResult',
            files,
        });
    }

    private async handleImportJson(): Promise<void> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: { 'JSON': ['json'] },
            title: 'Select class_data.json file',
        });

        if (!fileUri || fileUri.length === 0) { return; }

        try {
            const content = fs.readFileSync(fileUri[0].fsPath, 'utf-8');
            // Validate JSON
            const parsed = JSON.parse(content);

            // Copy to project root as class_data.json
            const destPath = path.join(this.workspaceRoot, 'class_data.json');
            fs.writeFileSync(destPath, JSON.stringify(parsed, null, 2), 'utf-8');

            // Send entities back to webview for preview
            const entities = this.extractEntitiesFromJson(parsed);
            this.panel.webview.postMessage({
                type: 'jsonLoaded',
                fileName: path.basename(fileUri[0].fsPath),
                entities,
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            this.panel.webview.postMessage({
                type: 'actionResult',
                success: false,
                output: `Invalid JSON file: ${msg}`,
            });
        }
    }

    private extractEntitiesFromJson(data: unknown): Array<{ name: string; fields: string[]; relations: string[] }> {
        const entities: Array<{ name: string; fields: string[]; relations: string[] }> = [];

        let items: Array<Record<string, unknown>>;
        const d = data as Record<string, unknown>;
        if (d.data && Array.isArray(d.data)) {
            items = [d] as Array<Record<string, unknown>>;
        } else if (Array.isArray(data)) {
            items = data as Array<Record<string, unknown>>;
        } else if (d.name) {
            items = [d] as Array<Record<string, unknown>>;
        } else {
            items = Object.values(d) as Array<Record<string, unknown>>;
        }

        for (const item of items) {
            const cls = (item.data || item) as Record<string, unknown>;
            const name = (cls.name as string) || 'Unknown';
            const attrs = (cls.attributes as Array<Record<string, string>>) || [];
            const fields = attrs.map((a) => `${a.name}: ${a._type || a.type || 'string'}`);

            const relations: string[] = [];
            for (const relKey of ['oneToOneRelationships', 'oneToManyRelationships', 'manyToOneRelationships', 'manyToManyRelationships']) {
                const rels = cls[relKey] as Array<Record<string, string>> | undefined;
                if (rels) {
                    for (const r of rels) {
                        relations.push(`${relKey.replace('Relationships', '')}: ${r.comodel || r.relatedModel}`);
                    }
                }
            }
            // UML compositions & aggregations
            for (const relKey of ['compositions', 'aggregations']) {
                const rels = cls[relKey] as Array<Record<string, string>> | undefined;
                if (rels) {
                    for (const r of rels) {
                        if (r._type || r.comodel) {
                            relations.push(`${relKey}: ${r._type || r.comodel}`);
                        }
                    }
                }
            }

            entities.push({ name, fields, relations });
        }

        return entities;
    }

    private handlePreviewCode(config: EntityConfig): void {
        const preview = new StubPreview();
        const code = preview.generatePreview(config);
        this.panel.webview.postMessage({
            type: 'previewCodeResult',
            code,
        });
    }

    private dispose(): void {
        GeneratorPanel.currentPanel = undefined;
        this.artisan.stopServe();
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
