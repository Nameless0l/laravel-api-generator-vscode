import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { t, getLocale } from '../i18n';
import { agentHost } from '../providers/mcpServerProvider';
import { DescribeAvailability } from '../services/describeAvailability';
import { LaravelDetector } from '../services/laravelDetector';
import { claudeCodeCommand, mcpState } from '../services/mcpServer';
import { detectPackageState, MCP_MIN_VERSION, PREVIEW_MIN_VERSION, requirePackageCommand, usesLegacyLine } from '../services/packageState';
import { PhpCommand, resolvePhpCommand } from '../services/phpCommand';
import { laravelVersion, phpVersion, projectName, schemaFile } from '../services/projectInfo';
import { getSidebarHomeHtml, HomeAgents, HomeFix, HomeProject, SidebarHomeStrings } from './sidebarHomeContent';

const DOCS_BASE = 'https://nameless0l.github.io/laravel-api-generator/';

const ALLOWED_COMMANDS = new Set([
    'laravelApiGenerator.generate',
    'laravelApiGenerator.generateFromDatabase',
    'laravelApiGenerator.generateFromSchema',
    'laravelApiGenerator.generateFromMermaid',
    'laravelApiGenerator.generateFromOpenApi',
    'laravelApiGenerator.describeApi',
    'laravelApiGenerator.diagram',
    'laravelApiGenerator.showSnippets',
    'laravelApiGenerator.projectActions',
]);

export class SidebarHomeViewProvider implements vscode.WebviewViewProvider {
    static readonly viewId = 'laravelApiGenerator.home';

