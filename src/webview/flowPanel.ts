import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ArtisanRunner } from '../services/artisanRunner';
import { failureExcerpt } from '../services/commandSummary';
import { describePrompt, extractSchema, ModelErrorLink, preferredModels, readableModelError } from '../services/describePrompt';
import { EntityScanner } from '../services/entityScanner';
import { analyzeProtocolErrors, presentSuggestion } from '../services/errorAnalyzer';
import { LaravelDetector } from '../services/laravelDetector';
import { PREVIEW_MIN_VERSION, readInstalledVersion, versionSupport } from '../services/packageState';
import { openPlanned, openPlannedDiff, openPlannedDiffs, rememberPlanned } from '../services/plannedContent';
import { planView } from '../services/planView';
import { parseSchemaDraft } from '../services/schemaDraft';
import { DEFAULT_FLOW_OPTIONS, FlowOptions, GenerationDocument, GenerationSource } from '../types';
import { specLabel } from '../services/projectInfo';
import { getLocale, t, tn, webviewStrings } from '../i18n';
import { isUnsupportedOption } from '../commands/generationShared';
import { confirmSanctum, ProjectActions, readyData, StepId } from './projectActions';
import { iconSet } from './ui/icons';
import { renderPage } from './ui/page';

interface FlowMessage {
    type: string;
    text?: string;
    context?: boolean;
    model?: string;
    url?: string;
    name?: string;
    options?: Partial<FlowOptions>;
    path?: string;
    paths?: string[];
    id?: StepId;
}

interface Draft {
    text: string;
    model: string;
    durationMs: number;
    document?: vscode.TextDocument;
}

export interface PlanHeader {
    icon: string;
    chip: string;
    mono: boolean;
    meta: string;
}

const OPTION_KEYS: Array<keyof FlowOptions> = ['pest', 'postman', 'auth', 'queryBuilder', 'jsonApi'];

/** Chat models appear in VS Code 1.90; older editors have no `vscode.lm`. */
function languageModels(): typeof vscode.lm | undefined {
    const api = vscode as Partial<typeof vscode>;
    return api.lm && typeof api.lm.selectChatModels === 'function' && api.LanguageModelChatMessage ? api.lm : undefined;
}

/**
 * One panel for the sources that describe several entities: the Copilot
 * description, the review of the package's dry run, then the ready screen.
 */
export class FlowPanel {
    private static current: FlowPanel | undefined;

