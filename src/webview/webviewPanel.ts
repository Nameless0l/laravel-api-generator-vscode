import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getBuilderHtml } from './builderContent';
import { ProjectActions, readyData } from './projectActions';
import { ArtisanRunner } from '../services/artisanRunner';
import { EntityScanner } from '../services/entityScanner';
import { describeGeneration } from '../services/generationOutput';
import { GeneratorBridge, PreviewOutcome } from '../services/generatorBridge';
import { OverwriteCheck, overwriteCheck } from '../services/overwriteCheck';
import {
    detectPackageState,
    OPENAPI_MIN_VERSION,
    PackageState,
    PREVIEW_MIN_VERSION,
    readInstalledVersion,
    readLaravelMajor,
    requirePackageCommand,
    usesLegacyLine,
    versionSupport,
} from '../services/packageState';
import { flagsFromConfig, schemaFromConfig } from '../services/schemaBuilder';
import { StubRow, stubLine } from '../services/stubReport';
import { LaravelDetector } from '../services/laravelDetector';
import { parseOpenApi } from '../services/openApiImporter';
import { analyzeError, analyzeProtocolErrors, presentSuggestion } from '../services/errorAnalyzer';
import { outputChannel } from '../services/outputLog';
import { openPlanned, openPlannedDiff, openPlannedDiffs, rememberPlanned } from '../services/plannedContent';
import { ArtisanResult, EntityConfig, FIELD_TYPES, GenerationDocument, ProtocolMessage } from '../types';
import { confirmSanctum, ensureEnvReady, STUBS_PATH } from './projectActions';
import { t, getLocale, webviewStrings } from '../i18n';
import { iconSet } from './ui/icons';

interface BuilderMessage {
    type: string;
    payload?: EntityConfig;
    action?: string;
    name?: string;
    path?: string;
    paths?: string[];
    source?: 'database' | 'json' | 'openapi';
    id?: 'migrate' | 'test' | 'seed' | 'docs' | 'stubs';
}

