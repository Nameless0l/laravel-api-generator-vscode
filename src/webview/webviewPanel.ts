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
import { t, getLocaleData } from '../i18n';

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
        this.panel.webview.html = getWebviewContent(this.panel.webview, nonce, getLocaleData());

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
        const stubsDir = path.join(
            this.workspaceRoot,
            'stubs',
            'vendor',
            'laravel-api-generator'
        );
        if (fs.existsSync(stubsDir)) {
            const cancelled = await this.checkCustomStubsValid();
            if (cancelled) {
                return;
            }
        }

        const existingFiles = this.scanner
            .getEntityFiles(config.name)
            .filter((f) => f.exists);

        if (existingFiles.length > 0) {
            const fileList = existingFiles
                .slice(0, 5)
                .map((f) => `  • ${path.relative(this.workspaceRoot, f.path)}`)
                .join('\n');
            const more = existingFiles.length > 5 ? t('generate.andMore', existingFiles.length - 5) : '';
            const overwriteLabel = t('generate.overwrite');
            const choice = await vscode.window.showWarningMessage(
                t('generate.willOverwrite', config.name, fileList + more),
                { modal: true },
                overwriteLabel
            );
            if (choice !== overwriteLabel) {
                this.panel.webview.postMessage({
                    type: 'generationResult',
                    success: false,
                    output: t('generate.cancelledOverwrite'),
                    errors: [],
                });
                return;
            }
        }

        if (config.options.auth && !LaravelDetector.isSanctumInstalled(this.workspaceRoot)) {
            const installLabel = t('package.installViaComposer');
            const noAuthLabel = t('package.generateWithoutAuth');
            const action = await vscode.window.showWarningMessage(
                t('package.sanctumMissing'),
                installLabel,
                noAuthLabel
            );
            if (action === installLabel) {
                const terminal = vscode.window.createTerminal({
                    name: 'Laravel API Generator',
                    cwd: this.workspaceRoot,
                });
                terminal.sendText('composer require laravel/sanctum');
                terminal.show();
                this.panel.webview.postMessage({
                    type: 'generationResult',
                    success: false,
                    output: t('package.sanctumInstallStarted'),
                    errors: [],
                });
                return;
            }
            if (action === noAuthLabel) {
                config = { ...config, options: { ...config.options, auth: false } };
            } else {
                this.panel.webview.postMessage({
                    type: 'generationResult',
                    success: false,
                    output: t('generate.cancelledOverwrite'),
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

    /**
     * Run api-generator:validate-stubs and warn the user if any customized
     * stub is missing required placeholders. Returns true when the user
     * decides to abort the generation.
     */
    private async checkCustomStubsValid(): Promise<boolean> {
        const result = await this.artisan.validateStubs();
        if (!result.success && !result.output) {
            return false;
        }

        let payload: {
            status: string;
            message: string;
            results: Array<{ stub: string; status: string; missing: string[] }>;
        };
        try {
            const raw = result.output.trim();
            const start = raw.indexOf('{');
            payload = JSON.parse(start >= 0 ? raw.slice(start) : raw);
        } catch {
            return false;
        }

        if (payload.status !== 'invalid') {
            return false;
        }

        const broken = payload.results.filter((r) => r.status === 'invalid');
        const lines = broken
            .map((r) => `  • ${r.stub}.stub — missing {{${r.missing.join('}}, {{')}}}`)
            .join('\n');

        const openLabel = t('generate.openStubsFolder');
        const anywayLabel = t('generate.generateAnyway');
        const action = await vscode.window.showWarningMessage(
            t('generate.stubsInvalidTitle', lines),
            { modal: true },
            openLabel,
            anywayLabel
        );

        if (action === openLabel) {
            await vscode.commands.executeCommand(
                'revealInExplorer',
                vscode.Uri.file(
                    path.join(this.workspaceRoot, 'stubs', 'vendor', 'laravel-api-generator')
                )
            );
            this.panel.webview.postMessage({
                type: 'generationResult',
                success: false,
                output: t('generate.fixStubsCancelled'),
                errors: [],
            });
            return true;
        }

        if (action === anywayLabel) {
            return false;
        }

        // undefined = user pressed the modal Cancel / Esc
        this.panel.webview.postMessage({
            type: 'generationResult',
            success: false,
            output: t('generate.stubsCancelled'),
            errors: [],
        });
        return true;
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
        const copyLabel = t('env.copyFromExample');
        const cancelLabel = t('common.cancel');

        const choice = await vscode.window.showWarningMessage(
            t('env.missing'),
            ...(hasExample ? [copyLabel, cancelLabel] : [cancelLabel])
        );

        if (choice === copyLabel && hasExample) {
            try {
                fs.copyFileSync(examplePath, envPath);
                vscode.window.showInformationMessage(t('env.createdFromExample'));
                return true;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Unknown error';
                vscode.window.showErrorMessage(t('env.copyFailed', msg));
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
                        output: t('env.migrateCancelled'),
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
                        output: t('env.seedCancelled'),
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
                    const openLabel = t('stubs.openFolder');
                    const resetLabel = t('stubs.resetToDefaults');
                    const cancelLabel = t('common.cancel');
                    const choice = await vscode.window.showInformationMessage(
                        t('stubs.alreadyPublished'),
                        openLabel,
                        resetLabel,
                        cancelLabel
                    );
                    if (choice === openLabel) {
                        await vscode.commands.executeCommand(
                            'revealInExplorer',
                            vscode.Uri.file(stubsDir)
                        );
                        this.panel.webview.postMessage({
                            type: 'actionResult',
                            success: true,
                            output: t('stubs.openedFolder'),
                        });
                        return;
                    }
                    if (choice === resetLabel) {
                        const resetActionLabel = t('stubs.reset');
                        const confirm = await vscode.window.showWarningMessage(
                            t('stubs.resetConfirm'),
                            { modal: true },
                            resetActionLabel
                        );
                        if (confirm !== resetActionLabel) {
                            this.panel.webview.postMessage({
                                type: 'actionResult',
                                success: true,
                                output: t('stubs.resetCancelled'),
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
                                output: t('stubs.deleteFailed', msg),
                            });
                            return;
                        }
                    } else {
                        this.panel.webview.postMessage({
                            type: 'actionResult',
                            success: true,
                            output: t('stubs.cancelled'),
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
                            ? t('stubs.resetDone')
                            : t('stubs.publishedDone')
                        : result.errors.join('\n'),
                });
                return;
            }
            case 'docs': {
                if (!LaravelDetector.isScrambleInstalled(this.workspaceRoot)) {
                    const installLabel = t('package.installViaComposer');
                    const action = await vscode.window.showWarningMessage(
                        t('package.scrambleMissing'),
                        installLabel,
                        t('common.cancel')
                    );
                    if (action === installLabel) {
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
                        output: t('package.scrambleNotInstalled'),
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
            finishLoading(t('env.dbImportCancelled'), false);
            return;
        }

        const tablesResult = await this.artisan.introspectTables();
        if (!tablesResult.success) {
            finishLoading(
                t('db.couldNotListTables', tablesResult.output || tablesResult.errors.join('\n')),
                false
            );
            return;
        }

        let tables: Array<{ name: string; columns: number }>;
        try {
            tables = JSON.parse(this.extractJson(tablesResult.output));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            finishLoading(t('db.couldNotParse', msg, tablesResult.output), false);
            return;
        }

        if (tables.length === 0) {
            finishLoading(t('db.noTables'), false);
            return;
        }

        // Stop the button spinner now — we're handing control to the QuickPick UI
        this.panel.webview.postMessage({ type: 'clearLoading', id: 'btnImportFromDb' });

        const tablePick = await vscode.window.showQuickPick(
            tables.map((tbl) => ({
                label: tbl.name,
                description: `${tbl.columns} column(s)`,
                tableName: tbl.name,
            })),
            {
                placeHolder: t('db.pickTablePlaceholder'),
                title: t('db.pickTableTitle'),
            }
        );

        if (!tablePick) {
            finishLoading(t('db.importCancelled'), true);
            return;
        }

        const detailResult = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: t('db.readingSchema', tablePick.tableName),
                cancellable: false,
            },
            () => this.artisan.introspectTable(tablePick.tableName)
        );

        if (!detailResult.success) {
            finishLoading(t('db.couldNotDescribe', detailResult.output), false);
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
            finishLoading(t('db.couldNotParseDescription', msg, detailResult.output), false);
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
