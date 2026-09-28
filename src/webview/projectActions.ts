import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ArtisanRunner } from '../services/artisanRunner';
import { failureExcerpt, migrationCount, testSummary } from '../services/commandSummary';
import { analyzeError, presentSuggestion } from '../services/errorAnalyzer';
import { LaravelDetector } from '../services/laravelDetector';
import { logCommand, outputChannel } from '../services/outputLog';
import { openProjectFile } from '../services/plannedContent';
import { EntityScanner } from '../services/entityScanner';
import { estimatedRoutes, RouteRow, routesFromList } from '../services/planView';
import { readManifest } from '../services/manifest';
import { t, tn } from '../i18n';

export type StepId = 'migrate' | 'test' | 'seed' | 'docs' | 'stubs';

export const STUBS_PATH = 'stubs/vendor/laravel-api-generator';

export interface ReadyData {
    mode: 'generated' | 'actions';
    entities: string[];
    files: Array<{ path: string; action: 'create' | 'update' }>;
    routes: RouteRow[];
    durationMs?: number;
    manifest: boolean;
    controller?: string;
    policy?: string;
    queryBuilder: boolean;
    scramble: boolean;
    stubsPublished: boolean;
    stubsPath: string;
    docsPath: string;
    newEntity: boolean;
}

export interface ReadyInput {
    entities: string[];
    files: Array<{ path: string; kind: string; entity?: string; action: string }>;
    durationMs?: number;
    queryBuilder?: boolean;
    newEntity?: boolean;
}

type Post = (message: unknown) => void;

/** Copies .env.example when .env is missing, after asking: every database command needs it. */
export async function ensureEnvReady(root: string): Promise<boolean> {
    const envPath = path.join(root, '.env');
    if (fs.existsSync(envPath)) {
        return true;
    }

    const examplePath = path.join(root, '.env.example');
    const hasExample = fs.existsSync(examplePath);
    const copyLabel = t('env.copyFromExample');
    const choice = await vscode.window.showWarningMessage(t('env.missing'), ...(hasExample ? [copyLabel, t('common.cancel')] : [t('common.cancel')]));

    if (choice === copyLabel && hasExample) {
        try {
            fs.copyFileSync(examplePath, envPath);
            vscode.window.showInformationMessage(t('env.createdFromExample'));
            return true;
        } catch (e: unknown) {
            vscode.window.showErrorMessage(t('env.copyFailed', e instanceof Error ? e.message : String(e)));
        }
    }
    return false;
}

/** Offers to install Sanctum before a generation that protects its routes. */
export async function confirmSanctum(root: string): Promise<'continue' | 'withoutAuth' | 'installing' | 'cancel'> {
    if (LaravelDetector.isSanctumInstalled(root)) {
        return 'continue';
    }
    const installLabel = t('package.installViaComposer');
    const noAuthLabel = t('package.generateWithoutAuth');
    const action = await vscode.window.showWarningMessage(t('package.sanctumMissing'), installLabel, noAuthLabel);
    if (action === installLabel) {
        const terminal = vscode.window.createTerminal({ name: 'Laravel API Generator', cwd: root });
        terminal.sendText('composer require laravel/sanctum');
        terminal.show();
        return 'installing';
    }
    return action === noAuthLabel ? 'withoutAuth' : 'cancel';
}