    private view: vscode.WebviewView | undefined;
    private php: Promise<string | null> | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly describe: DescribeAvailability
    ) {}

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
        };
        this.render();

        const root = LaravelDetector.getWorkspaceRoot();
        const disposables: vscode.Disposable[] = [
            view.webview.onDidReceiveMessage((msg: { type?: string; command?: string; action?: HomeFix }) => {
                if (msg?.type === 'run' && msg.command && ALLOWED_COMMANDS.has(msg.command)) {
                    void vscode.commands.executeCommand(msg.command);
                } else if (msg?.type === 'fix' && msg.action) {
                    this.fix(msg.action);
                }
            }),
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('laravelApiGenerator.phpCommand') || e.affectsConfiguration('laravelApiGenerator.phpPath')) {
                    this.php = undefined;
                    this.render();
                } else if (e.affectsConfiguration('laravelApiGenerator.locale') || e.affectsConfiguration('laravelApiGenerator.mcp')) {
                    this.render();
                }
            }),
            this.describe.onDidChange(() => this.render()),
            view.onDidChangeVisibility(() => {
                if (view.visible) {
                    this.render();
                }
            }),
        ];
        if (root) {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(root, '{composer.json,vendor/composer/installed.json,api-schema.yaml,api-schema.yml,api-schema.json}')
            );
            let timer: ReturnType<typeof setTimeout> | undefined;
            const later = () => {
                clearTimeout(timer);
                timer = setTimeout(() => this.render(), 400);
            };
            disposables.push(watcher, watcher.onDidChange(later), watcher.onDidCreate(later), watcher.onDidDelete(later), {
                dispose: () => clearTimeout(timer),
            });
        }
        view.onDidDispose(() => {
            this.view = undefined;
            disposables.forEach((d) => d.dispose());
        });
    }

    refresh(): void {
        this.render();
    }

    private render(): void {
        const view = this.view;
        if (!view) {
            return;
        }
        const webview = view.webview;
        const root = LaravelDetector.getWorkspaceRoot();
        const isLaravel = !!root && LaravelDetector.isLaravelProject(root);
        const media = (...file: string[]): string => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', ...file)).toString();

        webview.html = getSidebarHomeHtml({
            cspSource: webview.cspSource,
            nonce: crypto.randomBytes(16).toString('hex'),
            kitCssUri: media('webview', 'kit.css'),
            homeCssUri: media('webview', 'home.css'),
            logoDarkUri: media('API_dark.png'),
            logoLightUri: media('API.png'),
            docsUrl: getLocale() === 'fr' ? `${DOCS_BASE}fr/guide/extension/` : `${DOCS_BASE}guide/extension/`,
            lang: getLocale(),
            project: isLaravel && root ? this.project(root) : undefined,
            schemaFile: isLaravel && root ? schemaFile(root) : undefined,
            canDescribe: this.describe.available,
            agents: isLaravel && root ? this.agents(root) : undefined,
            strings: this.strings(),
        });

        if (isLaravel && root) {
            void this.announcePhp(root);
        }
    }

    private project(root: string): HomeProject {
        const state = detectPackageState(root, LaravelDetector.isPackageInstalled(root));
        const laravel = laravelVersion(root);
        const project: HomeProject = {
            name: projectName(root),
            versions: laravel ? t('home.laravel', laravel) : '',
            status: { tone: 'ok', text: '' },
        };

        if (state.kind === 'notDeclared') {
            project.status = { tone: 'warn', text: t('home.statusMissing'), fix: { action: 'install', label: t('home.install') } };
        } else if (state.kind === 'notInstalled') {
            project.status = { tone: 'warn', text: t('home.statusNotInstalled'), fix: { action: 'composerInstall', label: t('home.composerInstall') } };
        } else if (state.preview === 'tooOld') {
            project.status = {
                tone: 'warn',
                text: t('home.statusTooOld', state.version.replace(/^v/, ''), PREVIEW_MIN_VERSION),
                fix: { action: 'update', label: t('home.update') },
            };
        } else {
            project.status = { tone: 'ok', text: t('home.statusReady', state.version.replace(/^v/, '')) };
        }

        return project;
    }

    private agents(root: string): HomeAgents | undefined {
        if (usesLegacyLine(root)) {
            return undefined;
        }
        const enabled = vscode.workspace.getConfiguration('laravelApiGenerator').get<boolean>('mcp.enabled', true);
        switch (mcpState(root, enabled)) {
            case 'noPackage':
                return undefined;
            case 'tooOld':
                return { status: { tone: 'muted', text: t('home.agentsTooOld', MCP_MIN_VERSION), fix: { action: 'update', label: t('home.update') } }, claudeCommand: false };
            case 'missingMcp':
                return { status: { tone: 'muted', text: t('home.agentsMissingMcp'), fix: { action: 'installMcp', label: t('home.installMcp') } }, claudeCommand: false };
            case 'disabled':
                return { status: { tone: 'muted', text: t('home.agentsDisabled'), fix: { action: 'mcpSettings', label: t('home.settings') } }, claudeCommand: false };
            case 'ready': {
                const host = agentHost();
                const text = host === 'cursor' ? t('home.agentsReadyCursor') : host === 'copilot' ? t('home.agentsReadyCopilot') : t('home.agentsReadyOther');
                return { status: { tone: 'ok', text }, claudeCommand: true };
            }
        }
    }

    private phpCommand(): PhpCommand {
        const config = vscode.workspace.getConfiguration('laravelApiGenerator');
        return resolvePhpCommand(config.get<unknown>('phpCommand'), config.get<string>('phpPath', 'php'));
    }

    private async announcePhp(root: string): Promise<void> {
        if (!this.php) {
            this.php = phpVersion(this.phpCommand(), root);
        }
        const version = await this.php;
        await this.view?.webview.postMessage(
            version ? { type: 'php', text: t('home.php', version) } : { type: 'php', text: t('home.phpMissing'), missing: true }
        );
    }

    private fix(action: HomeFix): void {
        const root = LaravelDetector.getWorkspaceRoot();
        switch (action) {
            case 'settings':
                void vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${this.context.extension.id}`);
                return;
            case 'mcpSettings':
                void vscode.commands.executeCommand('workbench.action.openSettings', 'laravelApiGenerator.mcp.enabled');
                return;
            case 'copyClaude':
                void vscode.env.clipboard.writeText(claudeCodeCommand(this.phpCommand())).then(() => vscode.window.showInformationMessage(t('home.copiedClaude')));
                return;
        }
        if (!root) {
            return;
        }
        const commands: Partial<Record<HomeFix, string>> = {
            install: requirePackageCommand(root),
            composerInstall: 'composer install',
            update: 'composer update nameless/laravel-api-generator -W',
            installMcp: 'composer require --dev laravel/mcp',
        };
        const command = commands[action];
        if (!command) {
            return;
        }
        const terminal = vscode.window.createTerminal({ name: 'Laravel API Generator', cwd: root });
        terminal.sendText(command);
        terminal.show();
    }

    private strings(): SidebarHomeStrings {
        return {
            settings: t('home.settings'),
            notLaravel: t('home.notLaravel'),
            newApi: t('home.newApi'),
            generateFrom: t('home.generateFrom'),
            describe: t('home.describe'),
            describeDetail: t('home.describeDetail'),
            database: t('home.database'),
            schema: t('home.schema'),
            mermaid: t('home.mermaid'),
            openapi: t('home.openapi'),
            project: t('home.project'),
            diagram: t('home.diagram'),
            projectActions: t('home.projectActions'),
            snippets: t('home.snippets'),
            docs: t('home.docs'),
            agents: t('home.agents'),
            copyClaude: t('home.copyClaude'),
        };
    }
}
