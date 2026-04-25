import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getWebviewContent } from './getWebviewContent';
import * as fs from 'fs';
import * as path from 'path';
import { ArtisanRunner } from '../services/artisanRunner';
import { EntityScanner } from '../services/entityScanner';
import { StubPreview } from '../services/stubPreview';
import { LaravelDetector } from '../services/laravelDetector';
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
        const existingFiles = this.scanner
            .getEntityFiles(config.name)
            .filter((f) => f.exists);

        if (existingFiles.length > 0) {
            const fileList = existingFiles
                .slice(0, 5)
                .map((f) => `  • ${path.relative(this.workspaceRoot, f.path)}`)
                .join('\n');
            const more = existingFiles.length > 5 ? `\n  ...and ${existingFiles.length - 5} more` : '';
            const choice = await vscode.window.showWarningMessage(
                `"${config.name}" already exists. The following files will be overwritten:\n\n${fileList}${more}`,
                { modal: true },
                'Overwrite',
                'Cancel'
            );
            if (choice !== 'Overwrite') {
                this.panel.webview.postMessage({
                    type: 'generationResult',
                    success: false,
                    output: 'Generation cancelled to avoid overwriting existing files.',
                    errors: [],
                });
                return;
            }
        }

        if (config.options.auth && !LaravelDetector.isSanctumInstalled(this.workspaceRoot)) {
            const action = await vscode.window.showWarningMessage(
                'Auth option requires Laravel Sanctum (laravel/sanctum) which is not installed in this project.',
                'Install via Composer',
                'Generate without Auth',
                'Cancel'
            );
            if (action === 'Install via Composer') {
                const terminal = vscode.window.createTerminal({
                    name: 'Laravel API Generator',
                    cwd: this.workspaceRoot,
                });
                terminal.sendText('composer require laravel/sanctum');
                terminal.show();
                this.panel.webview.postMessage({
                    type: 'generationResult',
                    success: false,
                    output: 'Sanctum installation started. Re-run generation once it completes.',
                    errors: [],
                });
                return;
            }
            if (action === 'Generate without Auth') {
                config = { ...config, options: { ...config.options, auth: false } };
            } else {
                this.panel.webview.postMessage({
                    type: 'generationResult',
                    success: false,
                    output: 'Generation cancelled.',
                    errors: [],
                });
                return;
            }
        }

        const result = await this.artisan.generate(config);

        this.panel.webview.postMessage({
            type: 'generationResult',
            success: result.success,
            output: result.output,
            errors: result.errors,
        });

        if (result.success) {
            await this.openGeneratedFiles(config.name);
            if (this.onDidGenerate) {
                this.onDidGenerate();
            }
        }
    }

    private async openGeneratedFiles(entityName: string): Promise<void> {
        const candidates = [
            path.join(this.workspaceRoot, 'app', 'Models', `${entityName}.php`),
            path.join(this.workspaceRoot, 'app', 'Http', 'Controllers', `${entityName}Controller.php`),
        ];

        for (const filePath of candidates) {
            if (!fs.existsSync(filePath)) {
                continue;
            }
            try {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                await vscode.window.showTextDocument(doc, { preview: false });
            } catch {
                // Silently skip if open fails
            }
        }
    }

    private async ensureEnvReady(): Promise<boolean> {
        const envPath = path.join(this.workspaceRoot, '.env');
        if (fs.existsSync(envPath)) {
            return true;
        }

        const examplePath = path.join(this.workspaceRoot, '.env.example');
        const hasExample = fs.existsSync(examplePath);

        const choice = await vscode.window.showWarningMessage(
            '.env file not found in this project. Database commands will fail without it.',
            ...(hasExample ? ['Copy from .env.example', 'Cancel'] : ['Cancel'])
        );

        if (choice === 'Copy from .env.example' && hasExample) {
            try {
                fs.copyFileSync(examplePath, envPath);
                vscode.window.showInformationMessage(
                    '.env created from .env.example. Review your DB credentials before running migrations.'
                );
                return true;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to copy .env.example: ${msg}`);
                return false;
            }
        }
        return false;
    }

    private async handleAction(action: string): Promise<void> {
        let result;
        switch (action) {
            case 'migrate':
                if (!(await this.ensureEnvReady())) {
                    this.panel.webview.postMessage({
                        type: 'actionResult',
                        success: false,
                        output: 'Migration cancelled: .env file is required.',
                    });
                    return;
                }
                result = await this.artisan.migrate();
                break;
            case 'seed': {
                if (!(await this.ensureEnvReady())) {
                    this.panel.webview.postMessage({
                        type: 'actionResult',
                        success: false,
                        output: 'Seed cancelled: .env file is required.',
                    });
                    return;
                }
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
            case 'importFromDb': {
                await this.handleImportFromDb();
                return;
            }
            case 'publishStubs': {
                const stubsDir = path.join(
                    this.workspaceRoot,
                    'stubs',
                    'vendor',
                    'laravel-api-generator'
                );
                const alreadyPublished = fs.existsSync(stubsDir);

                if (alreadyPublished) {
                    const choice = await vscode.window.showInformationMessage(
                        'Stubs are already published. What do you want to do?',
                        'Open Folder',
                        'Reset to Defaults',
                        'Cancel'
                    );
                    if (choice === 'Open Folder') {
                        await vscode.commands.executeCommand(
                            'revealInExplorer',
                            vscode.Uri.file(stubsDir)
                        );
                        this.panel.webview.postMessage({
                            type: 'actionResult',
                            success: true,
                            output: 'Opened stubs folder.',
                        });
                        return;
                    }
                    if (choice === 'Reset to Defaults') {
                        const confirm = await vscode.window.showWarningMessage(
                            'This will delete all your customized stubs and restore defaults. Continue?',
                            { modal: true },
                            'Reset'
                        );
                        if (confirm !== 'Reset') {
                            this.panel.webview.postMessage({
                                type: 'actionResult',
                                success: true,
                                output: 'Reset cancelled.',
                            });
                            return;
                        }
                        try {
                            fs.rmSync(stubsDir, { recursive: true, force: true });
                        } catch (e: unknown) {
                            const msg = e instanceof Error ? e.message : 'Unknown error';
                            this.panel.webview.postMessage({
                                type: 'actionResult',
                                success: false,
                                output: `Failed to delete stubs: ${msg}`,
                            });
                            return;
                        }
                    } else {
                        this.panel.webview.postMessage({
                            type: 'actionResult',
                            success: true,
                            output: 'Cancelled.',
                        });
                        return;
                    }
                }

                result = await this.artisan.publishStubs();
                if (result.success) {
                    await vscode.commands.executeCommand(
                        'revealInExplorer',
                        vscode.Uri.file(stubsDir)
                    );
                }
                this.panel.webview.postMessage({
                    type: 'actionResult',
                    success: result.success,
                    output: result.success
                        ? alreadyPublished
                            ? 'Stubs reset to defaults.'
                            : 'Stubs published to stubs/vendor/laravel-api-generator/. You can now edit them freely.'
                        : result.errors.join('\n'),
                });
                return;
            }
            case 'docs': {
                if (!LaravelDetector.isScrambleInstalled(this.workspaceRoot)) {
                    const action = await vscode.window.showWarningMessage(
                        'Scramble (dedoc/scramble) is not installed. It is required to generate API documentation.',
                        'Install via Composer',
                        'Cancel'
                    );
                    if (action === 'Install via Composer') {
                        const terminal = vscode.window.createTerminal({
                            name: 'Laravel API Generator',
                            cwd: this.workspaceRoot,
                        });
                        terminal.sendText('composer require dedoc/scramble');
                        terminal.show();
                    }
                    this.panel.webview.postMessage({
                        type: 'actionResult',
                        success: false,
                        output: 'Scramble is not installed. Please install it first.',
                    });
                    return;
                }
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

    private async handleImportFromDb(): Promise<void> {
        const finishLoading = (output: string, success: boolean): void => {
            this.panel.webview.postMessage({
                type: 'actionResult',
                success,
                output,
            });
        };

        if (!(await this.ensureEnvReady())) {
            finishLoading('Database introspection cancelled: .env file is required.', false);
            return;
        }

        const tablesResult = await this.artisan.introspectTables();
        if (!tablesResult.success) {
            finishLoading(
                `Could not list tables:\n${tablesResult.output || tablesResult.errors.join('\n')}`,
                false
            );
            return;
        }

        let tables: Array<{ name: string; columns: number }>;
        try {
            tables = JSON.parse(this.extractJson(tablesResult.output));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            finishLoading(
                `Could not parse tables JSON: ${msg}\n\nRaw output:\n${tablesResult.output}`,
                false
            );
            return;
        }

        if (tables.length === 0) {
            finishLoading(
                'No user tables were found in the database. Run your migrations first.',
                false
            );
            return;
        }

        // Stop the button spinner now — we're handing control to the QuickPick UI
        this.panel.webview.postMessage({ type: 'clearLoading', id: 'btnImportFromDb' });

        const tablePick = await vscode.window.showQuickPick(
            tables.map((t) => ({
                label: t.name,
                description: `${t.columns} column(s)`,
                tableName: t.name,
            })),
            {
                placeHolder: 'Pick a table to generate an API for',
                title: 'Generate from existing table',
            }
        );

        if (!tablePick) {
            finishLoading('Database import cancelled.', true);
            return;
        }

        const detailResult = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Reading schema for "${tablePick.tableName}"...`,
                cancellable: false,
            },
            () => this.artisan.introspectTable(tablePick.tableName)
        );

        if (!detailResult.success) {
            finishLoading(`Could not describe table:\n${detailResult.output}`, false);
            return;
        }

        let detail: {
            table: string;
            columns: Array<{ name: string; type: string; nullable: boolean }>;
            soft_deletes: boolean;
        };
        try {
            detail = JSON.parse(this.extractJson(detailResult.output));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            finishLoading(
                `Could not parse table description: ${msg}\n\nRaw output:\n${detailResult.output}`,
                false
            );
            return;
        }

        const entityName = this.tableToEntityName(detail.table);
        this.panel.webview.postMessage({
            type: 'dbImportResult',
            entity: {
                name: entityName,
                fields: detail.columns.map((c) => ({ name: c.name, type: c.type })),
                softDeletes: detail.soft_deletes,
            },
        });
    }

    /**
     * Pull the JSON document out of artisan output (which can include log noise).
     */
    private extractJson(raw: string): string {
        const start = raw.indexOf('[');
        const startObj = raw.indexOf('{');
        const first =
            start === -1 ? startObj : startObj === -1 ? start : Math.min(start, startObj);
        if (first === -1) {
            return raw.trim();
        }
        return raw.slice(first).trim();
    }

    /**
     * users -> User, blog_posts -> BlogPost, categories -> Category
     */
    private tableToEntityName(table: string): string {
        const singular = this.singularize(table);
        return singular
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
    }

    private singularize(word: string): string {
        if (word.endsWith('ies')) {
            return word.slice(0, -3) + 'y';
        }
        if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('shes') || word.endsWith('ches')) {
            return word.slice(0, -2);
        }
        if (word.endsWith('s') && !word.endsWith('ss')) {
            return word.slice(0, -1);
        }
        return word;
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