/** What the ready screen shows right after a generation, or for the project actions. */
export function readyData(root: string, input: ReadyInput | undefined): ReadyData {
    const scanner = new EntityScanner(root);
    const common = {
        manifest: readManifest(root) !== null,
        scramble: LaravelDetector.isScrambleInstalled(root),
        stubsPublished: fs.existsSync(path.join(root, ...STUBS_PATH.split('/'))),
        stubsPath: STUBS_PATH,
        docsPath: '/docs/api',
    };

    if (!input) {
        const entities = scanner.scan();
        return {
            mode: 'actions',
            entities: entities.map((entity) => entity.name),
            files: [],
            routes: entities.flatMap((entity) => estimatedRoutes(entity.name, softDeletes(root, entity.name))),
            queryBuilder: false,
            newEntity: false,
            ...common,
        };
    }

    const written = input.files.filter((file) => file.action === 'create' || file.action === 'update');
    const controllers = input.files.filter((file) => file.kind === 'Controller' && file.action === 'create');
    const routed = controllers.map((file) => file.entity ?? path.basename(file.path, 'Controller.php'));
    const policies = input.files.filter((file) => file.kind === 'Policy');
    return {
        mode: 'generated',
        entities: input.entities,
        files: written.map((file) => ({ path: file.path, action: file.action as 'create' | 'update' })),
        routes: routed.flatMap((entity) => estimatedRoutes(entity, softDeletes(root, entity))),
        durationMs: input.durationMs,
        controller: input.files.find((file) => file.kind === 'Controller')?.path,
        policy: policies.length === 1 ? path.basename(policies[0].path, '.php') : policies.length > 1 ? t('ready.policies') : undefined,
        queryBuilder: input.queryBuilder === true,
        newEntity: input.newEntity === true,
        ...common,
    };
}

function softDeletes(root: string, entity: string): boolean {
    try {
        return /\bSoftDeletes\b/.test(fs.readFileSync(path.join(root, 'app', 'Models', `${entity}.php`), 'utf-8'));
    } catch {
        return false;
    }
}

/** Runs the steps of the ready screen and reports their state to the webview. */
export class ProjectActions {
    private readonly runners = new Map<StepId, ArtisanRunner>();
    private readonly halted = new WeakSet<ArtisanRunner>();
    private readonly server: ArtisanRunner;

    constructor(
        private readonly root: string,
        private readonly post: Post,
        private readonly onDidChange?: () => void
    ) {
        this.server = new ArtisanRunner(root);
    }

