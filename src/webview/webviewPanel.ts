import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getBuilderHtml } from './builderContent';
import { ProjectActions, readyData } from './projectActions';
import { ArtisanRunner } from '../services/artisanRunner';
import { classDataRows, classDataSchema } from '../services/classData';
import { DraftStore } from '../services/drafts';
import { addFieldsSpec, EditableEntity, editableEntity } from '../services/entityEdit';
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
    MCP_TOOLS_MIN_VERSION,
    supportsMcpTools,
} from '../services/packageState';
import { flagsFromConfig, schemaFromConfig } from '../services/schemaBuilder';
import { StubRow, stubLine } from '../services/stubReport';
import { LaravelDetector } from '../services/laravelDetector';
import { parseOpenApi } from '../services/openApiImporter';
import { analyzeError, analyzeProtocolErrors, presentSuggestion } from '../services/errorAnalyzer';
import { outputChannel } from '../services/outputLog';
import { openPlanned, openPlannedDiff, openPlannedDiffs, rememberPlanned } from '../services/plannedContent';
import { ArtisanResult, EntityConfig, Field, FIELD_TYPES, GenerationDocument, ProtocolMessage } from '../types';
import { FlowPanel } from './flowPanel';
import { confirmSanctum, ensureEnvReady, STUBS_PATH } from './projectActions';
import { t, tn, getLocale, webviewStrings } from '../i18n';
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
    state?: unknown;
    entity?: string;
    fields?: Field[];
}

export class GeneratorPanel {
    public static currentPanel: GeneratorPanel | undefined;
    private static drafts: DraftStore | undefined;
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
    private pendingClassData: { label: string; data: unknown } | undefined;
    private stopRequested = false;
    private generating = false;
    private writing = false;
    private run = 0;
    private disposed = false;
    private static writtenClassData = new Map<string, string>();
    private blocked = false;

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private workspaceRoot: string,
        private edit: EditableEntity | undefined
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

    static useDrafts(drafts: DraftStore): void {
        GeneratorPanel.drafts = drafts;
    }

    static show(extensionUri: vscode.Uri, workspaceRoot: string, onDidGenerate?: () => void, edit?: EditableEntity): void {
        const current = GeneratorPanel.currentPanel;
        if (current) {
            current.panel.reveal(vscode.ViewColumn.One);
            current.onDidGenerate = onDidGenerate;
            current.setEdit(edit);
            return;
        }

        const panel = vscode.window.createWebviewPanel('laravelApiGenerator', t('builder.tabTitle'), vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        });