    private readonly panel: vscode.WebviewPanel;
    private readonly actions: ProjectActions;
    private readonly planner: ArtisanRunner;
    private readonly writer: ArtisanRunner;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly queue: unknown[] = [];
    private loaded = false;
    private disposed = false;
    private source: GenerationSource | undefined;
    private options: FlowOptions = { ...DEFAULT_FLOW_OPTIONS };
    private planRun = 0;
    private generating = false;
    private request: vscode.CancellationTokenSource | undefined;
    private draft: Draft | undefined;
    private draftTimer: ReturnType<typeof setTimeout> | undefined;
    private errorLinks: ModelErrorLink[] = [];
    private onDidGenerate: (() => void) | undefined;

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly root: string
    ) {
        this.panel = panel;
        this.planner = new ArtisanRunner(root);
        this.writer = new ArtisanRunner(root);
        this.actions = new ProjectActions(root, (message) => this.post(message), () => this.onDidGenerate?.());
        this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon-dark.png');
        this.panel.webview.html = this.html();
        this.disposables.push(
            this.panel.webview.onDidReceiveMessage((message: FlowMessage) => void this.handle(message)),
            this.panel.onDidDispose(() => this.dispose()),
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (this.draft?.document && event.document === this.draft.document) {
                    this.draft.text = event.document.getText();
                    clearTimeout(this.draftTimer);
                    this.draftTimer = setTimeout(() => this.postProposal(), 300);
                }
            })
        );
    }

    static describe(extensionUri: vscode.Uri, root: string, onDidGenerate: () => void): void {
        FlowPanel.open(extensionUri, root, onDidGenerate).showDescribe();
    }

    static plan(extensionUri: vscode.Uri, root: string, source: GenerationSource, onDidGenerate: () => void, options: Partial<FlowOptions> = {}): void {
        void FlowPanel.open(extensionUri, root, onDidGenerate).startPlan(source, options);
    }

    static projectActions(extensionUri: vscode.Uri, root: string, onDidChange: () => void): void {
        FlowPanel.open(extensionUri, root, onDidChange).showActions();
    }

    private static open(extensionUri: vscode.Uri, root: string, onDidGenerate: () => void): FlowPanel {
        const current = FlowPanel.current;
        if (current && current.root === root) {
            current.onDidGenerate = onDidGenerate;
            current.panel.reveal(vscode.ViewColumn.One);
            return current;
        }
        current?.panel.dispose();

        const panel = vscode.window.createWebviewPanel('laravelApiGenerator.flow', t('flow.panelPlan'), vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        });
        const flow = new FlowPanel(panel, extensionUri, root);
        flow.onDidGenerate = onDidGenerate;
        FlowPanel.current = flow;
        return flow;
    }

    private html(): string {
        const webview = this.panel.webview;
        const asset = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview', file)).toString();
        return renderPage({
            cspSource: webview.cspSource,
            nonce: crypto.randomBytes(16).toString('hex'),
            lang: getLocale(),
            title: t('flow.panelPlan'),
            styles: [asset('kit.css'), asset('ready.css'), asset('flow.css')],
            scripts: [asset('common.js'), asset('ready.js'), asset('flow.js')],
            body: '<div id="app" class="app"></div>',
            bodyClass: 'flow-view',
            boot: {
                locale: getLocale(),
                strings: webviewStrings('flow', 'ready', 'builder', 'describe'),
                icons: iconSet(),
            },
        });
    }

    private post(message: unknown): void {
        if (this.disposed) {
            return;
        }
        if (!this.loaded) {
            this.queue.push(message);
            return;
        }
        void this.panel.webview.postMessage(message);
    }

    private async handle(message: FlowMessage): Promise<void> {
        if (message.type === 'loaded') {
            this.loaded = true;
            for (const queued of this.queue.splice(0)) {
                void this.panel.webview.postMessage(queued);
            }
            return;
        }
        if (await this.actions.handle(message)) {
            return;
        }
        switch (message.type) {
            case 'describe:models':
                await this.announceModels();
                break;
            case 'describe:send':
                if (message.text && message.text.trim() !== '') {
                    await this.draftSchema(message.text, message.context !== false, message.model);
                }
                break;
            case 'describe:stop':
                this.request?.cancel();
                break;
            case 'describe:link': {
                const link = this.errorLinks.find((candidate) => candidate.url === message.url);
                if (link) {
                    await vscode.env.openExternal(vscode.Uri.parse(link.url, true));
                }
                break;
            }
            case 'describe:yaml':
                await this.openDraft(message.name);
                break;
            case 'describe:review':
                if (this.draft) {
                    await this.startPlan({ kind: 'describe', text: this.draft.text });
                }
                break;
            case 'describe:save':
            case 'plan:save':
                if (this.draft) {
                    await this.saveDraft(this.draft.text);
                }
                break;
            case 'plan:back':
                this.planRun++;
                this.planner.cancelAll();
                this.showDescribe();
                break;
            case 'plan:options':
                this.options = { ...this.options, ...message.options };
                await this.plan();
                break;
            case 'plan:retry':
                await this.plan();
                break;
            case 'plan:generate':
                await this.generate();
                break;
            case 'plan:cancel':
                this.panel.dispose();
                break;
            case 'plan:open':
                if (message.path) {
                    await openPlanned(message.path);
                }
                break;
            case 'plan:diff':
                if (message.path) {
                    await openPlannedDiff(this.root, message.path);
                }
                break;
            case 'plan:diffs':
                await openPlannedDiffs(this.root, message.paths ?? []);
                break;
            case 'plan:updatePackage':
                this.terminal('composer update nameless/laravel-api-generator -W');
                break;
        }
    }

    private showDescribe(): void {
        this.panel.title = t('flow.panelDescribe');
        this.source = undefined;
        this.post({ type: 'screen', screen: 'describe', existing: this.existingEntities() });
        void this.announceModels();
    }

    private showActions(): void {
        this.panel.title = t('ready.titleActions');
        const data = readyData(this.root, undefined);
        this.post({ type: 'showReady', data });
        void this.actions.refreshRoutes(data.entities);
    }

    private existingEntities(): string[] {
        return new EntityScanner(this.root).scan().map((entity) => entity.name);
    }

    private async announceModels(): Promise<void> {
        const lm = languageModels();
        if (!lm) {
            this.post({ type: 'describe:models', models: [], note: t('describe.noApi') });
            return;
        }
        let models: vscode.LanguageModelChat[] = [];
        try {
            models = preferredModels(await lm.selectChatModels());
        } catch {
            models = [];
        }
        this.post({
            type: 'describe:models',
            models: models.map((model) => ({ id: model.id, name: model.name, vendor: model.vendor })),
            note: models.length === 0 ? t('describe.noModel') : undefined,
        });
    }

    private async draftSchema(text: string, useContext: boolean, modelId: string | undefined): Promise<void> {
        const lm = languageModels();
        if (!lm) {
            this.post({ type: 'describe:failed', message: t('describe.noApi') });
            return;
        }
        let model: vscode.LanguageModelChat | undefined;
        try {
            model = (modelId ? await lm.selectChatModels({ id: modelId }) : [])[0] ?? preferredModels(await lm.selectChatModels())[0];
        } catch {
            model = undefined;
        }
        if (!model) {
            this.post({ type: 'describe:failed', message: t('describe.noModel') });
            return;
        }

        this.request?.cancel();
        const request = new vscode.CancellationTokenSource();
        this.request = request;
        this.post({ type: 'describe:drafting', model: model.name });

        const started = Date.now();
        let answer = '';
        try {
            const prompt = describePrompt(text, useContext ? this.existingEntities() : []);
            const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, request.token);
            for await (const part of response.text) {
                answer += part;
            }
        } catch (error) {
            if (!request.token.isCancellationRequested) {
                const { text: reason, links } = readableModelError(error instanceof Error ? error.message : String(error));
                this.errorLinks = links;
                this.post({ type: 'describe:failed', message: t('describe.failed', reason), links });
                return;
            }
        } finally {
            if (this.request === request) {
                this.request = undefined;
            }
            request.dispose();
        }
        if (request.token.isCancellationRequested) {
            this.post({ type: 'describe:stopped' });
            return;
        }
        if (answer.trim() === '') {
            this.post({ type: 'describe:failed', message: t('describe.empty') });
            return;
        }

        this.draft = { text: extractSchema(answer), model: model.name, durationMs: Date.now() - started };
        this.postProposal();
    }

    private postProposal(): void {
        const draft = this.draft;
        if (!draft) {
            return;
        }
        const entities = parseSchemaDraft(draft.text);
        const existing = new Set(this.existingEntities());
        if (!entities) {
            this.post({ type: 'describe:proposed', parsed: false, model: draft.model, durationMs: draft.durationMs });
            return;
        }
        const proposed = new Set(entities.map((entity) => entity.name));
        const related = [
            ...new Set(entities.flatMap((entity) => entity.relations.map((relation) => relation.target)).filter((target) => existing.has(target) && !proposed.has(target))),
        ];
        this.post({
            type: 'describe:proposed',
            parsed: true,
            entities: entities.map((entity) => ({ ...entity, status: existing.has(entity.name) ? 'changed' : 'new' })),
            related,
            model: draft.model,
            durationMs: draft.durationMs,
        });
    }

    private async openDraft(entity: string | undefined): Promise<void> {
        const draft = this.draft;
        if (!draft) {
            return;
        }
        if (!draft.document || draft.document.isClosed) {
            draft.document = await vscode.workspace.openTextDocument({ language: 'yaml', content: draft.text });
        }
        const editor = await vscode.window.showTextDocument(draft.document, { viewColumn: vscode.ViewColumn.Beside, preview: false });
        const line = entity ? parseSchemaDraft(draft.document.getText())?.find((candidate) => candidate.name === entity)?.line : undefined;
        if (line !== undefined) {
            const position = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }
    }

    private async saveDraft(text: string): Promise<void> {
        const target = path.join(this.root, 'api-schema.yaml');
        if (fs.existsSync(target)) {
            const replace = t('describe.replace');
            const answer = await vscode.window.showWarningMessage(t('describe.exists'), { modal: true }, replace);
            if (answer !== replace) {
                return;
            }
        }
        fs.writeFileSync(target, text, 'utf-8');
        await vscode.window.showTextDocument(vscode.Uri.file(target), { viewColumn: vscode.ViewColumn.Beside, preview: false });
        this.post({ type: 'notice', tone: 'ok', text: t('flow.saved', 'api-schema.yaml') });
    }

    private async startPlan(source: GenerationSource, options: Partial<FlowOptions> = {}): Promise<void> {
        this.source = source;
        this.options = { ...DEFAULT_FLOW_OPTIONS, ...options, force: false };
        this.panel.title = t('flow.panelPlan');
        await this.plan();
    }

    private async plan(): Promise<void> {
        const source = this.source;
        if (!source) {
            return;
        }
        const run = ++this.planRun;
        const base = { type: 'plan', header: this.header(source), options: this.optionsView(source), canBack: source.kind === 'describe', canSave: source.kind === 'describe' };

        const version = readInstalledVersion(this.root);
        if (version !== null && versionSupport(version, PREVIEW_MIN_VERSION) === 'tooOld') {
            this.post({ ...base, state: 'failed', message: t('flow.tooOld', version.replace(/^v/, ''), PREVIEW_MIN_VERSION), update: true });
            return;
        }

        this.post({ ...base, state: 'checking' });
        this.planner.cancelAll();
        const { result, document } = await this.planner.runSource(source, this.options, true);
        if (run !== this.planRun) {
            return;
        }

        if (!document) {
            this.post({ ...base, state: 'failed', message: failureExcerpt(result.output || result.errors.join('\n')), update: isUnsupportedOption(result) });
            return;
        }
        if (document.errors.length > 0) {
            this.post({
                ...base,
                state: 'failed',
                message: document.errors.map((error) => error.message).join('\n'),
                hint: document.errors.flatMap((error) => (error.hint ? [error.hint] : [])).join('\n'),
            });
            const suggestion = analyzeProtocolErrors(document.errors);
            if (suggestion) {
                void presentSuggestion(this.root, suggestion);
            }
            return;
        }

        rememberPlanned(document.files);
        this.post({ ...base, header: this.header(source, document), state: 'ready', view: planView(document) });
    }

    private optionsView(source: GenerationSource): { values: FlowOptions; available: Array<keyof FlowOptions> } {
        return { values: this.options, available: [...OPTION_KEYS, ...(source.kind === 'database' ? (['withMigrations'] as const) : [])] };
    }

    private header(source: GenerationSource, document?: GenerationDocument): PlanHeader {
        switch (source.kind) {
            case 'schema':
                return { icon: 'fileCode', chip: path.basename(source.path), mono: true, meta: t('flow.srcSchema') };
            case 'mermaid':
                return { icon: 'mermaid', chip: path.basename(source.path), mono: true, meta: t('flow.srcMermaid') };
            case 'openapi': {
                let label = t('flow.srcOpenapi');
                try {
                    label = specLabel(fs.readFileSync(source.path, 'utf-8')) ?? label;
                } catch {
                    // The dry run reports an unreadable spec.
                }
                const view = document ? planView(document) : undefined;
                const read = view ? view.entities.length + view.skipped.length : undefined;
                return { icon: 'openapi', chip: path.basename(source.path), mono: true, meta: read !== undefined ? `${label} · ${tn('flow.schemasRead', read)}` : label };
            }
            case 'database':
                return { icon: 'database', chip: t('flow.srcDatabase'), mono: false, meta: tn('flow.tables', source.tables.length) };
            case 'describe':
                return { icon: 'sparkle', chip: t('flow.srcDescribe'), mono: false, meta: this.draft?.model ?? '' };
        }
    }

    private async generate(): Promise<void> {
        const source = this.source;
        if (!source || this.generating) {
            return;
        }

        if (this.options.auth) {
            const sanctum = await confirmSanctum(this.root);
            if (sanctum === 'installing' || sanctum === 'cancel') {
                if (sanctum === 'installing') {
                    this.post({ type: 'notice', tone: 'warn', text: t('package.sanctumInstallStarted') });
                }
                return;
            }
            if (sanctum === 'withoutAuth') {
                this.options = { ...this.options, auth: false };
            }
        }
        if (this.options.queryBuilder) {
            void LaravelDetector.promptQueryBuilderInstallIfMissing(this.root);
        }

        this.generating = true;
        this.post({ type: 'plan:generating' });
        const started = Date.now();
        const { result, document } = await this.writer.runSource(source, this.options, false);
        this.generating = false;

        if (document && document.errors.length > 0) {
            this.post({ type: 'plan:failed', message: document.errors.map((error) => (error.hint ? `${error.message}\n${error.hint}` : error.message)).join('\n') });
            const suggestion = analyzeProtocolErrors(document.errors);
            if (suggestion) {
                void presentSuggestion(this.root, suggestion);
            }
            return;
        }
        if (!result.success || !document) {
            this.post({ type: 'plan:failed', message: failureExcerpt(result.output || result.errors.join('\n')), update: isUnsupportedOption(result) });
            return;
        }

        const entities = [...new Set(document.files.flatMap((file) => (file.entity ? [file.entity] : [])))];
        const data = readyData(this.root, { entities, files: document.files, durationMs: Date.now() - started, queryBuilder: this.options.queryBuilder });
        this.panel.title = t('flow.panelReady');
        this.post({ type: 'showReady', data });
        this.onDidGenerate?.();
        const routed = document.files.filter((file) => file.kind === 'Controller' && file.action === 'create' && file.entity).map((file) => file.entity as string);
        void this.actions.refreshRoutes(routed);
    }

    private terminal(command: string): void {
        const terminal = vscode.window.createTerminal({ name: 'Laravel API Generator', cwd: this.root });
        terminal.sendText(command);
        terminal.show();
    }

    private dispose(): void {
        this.disposed = true;
        if (FlowPanel.current === this) {
            FlowPanel.current = undefined;
        }
        clearTimeout(this.draftTimer);
        this.request?.cancel();
        this.planner.cancelAll();
        this.actions.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }
}