export class GeneratorPanel {
    public static currentPanel: GeneratorPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly artisan: ArtisanRunner;
    private readonly scanner: EntityScanner;
    private readonly actions: ProjectActions;
    private disposables: vscode.Disposable[] = [];
    private onDidGenerate: (() => void) | undefined;
    private readonly bridge: GeneratorBridge;
    private packageState: PackageState;
    private handshakeOk = false;
    private pendingCommand: string | undefined;

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private workspaceRoot: string
    ) {
        this.panel = panel;
        this.artisan = new ArtisanRunner(workspaceRoot);
        this.scanner = new EntityScanner(workspaceRoot);
        this.packageState = detectPackageState(workspaceRoot, LaravelDetector.isPackageInstalled(workspaceRoot));
        this.bridge = new GeneratorBridge({
            root: workspaceRoot,
            php: () => this.artisan.phpCommand(),
            clientVersion: String(vscode.extensions.getExtension('Nameless0l.laravel-api-generator')?.packageJSON?.version ?? 'unknown'),
            onJunk: (line) => outputChannel().appendLine(line),
        });
        this.actions = new ProjectActions(workspaceRoot, (message) => void this.panel.webview.postMessage(message), () => this.onDidGenerate?.());

        this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon-dark.png');
        this.panel.webview.html = this.html();

        this.panel.webview.onDidReceiveMessage((message: BuilderMessage) => this.handleMessage(message), null, this.disposables);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.disposables.push(
            ...this.watchRestartTriggers(),
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('laravelApiGenerator.phpCommand') || event.affectsConfiguration('laravelApiGenerator.phpPath')) {
                    this.restartPreview();
                }
            })
        );
        void this.announceCapabilities();
    }

    static show(extensionUri: vscode.Uri, workspaceRoot: string, onDidGenerate?: () => void): void {
        if (GeneratorPanel.currentPanel) {
            GeneratorPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            GeneratorPanel.currentPanel.onDidGenerate = onDidGenerate;
            return;
        }

        const panel = vscode.window.createWebviewPanel('laravelApiGenerator', t('builder.tabTitle'), vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        });

        GeneratorPanel.currentPanel = new GeneratorPanel(panel, extensionUri, workspaceRoot);
        GeneratorPanel.currentPanel.onDidGenerate = onDidGenerate;
    }

    private html(): string {
        const webview = this.panel.webview;
        const asset = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview', file)).toString();
        return getBuilderHtml({
            cspSource: webview.cspSource,
            nonce: crypto.randomBytes(16).toString('hex'),
            lang: getLocale(),
            title: t('builder.tabTitle'),
            styles: [asset('kit.css'), asset('ready.css'), asset('builder.css')],
            scripts: [asset('common.js'), asset('ready.js'), asset('builder.js')],
            boot: {
                locale: getLocale(),
                strings: webviewStrings('builder', 'ready'),
                icons: iconSet(),
                fieldTypes: [...FIELD_TYPES],
                models: this.listModelNames(),
                modifiers: this.packageState.kind === 'installed' && this.packageState.preview !== 'tooOld',
            },
        });
    }

    private async handleMessage(message: BuilderMessage): Promise<void> {
        if (await this.actions.handle(message)) {
            return;
        }
        switch (message.type) {
            case 'generate':
                if (message.payload) {
                    await this.handleGenerate(message.payload);
                }
                break;
            case 'requestPreviewCode':
                if (message.payload) {
                    await this.handlePreviewCode(message.payload);
                }
                break;
            case 'openDiff':
                if (message.path) {
                    await openPlannedDiff(this.workspaceRoot, message.path);
                }
                break;
            case 'openDiffs':
                await openPlannedDiffs(this.workspaceRoot, message.paths ?? []);
                break;
            case 'openPlanned':
                if (message.path) {
                    await openPlanned(message.path);
                }
                break;
            case 'previewAction':
                await this.handlePreviewAction(message.action);
                break;
            case 'import':
                if (message.source === 'database') {
                    await this.handleImportFromDb();
                } else if (message.source === 'json') {
                    await this.handleImportJson();
                } else if (message.source === 'openapi') {
                    await this.handleImportOpenApi();
                }
                break;
            case 'generateJson':
                await this.handleGenerateJson();
                break;
            case 'menu':
                await this.handleMenu(message.action);
                break;
            case 'checkEntityExists':
                if (message.name) {
                    const modelPath = path.join(this.workspaceRoot, 'app', 'Models', `${message.name}.php`);
                    void this.panel.webview.postMessage({ type: 'entityExistsResult', name: message.name, exists: fs.existsSync(modelPath) });
                }
                break;
            case 'requestModels':
                void this.panel.webview.postMessage({ type: 'modelsList', models: this.listModelNames() });
                break;
            case 'cancelOperation':
                this.artisan.cancelAll();
                void this.panel.webview.postMessage({ type: 'clearAllLoading' });
                break;
        }
    }

    private async handleMenu(action: string | undefined): Promise<void> {
        if (action === 'projectActions') {
            await vscode.commands.executeCommand('laravelApiGenerator.projectActions');
        } else if (action === 'snippets') {
            await vscode.commands.executeCommand('laravelApiGenerator.showSnippets');
        } else if (action === 'customizeStubs') {
            await this.customizeStubs();
        }
    }

    private notice(tone: 'ok' | 'warn' | 'err', text: string, title = ''): void {
        void this.panel.webview.postMessage({ type: 'notice', tone, title, text });
    }

    private listModelNames(): string[] {
        const modelsDir = path.join(this.workspaceRoot, 'app', 'Models');
        try {
            return fs
                .readdirSync(modelsDir)
                .filter((f) => f.endsWith('.php'))
                .map((f) => f.replace(/\.php$/, ''))
                .sort();
        } catch {
            return [];
        }
    }

    private async handleGenerate(config: EntityConfig): Promise<void> {
        const started = Date.now();
        const stubsDir = path.join(this.workspaceRoot, ...STUBS_PATH.split('/'));
        if (fs.existsSync(stubsDir) && (await this.checkCustomStubsValid())) {
            return;
        }

        const check = await this.overwriteCheck(config);
        const overwriteLabel = t('generate.overwrite');
        let force = false;

        if (check.kept.length > 0) {
            const keepLabel = t('generate.keepMine');
            const choice = await vscode.window.showWarningMessage(
                t('generate.editedByHand', config.name, this.fileList(check.kept)),
                { modal: true },
                overwriteLabel,
                keepLabel
            );
            if (choice === undefined) {
                this.postFailure(t('generate.cancelledOverwrite'));
                return;
            }
            force = choice === overwriteLabel;
        } else if (check.overwritten.length > 0) {
            const choice = await vscode.window.showWarningMessage(
                t('generate.willOverwrite', config.name, this.fileList(check.overwritten)),
                { modal: true },
                overwriteLabel
            );
            if (choice !== overwriteLabel) {
                this.postFailure(t('generate.cancelledOverwrite'));
                return;
            }
        }

        if (config.options.auth) {
            const sanctum = await confirmSanctum(this.workspaceRoot);
            if (sanctum === 'installing' || sanctum === 'cancel') {
                this.postFailure(sanctum === 'installing' ? t('package.sanctumInstallStarted') : t('generate.cancelledOverwrite'));
                return;
            }
            if (sanctum === 'withoutAuth') {
                config = { ...config, options: { ...config.options, auth: false } };
            }
        }

        if (config.options.queryBuilder) {
            void LaravelDetector.promptQueryBuilderInstallIfMissing(this.workspaceRoot);
        }

        let result: ArtisanResult & { protocolErrors?: ProtocolMessage[]; document?: GenerationDocument };
        if (this.usesSchemaGeneration()) {
            result = await this.generateThroughSchema(config, force);
        } else if (config.relationships && config.relationships.length > 0) {
            result = await this.generateWithRelationships(config);
        } else {
            result = await this.artisan.generate(config);
        }

        if (!result.success) {
            this.postFailure(result.errors.join('\n') || result.output);
            const suggestion = result.protocolErrors ? analyzeProtocolErrors(result.protocolErrors) : analyzeError('generate', result.output || result.errors.join('\n'));
            if (suggestion) {
                void presentSuggestion(this.workspaceRoot, suggestion);
            }
            return;
        }

        const files = result.document
            ? result.document.files
            : this.scanner
                  .getEntityFiles(config.name)
                  .filter((file) => file.exists)
                  .map((file) => ({ path: file.path, kind: file.kind ?? file.type, entity: config.name, action: 'create' }));
        const data = readyData(this.workspaceRoot, {
            entities: [config.name],
            files,
            durationMs: Date.now() - started,
            queryBuilder: config.options.queryBuilder,
            newEntity: true,
        });
        await this.panel.webview.postMessage({ type: 'showReady', data });
        this.onDidGenerate?.();
        void this.actions.refreshRoutes(data.routes.length > 0 ? [config.name] : []);
    }

    private postFailure(output: string): void {
        void this.panel.webview.postMessage({ type: 'generationResult', success: false, output, errors: [] });
    }

    private usesSchemaGeneration(): boolean {
        if (this.packageState.kind !== 'installed') {
            return false;
        }
        return this.packageState.preview === 'supported' || (this.packageState.preview === 'unknown' && this.handshakeOk);
    }

    private async overwriteCheck(config: EntityConfig): Promise<OverwriteCheck> {
        if (this.usesSchemaGeneration()) {
            const outcome = await this.bridge.planOnce(schemaFromConfig(config), flagsFromConfig(config));
            if (outcome.state === 'ready') {
                const handshake = await this.bridge.capabilities();
                return overwriteCheck(outcome.plan.files, handshake?.capabilities.keepsEditedFiles === true);
            }
        }
        return {
            kept: [],
            overwritten: this.scanner
                .getEntityFiles(config.name)
                .filter((f) => f.exists)
                .map((f) => path.relative(this.workspaceRoot, path.join(this.workspaceRoot, f.path)).replace(/\\/g, '/')),
        };
    }

    private fileList(files: string[]): string {
        const list = files
            .slice(0, 5)
            .map((file) => `  • ${file}`)
            .join('\n');
        return files.length > 5 ? list + t('generate.andMore', files.length - 5) : list;
    }

    private async generateThroughSchema(
        config: EntityConfig,
        force: boolean
    ): Promise<ArtisanResult & { protocolErrors?: ProtocolMessage[]; document?: GenerationDocument }> {
        const { result, document } = await this.artisan.generateFromConfig(config, force);
        if (!document) {
            return result;
        }
        if (document.errors.length > 0) {
            const lines = document.errors.flatMap((error) => (error.hint ? [error.message, error.hint] : [error.message]));
            return { success: false, output: lines.join('\n'), errors: lines, protocolErrors: document.errors };
        }
        return {
            success: true,
            output: describeGeneration(document, { created: t('generate.created'), updated: t('generate.updated') }),
            errors: [],
            document,
        };
    }

    /**
     * Packages older than 3.9 take relationships through a synthetic class_data.json.
     */
    private async generateWithRelationships(config: EntityConfig): Promise<ArtisanResult> {
        const relationships = config.relationships ?? [];

        const buckets: Record<string, Array<{ comodel: string; role: string }>> = {
            oneToOneRelationships: [],
            oneToManyRelationships: [],
            manyToOneRelationships: [],
            manyToManyRelationships: [],
        };

        for (const rel of relationships) {
            const entry = { comodel: rel.target, role: rel.role || rel.target.toLowerCase() };
            if (rel.type === 'belongsTo') {
                buckets.manyToOneRelationships.push(entry);
            } else if (rel.type === 'hasMany') {
                buckets.oneToManyRelationships.push(entry);
            } else if (rel.type === 'hasOne') {
                buckets.oneToOneRelationships.push(entry);
            } else {
                buckets.manyToManyRelationships.push(entry);
            }
        }

        const classData = [
            {
                name: config.name,
                attributes: config.fields.map((f) => ({
                    name: f.name,
                    _type: f.type,
                    required: true,
                    ...(f.primary ? { primary: true } : {}),
                })),
                ...buckets,
            },
        ];

        fs.writeFileSync(path.join(this.workspaceRoot, 'class_data.json'), JSON.stringify(classData, null, 2), 'utf-8');

        return this.artisan.generateFromJson(config.onlyTypes, {
            queryBuilder: config.options.queryBuilder,
            pest: config.options.pest,
            jsonApi: config.options.jsonApi,
        });
    }

    /**
     * Runs api-generator:validate-stubs and warns when a customized stub misses
     * required placeholders. True when the user aborts the generation.
     */
    private async checkCustomStubsValid(): Promise<boolean> {
        const result = await this.artisan.validateStubs();
        if (!result.success && !result.output) {
            return false;
        }

        let payload: { status: string; message: string; results: StubRow[] };
        try {
            const raw = result.output.trim();
            const start = raw.indexOf('{');
            payload = JSON.parse(start >= 0 ? raw.slice(start) : raw);
        } catch {
            return false;
        }

        const obsolete = payload.results.filter((r) => r.status === 'obsolete').map((r) => stubLine(r));
        if (payload.status !== 'invalid') {
            if (obsolete.length > 0) {
                void vscode.window.showWarningMessage(t('generate.stubsObsolete', obsolete.join('\n')));
            }
            return false;
        }

        const lines = [...payload.results.filter((r) => r.status === 'invalid').map((r) => stubLine(r)), ...obsolete].join('\n');
        const openLabel = t('generate.openStubsFolder');
        const anywayLabel = t('generate.generateAnyway');
        const action = await vscode.window.showWarningMessage(t('generate.stubsInvalidTitle', lines), { modal: true }, openLabel, anywayLabel);

        if (action === openLabel) {
            await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(path.join(this.workspaceRoot, ...STUBS_PATH.split('/'))));
            this.postFailure(t('generate.fixStubsCancelled'));
            return true;
        }
        if (action === anywayLabel) {
            return false;
        }
        this.postFailure(t('generate.stubsCancelled'));
        return true;
    }

    private async customizeStubs(): Promise<void> {
        const stubsDir = path.join(this.workspaceRoot, ...STUBS_PATH.split('/'));
        const alreadyPublished = fs.existsSync(stubsDir);

        if (alreadyPublished) {
            const openLabel = t('stubs.openFolder');
            const resetLabel = t('stubs.resetToDefaults');
            const choice = await vscode.window.showInformationMessage(t('stubs.alreadyPublished'), openLabel, resetLabel, t('common.cancel'));
            if (choice === openLabel) {
                await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(stubsDir));
                return;
            }
            if (choice !== resetLabel) {
                return;
            }
            const resetActionLabel = t('stubs.reset');
            const confirm = await vscode.window.showWarningMessage(t('stubs.resetConfirm'), { modal: true }, resetActionLabel);
            if (confirm !== resetActionLabel) {
                return;
            }
            try {
                fs.rmSync(stubsDir, { recursive: true, force: true });
            } catch (e: unknown) {
                this.notice('err', t('stubs.deleteFailed', e instanceof Error ? e.message : String(e)));
                return;
            }
        }

        const result = await this.artisan.publishStubs();
        if (!result.success) {
            this.notice('err', result.errors.join('\n') || result.output);
            return;
        }
        await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(stubsDir));
        this.notice('ok', alreadyPublished ? t('stubs.resetDone') : t('stubs.publishedDone'));
    }

    private async handleGenerateJson(): Promise<void> {
        const result = await this.artisan.generateFromJson();
        void this.panel.webview.postMessage({ type: 'jsonGenerateResult', success: result.success, output: result.output || result.errors.join('\n') });
        if (result.success) {
            this.onDidGenerate?.();
        }
    }

    private async handleImportFromDb(): Promise<void> {
        if (!(await ensureEnvReady(this.workspaceRoot))) {
            this.notice('warn', t('env.dbImportCancelled'));
            return;
        }

        const tablesResult = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: t('sources.readingDatabase'), cancellable: false },
            () => this.artisan.introspectTables()
        );
        if (!tablesResult.success) {
            this.notice('err', t('db.couldNotListTables', tablesResult.output || tablesResult.errors.join('\n')));
            return;
        }

        let tables: Array<{ name: string; columns: number }>;
        try {
            tables = JSON.parse(this.extractJson(tablesResult.output));
        } catch (e: unknown) {
            this.notice('err', t('db.couldNotParse', e instanceof Error ? e.message : String(e), tablesResult.output));
            return;
        }

        if (tables.length === 0) {
            this.notice('warn', t('db.noTables'));
            return;
        }

        const tablePick = await vscode.window.showQuickPick(
            tables.map((tbl) => ({ label: tbl.name, description: t('sources.columnsCount', tbl.columns), tableName: tbl.name })),
            { placeHolder: t('db.pickTablePlaceholder'), title: t('db.pickTableTitle') }
        );
        if (!tablePick) {
            return;
        }

        const detailResult = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: t('db.readingSchema', tablePick.tableName), cancellable: false },
            () => this.artisan.introspectTable(tablePick.tableName)
        );
        if (!detailResult.success) {
            this.notice('err', t('db.couldNotDescribe', detailResult.output));
            return;
        }

        let detail: { table: string; columns: Array<{ name: string; type: string; nullable: boolean }>; soft_deletes: boolean };
        try {
            detail = JSON.parse(this.extractJson(detailResult.output));
        } catch (e: unknown) {
            this.notice('err', t('db.couldNotParseDescription', e instanceof Error ? e.message : String(e), detailResult.output));
            return;
        }

        void this.panel.webview.postMessage({
            type: 'dbImportResult',
            entity: {
                name: this.tableToEntityName(detail.table),
                fields: detail.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable })),
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
        const first = start === -1 ? startObj : startObj === -1 ? start : Math.min(start, startObj);
        return first === -1 ? raw.trim() : raw.slice(first).trim();
    }

    /**
     * users -> User, blog_posts -> BlogPost, categories -> Category
     */
    private tableToEntityName(table: string): string {
        return this.singularize(table)
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

    private async handleImportOpenApi(): Promise<void> {
        const version = readInstalledVersion(this.workspaceRoot);
        const packageReadsSpecs = version !== null && versionSupport(version, OPENAPI_MIN_VERSION) !== 'tooOld';

        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: packageReadsSpecs ? { 'OpenAPI / Swagger': ['yaml', 'yml', 'json'] } : { 'OpenAPI / Swagger JSON': ['json'] },
            title: t('sources.openApiTitle'),
        });
        if (!fileUri || fileUri.length === 0) {
            return;
        }

        if (packageReadsSpecs) {
            await vscode.commands.executeCommand('laravelApiGenerator.generateFromOpenApi', fileUri[0]);
            return;
        }

        try {
            const result = parseOpenApi(fs.readFileSync(fileUri[0].fsPath, 'utf-8'));
            if (result.entities.length === 0) {
                this.notice('warn', 'No usable schemas were found in the OpenAPI document.');
                return;
            }

            fs.writeFileSync(path.join(this.workspaceRoot, 'class_data.json'), JSON.stringify(result.entities, null, 2), 'utf-8');
            void this.panel.webview.postMessage({
                type: 'jsonLoaded',
                fileName: `${path.basename(fileUri[0].fsPath)} (OpenAPI)`,
                entities: result.entities.map((ent) => ({
                    name: ent.name,
                    fields: ent.attributes.map((a) => `${a.name}: ${a._type}`),
                    relations: [...ent.manyToOneRelationships.map((r) => `belongsTo: ${r.comodel}`), ...ent.oneToManyRelationships.map((r) => `hasMany: ${r.comodel}`)],
                })),
            });
            if (result.skipped.length > 0) {
                vscode.window.showInformationMessage(`OpenAPI imported. Skipped ${result.skipped.length} schema(s): ${result.skipped.join(', ')}`);
            }
        } catch (e: unknown) {
            this.notice('err', `Invalid OpenAPI JSON: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private async handleImportJson(): Promise<void> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: { JSON: ['json'] },
            title: 'Select class_data.json file',
        });
        if (!fileUri || fileUri.length === 0) {
            return;
        }

        try {
            const parsed = JSON.parse(fs.readFileSync(fileUri[0].fsPath, 'utf-8'));
            fs.writeFileSync(path.join(this.workspaceRoot, 'class_data.json'), JSON.stringify(parsed, null, 2), 'utf-8');
            void this.panel.webview.postMessage({ type: 'jsonLoaded', fileName: path.basename(fileUri[0].fsPath), entities: this.extractEntitiesFromJson(parsed) });
        } catch (e: unknown) {
            this.notice('err', `Invalid JSON file: ${e instanceof Error ? e.message : String(e)}`);
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
                for (const r of rels ?? []) {
                    relations.push(`${relKey.replace('Relationships', '')}: ${r.comodel || r.relatedModel}`);
                }
            }
            for (const relKey of ['compositions', 'aggregations']) {
                const rels = cls[relKey] as Array<Record<string, string>> | undefined;
                for (const r of rels ?? []) {
                    if (r._type || r.comodel) {
                        relations.push(`${relKey}: ${r._type || r.comodel}`);
                    }
                }
            }

            entities.push({ name, fields, relations });
        }

        return entities;
    }

    private async handlePreviewCode(config: EntityConfig): Promise<void> {
        const blocker = this.previewBlocker();
        if (blocker) {
            this.postUnavailable(blocker.message, blocker.command);
            return;
        }

        const outcome = await this.bridge.plan(schemaFromConfig(config), flagsFromConfig(config));
        if (!outcome) {
            return;
        }

        if (outcome.state === 'ready') {
            rememberPlanned(outcome.plan.files);
            void this.panel.webview.postMessage({ type: 'previewCodeResult', state: 'ready', files: outcome.plan.files, warnings: outcome.plan.warnings });
            return;
        }

        if (outcome.state === 'invalid') {
            void this.panel.webview.postMessage({ type: 'previewCodeResult', state: 'invalid', message: outcome.error.message, hint: outcome.error.hint });
            return;
        }

        this.describeUnavailable(outcome);
    }

    private previewBlocker(): { message: string; command?: string } | undefined {
        if (this.packageState.kind === 'notDeclared') {
            const message = usesLegacyLine(this.workspaceRoot) ? t('package.missingLegacyLaravel', readLaravelMajor(this.workspaceRoot) ?? '') : t('package.missing');
            return { message, command: requirePackageCommand(this.workspaceRoot) };
        }
        if (this.packageState.kind === 'notInstalled') {
            return { message: t('preview.notInstalled'), command: 'composer install' };
        }
        if (this.packageState.preview === 'tooOld') {
            return {
                message: t('preview.tooOld', this.packageState.version, PREVIEW_MIN_VERSION),
                command: 'composer update nameless/laravel-api-generator -W',
            };
        }
        return undefined;
    }

    private describeUnavailable(outcome: Extract<PreviewOutcome, { state: 'unavailable' }>): void {
        if (outcome.reason === 'phpNotFound') {
            const hasSail = fs.existsSync(path.join(this.workspaceRoot, 'vendor', 'bin', 'sail'));
            this.pendingCommand = undefined;
            void this.panel.webview.postMessage({
                type: 'previewCodeResult',
                state: 'unavailable',
                message: hasSail ? t('preview.phpNotFoundSail') : t('preview.phpNotFound'),
                useSail: hasSail,
            });
            return;
        }

        const message =
            outcome.reason === 'protocolMismatch' ? t('preview.extensionTooOld') : outcome.reason === 'timeout' ? t('preview.timeout') : t('preview.bootFailed', outcome.detail);
        this.postUnavailable(message);
    }

    private postUnavailable(message: string, command?: string): void {
        this.pendingCommand = command;
        void this.panel.webview.postMessage({ type: 'previewCodeResult', state: 'unavailable', message, command });
    }

    private async announceCapabilities(): Promise<void> {
        if (this.previewBlocker()) {
            void this.panel.webview.postMessage({ type: 'capabilities', modifiers: false });
            return;
        }
        const handshake = await this.bridge.capabilities();
        if (!handshake) {
            return;
        }
        this.handshakeOk = true;
        void this.panel.webview.postMessage({
            type: 'capabilities',
            fieldTypes: handshake.capabilities.fieldTypes,
            jsonApi: handshake.capabilities.options.json_api,
            modifiers: this.usesSchemaGeneration(),
        });
    }

    private watchRestartTriggers(): vscode.Disposable[] {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceRoot, '{vendor/composer/installed.json,.env,config/**/*.php}'));
        const restart = () => this.restartPreview();
        return [watcher, watcher.onDidChange(restart), watcher.onDidCreate(restart), watcher.onDidDelete(restart)];
    }

    private restartPreview(): void {
        this.packageState = detectPackageState(this.workspaceRoot, LaravelDetector.isPackageInstalled(this.workspaceRoot));
        this.handshakeOk = false;
        this.bridge.restart();
        void this.announceCapabilities();
        void this.panel.webview.postMessage({ type: 'refreshPreview' });
    }

    private async handlePreviewAction(action: string | undefined): Promise<void> {
        if (action === 'runCommand' && this.pendingCommand) {
            const terminal = vscode.window.createTerminal({ name: 'Laravel API Generator', cwd: this.workspaceRoot });
            terminal.sendText(this.pendingCommand);
            terminal.show();
            return;
        }
        if (action === 'useSail') {
            await vscode.workspace.getConfiguration('laravelApiGenerator').update('phpCommand', ['./vendor/bin/sail', 'php'], vscode.ConfigurationTarget.Workspace);
        }
    }

    private dispose(): void {
        GeneratorPanel.currentPanel = undefined;
        this.actions.dispose();
        this.bridge.dispose();
        this.panel.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }
}