        GeneratorPanel.currentPanel = new GeneratorPanel(panel, extensionUri, workspaceRoot, edit);
        GeneratorPanel.currentPanel.onDidGenerate = onDidGenerate;
    }

    private setEdit(edit: EditableEntity | undefined): void {
        if (this.disposed) {
            return;
        }
        this.edit = edit;
        this.panel.title = edit ? t('builder.editTabTitle', edit.name) : t('builder.tabTitle');
        void this.panel.webview.postMessage({ type: 'mode', edit: edit ?? null });
    }

    /** After its fields were added, the entity shows them locked like the others. */
    private reloadEdit(entity: string): void {
        const fresh = this.edit?.name === entity ? editableEntity(this.workspaceRoot, entity) : undefined;
        if (fresh && JSON.stringify(fresh) !== JSON.stringify(this.edit)) {
            this.setEdit(fresh);
        }
    }

    private html(): string {
        const webview = this.panel.webview;
        const asset = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview', file)).toString();
        return getBuilderHtml({
            cspSource: webview.cspSource,
            nonce: crypto.randomBytes(16).toString('hex'),
            lang: getLocale(),
            title: this.edit ? t('builder.editTabTitle', this.edit.name) : t('builder.tabTitle'),
            styles: [asset('kit.css'), asset('ready.css'), asset('builder.css')],
            scripts: [asset('common.js'), asset('ready.js'), asset('builder.js')],
            boot: {
                locale: getLocale(),
                strings: webviewStrings('builder', 'ready', 'status'),
                icons: iconSet(),
                fieldTypes: [...FIELD_TYPES],
                models: this.listModelNames(),
                modifiers: this.packageState.kind === 'installed' && this.packageState.preview !== 'tooOld',
                mcp: supportsMcpTools(this.workspaceRoot) ? { supported: true } : { supported: false, reason: t('builder.mcpNeedsPackage', MCP_TOOLS_MIN_VERSION) },
                draft: GeneratorPanel.drafts?.read('builder', this.workspaceRoot) ?? null,
                edit: this.edit ?? null,
            },
        });
    }

    private async handleMessage(message: BuilderMessage): Promise<void> {
        if (await this.actions.handle(message)) {
            return;
        }
        switch (message.type) {
            case 'generate':
                if (message.payload && !this.generating) {
                    const run = ++this.run;
                    this.generating = true;
                    try {
                        await this.handleGenerate(message.payload, () => run !== this.run);
                    } catch (error) {
                        if (run === this.run) {
                            this.postFailure(error instanceof Error ? error.message : String(error));
                        }
                    } finally {
                        if (run === this.run) {
                            this.generating = false;
                        }
                    }
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
            case 'loaded':
                // A reloaded webview boots from the HTML written when the panel opened.
                if ((this.edit?.name ?? '') !== (message.name ?? '')) {
                    this.setEdit(this.edit);
                }
                break;
            case 'draft':
                GeneratorPanel.drafts?.write('builder', this.workspaceRoot, message.state);
                break;
            case 'reviewAddFields':
                if (message.entity && message.fields) {
                    this.reviewAddFields(message.entity, message.fields);
                }
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
                this.stopRequested = true;
                this.artisan.cancelAll();
                if (!this.generating) {
                    void this.panel.webview.postMessage({ type: 'clearAllLoading' });
                } else if (!this.writing) {
                    // Still asking its questions: no process is there to answer, so the run ends here.
                    this.run++;
                    this.generating = false;
                    this.postCancelled(t('generate.cancelled'));
                }
                // A generation that is writing answers by itself once its process is gone.
                break;
        }
    }

    private async handleMenu(action: string | undefined): Promise<void> {
        if (action === 'projectActions') {
            await vscode.commands.executeCommand('laravelApiGenerator.projectActions');
        } else if (action === 'newApi') {
            this.setEdit(undefined);
        } else if (action === 'snippets') {
            await vscode.commands.executeCommand('laravelApiGenerator.showSnippets');
        } else if (action === 'customizeStubs') {
            await this.customizeStubs();
        }
    }

    private reviewAddFields(entity: string, fields: Field[]): void {
        const spec = addFieldsSpec(fields);
        if (spec === '') {
            return;
        }
        FlowPanel.plan(this.extensionUri, this.workspaceRoot, { kind: 'addFields', entity, fields: spec }, () => {
            this.onDidGenerate?.();
            this.reloadEdit(entity);
        });
    }

    private notice(tone: 'ok' | 'warn' | 'err' | 'info', text: string, title = ''): void {
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

    private async handleGenerate(config: EntityConfig, abandoned: () => boolean): Promise<void> {
        const started = Date.now();
        this.stopRequested = false;
        if (this.packageState.kind !== 'installed') {
            this.postCancelled(this.previewBlocker()?.message ?? t('package.missing'));
            return;
        }
        const stubsDir = path.join(this.workspaceRoot, ...STUBS_PATH.split('/'));
        if (fs.existsSync(stubsDir) && (await this.checkCustomStubsValid())) {
            return;
        }
        if (abandoned()) {
            return;
        }

        const check = await this.overwriteCheck(config);
        if (abandoned()) {
            return;
        }
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
                this.postCancelled(t('generate.cancelledOverwrite'));
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
                this.postCancelled(t('generate.cancelledOverwrite'));
                return;
            }
        }

        if (config.options.auth) {
            const sanctum = await confirmSanctum(this.workspaceRoot);
            if (abandoned()) {
                return;
            }
            if (sanctum === 'installing' || sanctum === 'cancel') {
                this.postCancelled(sanctum === 'installing' ? t('package.sanctumInstallStarted') : t('generate.cancelled'));
                return;
            }
            if (sanctum === 'withoutAuth') {
                config = { ...config, options: { ...config.options, auth: false } };
            }
        }

        if (config.options.queryBuilder) {
            void LaravelDetector.promptQueryBuilderInstallIfMissing(this.workspaceRoot);
        }

        const legacyRelations = !this.usesSchemaGeneration() && (config.relationships?.length ?? 0) > 0;
        if (legacyRelations && !(await this.confirmClassDataOverwrite(config.name))) {
            if (!abandoned()) {
                this.postCancelled(t('generate.cancelledOverwrite'));
            }
            return;
        }
        if (abandoned()) {
            return;
        }

        let result: ArtisanResult & { protocolErrors?: ProtocolMessage[]; document?: GenerationDocument };
        this.writing = true;
        try {
            if (this.usesSchemaGeneration()) {
                result = await this.generateThroughSchema(config, force);
            } else if (legacyRelations) {
                result = await this.generateWithRelationships(config);
            } else {
                result = await this.artisan.generate(config);
            }
        } finally {
            this.writing = false;
        }

        if (!result.success) {
            if (this.stopRequested) {
                this.postCancelled(t('generate.stopped'));
                return;
            }
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
        GeneratorPanel.drafts?.clear('builder', this.workspaceRoot);
        await this.panel.webview.postMessage({ type: 'showReady', data });
        this.onDidGenerate?.();
        void this.actions.refreshRoutes(data.routes.length > 0 ? [config.name] : []);
    }

    private postFailure(output: string): void {
        void this.panel.webview.postMessage({ type: 'generationResult', success: false, output, errors: [] });
    }

    private postCancelled(text: string): void {
        void this.panel.webview.postMessage({ type: 'generationCancelled', text });
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
    /** Packages without schema generation read relations from class_data.json, which may be a file of the project. */
    private async confirmClassDataOverwrite(entity: string): Promise<boolean> {
        const file = path.join(this.workspaceRoot, 'class_data.json');
        if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') === GeneratorPanel.writtenClassData.get(this.workspaceRoot)) {
            return true;
        }
        const overwriteLabel = t('generate.overwrite');
        const choice = await vscode.window.showWarningMessage(t('generate.classDataOverwrite', entity), { modal: true }, overwriteLabel);
        return choice === overwriteLabel;
    }

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

        const content = JSON.stringify(classData, null, 2);
        fs.writeFileSync(path.join(this.workspaceRoot, 'class_data.json'), content, 'utf-8');
        GeneratorPanel.writtenClassData.set(this.workspaceRoot, content);

        return this.artisan.generateFromJson(config.onlyTypes, {
            queryBuilder: config.options.queryBuilder,
            pest: config.options.pest,
            jsonApi: config.options.jsonApi,
            mcp: config.options.mcp,
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
            this.postCancelled(t('generate.fixStubsCancelled'));
            return true;
        }
        if (action === anywayLabel) {
            return false;
        }
        this.postCancelled(t('generate.stubsCancelled'));
        return true;
    }

    private async customizeStubs(): Promise<void> {
        const stubsDir = path.join(this.workspaceRoot, ...STUBS_PATH.split('/'));
        const alreadyPublished = fs.existsSync(stubsDir);

        if (alreadyPublished) {
            const openLabel = t('stubs.openFolder');
            const resetLabel = t('stubs.resetToDefaults');
            const choice = await vscode.window.showInformationMessage(t('stubs.alreadyPublished'), openLabel, resetLabel);
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

    /**
     * The imported classes go to the review screen as a schema, so nothing is
     * written before the plan is accepted. A package without dry run, or a
     * class that extends another, still needs class_data.json in the project:
     * that file is written only once the user agrees.
     */
    private async handleGenerateJson(): Promise<void> {
        const pending = this.pendingClassData;
        if (!pending) {
            return;
        }

        const { schema, inherited } = classDataSchema(pending.data);
        if (this.usesSchemaGeneration() && inherited.length === 0 && Object.keys(schema.entities).length > 0) {
            this.pendingClassData = undefined;
            void this.panel.webview.postMessage({ type: 'jsonGenerateResult', success: true, reviewing: true });
            FlowPanel.plan(this.extensionUri, this.workspaceRoot, { kind: 'inline', text: JSON.stringify(schema), label: pending.label }, () => this.onDidGenerate?.());
            return;
        }

        const writeLabel = t('builder.jsonWrite');
        const choice = await vscode.window.showWarningMessage(tn('builder.jsonWriteConfirm', classDataRows(pending.data).length), { modal: true }, writeLabel);
        if (choice !== writeLabel) {
            void this.panel.webview.postMessage({ type: 'jsonGenerateResult', cancelled: true });
            return;
        }

        this.pendingClassData = undefined;
        fs.writeFileSync(path.join(this.workspaceRoot, 'class_data.json'), JSON.stringify(pending.data, null, 2), 'utf-8');
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
                this.notice('warn', t('builder.openApiEmpty'));
                return;
            }

            this.pendingClassData = { label: path.basename(fileUri[0].fsPath), data: result.entities };
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
                vscode.window.showInformationMessage(tn('flow.skipped', result.skipped.length, result.skipped.join(', ')));
            }
        } catch (e: unknown) {
            this.notice('err', t('builder.openApiInvalid', e instanceof Error ? e.message : String(e)));
        }
    }

    private async handleImportJson(): Promise<void> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: { JSON: ['json'] },
            title: t('builder.jsonPickTitle'),
        });
        if (!fileUri || fileUri.length === 0) {
            return;
        }

        try {
            const parsed = JSON.parse(fs.readFileSync(fileUri[0].fsPath, 'utf-8'));
            this.pendingClassData = { label: path.basename(fileUri[0].fsPath), data: parsed };
            void this.panel.webview.postMessage({ type: 'jsonLoaded', fileName: path.basename(fileUri[0].fsPath), entities: this.extractEntitiesFromJson(parsed) });
        } catch (e: unknown) {
            this.notice('err', t('builder.jsonInvalid', e instanceof Error ? e.message : String(e)));
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
            this.postUnavailable(blocker.message, blocker.command, this.packageState.kind !== 'installed');
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

    /** `blocking` when nothing can be generated either, as long as the package is missing. */
    private postUnavailable(message: string, command?: string, blocking = false): void {
        this.pendingCommand = command;
        void this.panel.webview.postMessage({ type: 'previewCodeResult', state: 'unavailable', message, command, blocking });
    }

    private async announceCapabilities(): Promise<void> {
        const blocker = this.previewBlocker();
        if (blocker) {
            void this.panel.webview.postMessage({ type: 'capabilities', modifiers: false });
            // Without the package the builder says so before a field is typed.
            if (this.packageState.kind !== 'installed') {
                this.blocked = true;
                this.postUnavailable(blocker.message, blocker.command, true);
            }
            return;
        }
        if (this.blocked) {
            this.blocked = false;
            void this.panel.webview.postMessage({ type: 'previewCodeResult', state: 'idle' });
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
            mcp: handshake.capabilities.options.mcp ?? { supported: false, reason: t('builder.mcpNeedsPackage', MCP_TOOLS_MIN_VERSION) },
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
        this.disposed = true;
        GeneratorPanel.currentPanel = undefined;
        this.actions.dispose();
        this.bridge.dispose();
        this.panel.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }
}