    /** True when the message belongs to the ready screen. */
    async handle(message: { type?: string; id?: StepId; path?: string }): Promise<boolean> {
        switch (message.type) {
            case 'step':
                if (message.id) {
                    await this.run(message.id);
                }
                return true;
            case 'stopStep': {
                const runner = message.id ? this.runners.get(message.id) : undefined;
                if (runner) {
                    this.halted.add(runner);
                    runner.cancelAll();
                }
                return true;
            }
            case 'installScramble':
                this.terminal('composer require dedoc/scramble');
                return true;
            case 'openStubsFolder':
                await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(path.join(this.root, ...STUBS_PATH.split('/'))));
                return true;
            case 'openRoutesFile':
                await openProjectFile(this.root, 'routes/api.php');
                return true;
            case 'showOutput':
                outputChannel().show(true);
                return true;
            case 'openFile':
                if (message.path) {
                    await openProjectFile(this.root, message.path);
                }
                return true;
            default:
                return false;
        }
    }

    /** Replaces the estimated routes with the ones Laravel registered. */
    async refreshRoutes(entities: string[]): Promise<void> {
        if (entities.length === 0) {
            return;
        }
        const runner = new ArtisanRunner(this.root);
        let result = await runner.routeList();
        if (!result.success && /does not exist/i.test(result.output) && (await this.cleanOrphanRoutes(runner))) {
            result = await runner.routeList();
        }
        const routes = result.success ? routesFromList(result.output, entities.map((entity) => `${entity}Controller`)) : null;
        if (routes && routes.length > 0) {
            this.post({ type: 'routes', routes });
        }
    }

    /** route:list fails while a route file still names a deleted controller; the package can remove those lines. */
    private async cleanOrphanRoutes(runner: ArtisanRunner): Promise<boolean> {
        const cleanLabel = t('routes.cleanOrphans');
        const choice = await vscode.window.showWarningMessage(t('routes.orphanDetected'), cleanLabel, t('common.cancel'));
        if (choice !== cleanLabel) {
            return false;
        }
        const cleanup = await runner.cleanRoutes();
        logCommand('php artisan api-generator:clean-routes', cleanup.output);
        if (!cleanup.success) {
            return false;
        }
        vscode.window.showInformationMessage(t('routes.cleaned'));
        return true;
    }

    async run(id: StepId): Promise<void> {
        const started = Date.now();
        const runner = new ArtisanRunner(this.root);
        this.runners.get(id)?.cancelAll();
        this.runners.set(id, runner);
        this.post({ type: 'step', id, state: 'running' });

        const done = (detail: string, extra: Record<string, unknown> = {}) =>
            this.post({ type: 'step', id, state: 'done', detail, durationMs: Date.now() - started, ...extra });
        const failed = (detail: string, extra: Record<string, unknown> = {}) =>
            this.post({ type: 'step', id, state: 'failed', detail, durationMs: Date.now() - started, ...extra });

        try {
            switch (id) {
                case 'migrate':
                case 'seed': {
                    if (!(await ensureEnvReady(this.root))) {
                        failed(t(id === 'migrate' ? 'env.migrateCancelled' : 'env.seedCancelled'));
                        return;
                    }
                    const result = id === 'migrate' ? await runner.migrate() : await runner.seed();
                    logCommand(id === 'migrate' ? 'php artisan migrate' : 'php artisan migrate:fresh --seed', result.output);
                    if (this.stopped(id, runner)) {
                        return;
                    }
                    if (!result.success) {
                        failed(failureExcerpt(result.output));
                        this.suggest(id, result.output);
                        return;
                    }
                    const count = migrationCount(result.output);
                    done(id === 'seed' ? t('ready.seeded') : count === 0 ? t('ready.nothingToMigrate') : tn('ready.migrated', count));
                    this.onDidChange?.();
                    return;
                }
                case 'test': {
                    const result = await runner.test();
                    logCommand('php artisan test', result.output);
                    if (this.stopped(id, runner)) {
                        return;
                    }
                    const summary = testSummary(result.output);
                    const text = summary
                        ? [summary.failed > 0 ? tn('ready.testsFailed', summary.failed) : '', tn('ready.testsPassed', summary.passed)].filter(Boolean).join(', ')
                        : failureExcerpt(result.output);
                    if (result.success) {
                        done(text);
                    } else {
                        failed(text);
                        this.suggest('test', result.output);
                    }
                    return;
                }
                case 'docs': {
                    if (!LaravelDetector.isScrambleInstalled(this.root)) {
                        failed(t('ready.docsMissing'), { scramble: false });
                        return;
                    }
                    const serve = await this.server.startServe();
                    if (serve.success && serve.port) {
                        await vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${serve.port}/docs/api`));
                        done(t('ready.docsOpened', serve.port));
                    } else {
                        failed(serve.error ?? '');
                    }
                    return;
                }
                case 'stubs': {
                    const folder = path.join(this.root, ...STUBS_PATH.split('/'));
                    if (fs.existsSync(folder)) {
                        await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(folder));
                        done(t('ready.stubsPublished', STUBS_PATH), { published: true });
                        return;
                    }
                    const result = await runner.publishStubs();
                    logCommand('php artisan vendor:publish --tag=api-generator-stubs', result.output);
                    if (!result.success) {
                        failed(failureExcerpt(result.output));
                        return;
                    }
                    await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(folder));
                    done(t('ready.stubsPublished', STUBS_PATH), { published: true });
                    return;
                }
            }
        } finally {
            if (this.runners.get(id) === runner) {
                this.runners.delete(id);
            }
        }
    }

    dispose(): void {
        for (const runner of this.runners.values()) {
            runner.cancelAll();
        }
        this.runners.clear();
        this.server.stopServe();
    }

    /** A run stopped by the user reports it; one replaced by a newer run ends silently. */
    private stopped(id: StepId, runner: ArtisanRunner): boolean {
        if (this.halted.has(runner)) {
            this.post({ type: 'step', id, state: 'stopped', detail: t('ready.stopped') });
            return true;
        }
        return this.runners.get(id) !== runner;
    }

    private suggest(action: string, output: string): void {
        const suggestion = analyzeError(action, output);
        if (suggestion) {
            void presentSuggestion(this.root, suggestion);
        }
    }

    private terminal(command: string): void {
        const terminal = vscode.window.createTerminal({ name: 'Laravel API Generator', cwd: this.root });
        terminal.sendText(command);
        terminal.show();
    }
}
