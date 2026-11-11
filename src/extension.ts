import * as vscode from 'vscode';
import { initLocale } from './i18n';
import { LaravelDetector } from './services/laravelDetector';
import { EntityDecorations, EntityTreeProvider } from './providers/entityTreeProvider';
import { registerAgents } from './providers/mcpServerProvider';
import { DescribeAvailability } from './services/describeAvailability';
import { DraftStore } from './services/drafts';
import { SidebarHomeViewProvider } from './webview/sidebarHomeView';
import { DiagramPanel } from './webview/diagramPanel';
import { FlowPanel } from './webview/flowPanel';
import { GeneratorPanel } from './webview/webviewPanel';
import { StatusBarManager } from './services/statusBar';
import { disposeOutput } from './services/outputLog';
import { registerPlannedContent } from './services/plannedContent';
import { registerGenerateCommand } from './commands/generateApi';
import { registerDeleteCommand } from './commands/deleteApi';
import { registerEditEntityCommands } from './commands/editEntity';
import { registerGoToRelatedCommand } from './commands/goToRelated';
import { registerDiagramCommand } from './commands/showDiagram';
import { registerRegenerateFileCommand } from './commands/regenerateFile';
import { registerShowSnippetsCommand } from './commands/showSnippets';
import { registerGenerateFromDatabaseCommand } from './commands/generateFromDatabase';
import { registerGenerateFromSchemaCommand } from './commands/generateFromSchema';
import { registerGenerateFromMermaidCommand } from './commands/generateFromMermaid';
import { registerGenerateFromOpenApiCommand } from './commands/generateFromOpenApi';
import { registerDescribeApiCommand } from './commands/describeApi';
import { registerProjectActionsCommand } from './commands/projectActions';

export const LARAVEL_CONTEXT = 'laravelApiGenerator.laravelProject';
export const PACKAGE_CONTEXT = 'laravelApiGenerator.packageInstalled';

export function activate(context: vscode.ExtensionContext): void {
    initLocale();

    const drafts = new DraftStore(context.workspaceState);
    GeneratorPanel.useDrafts(drafts);
    FlowPanel.useDrafts(drafts);

    const describe = new DescribeAvailability();
    const home = new SidebarHomeViewProvider(context, describe);
    const decorations = new EntityDecorations();
    const treeProvider = new EntityTreeProvider(decorations);
    context.subscriptions.push(
        describe,
        decorations,
        vscode.window.registerWebviewViewProvider(SidebarHomeViewProvider.viewId, home),
        vscode.window.registerTreeDataProvider('laravelApiGenerator.entities', treeProvider),
        vscode.window.registerFileDecorationProvider(decorations),
        registerPlannedContent()
    );

    let projectRoot: string | undefined;
    let project: vscode.Disposable[] = [];
    let statusBar: StatusBarManager | undefined;

    const refresh = (): void => {
        treeProvider.refresh();
        statusBar?.refresh();
        DiagramPanel.refresh();
    };

    const syncPackage = (): void => {
        void vscode.commands.executeCommand('setContext', PACKAGE_CONTEXT, projectRoot !== undefined && LaravelDetector.isPackageReady(projectRoot));
        home.refresh();
    };

    const later = (run: () => void, delay: number): { schedule: () => void; dispose: () => void } => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        return {
            schedule: () => {
                clearTimeout(timer);
                timer = setTimeout(run, delay);
            },
            dispose: () => clearTimeout(timer),
        };
    };

    const watch = (root: string, pattern: string, run: () => void, delay: number): vscode.Disposable[] => {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, pattern));
        const debounced = later(run, delay);
        return [watcher, watcher.onDidCreate(debounced.schedule), watcher.onDidChange(debounced.schedule), watcher.onDidDelete(debounced.schedule), debounced];
    };

    const syncProject = (): void => {
        LaravelDetector.resetCache();
        const found = LaravelDetector.getWorkspaceRoot();
        const root = found && LaravelDetector.isLaravelProject(found) ? found : undefined;
        void vscode.commands.executeCommand('setContext', LARAVEL_CONTEXT, root !== undefined);

        if (root !== projectRoot) {
            project.forEach((disposable) => disposable.dispose());
            project = [];
            statusBar = undefined;
            projectRoot = root;
            treeProvider.setRoot(root);

            if (root) {
                const bar = new StatusBarManager(root);
                statusBar = bar;
                bar.refresh();
                project = [
                    bar,
                    ...registerAgents(root, context.extensionPath),
                    // Files change outside our own commands too: make:fullapi in a terminal, git pull, a manual deletion.
                    ...watch(root, '{app/**/*.php,database/migrations/*.php,.api-generator/*.json}', refresh, 500),
                    ...watch(root, '{composer.json,vendor/composer/installed.json,api-schema.yaml,api-schema.yml,api-schema.json,routes/ai.php}', syncPackage, 400),
                ];
            }
            DiagramPanel.refresh();
        }
        syncPackage();
    };

    syncProject();

    const artisan = vscode.workspace.createFileSystemWatcher('{artisan,*/artisan,*/*/artisan}', false, true, false);
    context.subscriptions.push(
        artisan,
        artisan.onDidCreate(syncProject),
        artisan.onDidDelete(syncProject),
        vscode.workspace.onDidChangeWorkspaceFolders(syncProject),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('laravelApiGenerator.locale')) {
                initLocale();
                refresh();
            }
        }),
        { dispose: () => project.forEach((disposable) => disposable.dispose()) }
    );

    const extensionUri = context.extensionUri;
    context.subscriptions.push(
        registerGenerateCommand(extensionUri, refresh),
        registerDeleteCommand(extensionUri, refresh),
        ...registerEditEntityCommands(extensionUri, refresh),
        registerRegenerateFileCommand(extensionUri, refresh),
        registerGoToRelatedCommand(),
        registerDiagramCommand(extensionUri, context.workspaceState),
        registerShowSnippetsCommand(context.extensionPath),
        registerGenerateFromDatabaseCommand(extensionUri, refresh),
        registerGenerateFromSchemaCommand(extensionUri, refresh),
        registerGenerateFromMermaidCommand(extensionUri, refresh),
        registerGenerateFromOpenApiCommand(extensionUri, refresh),
        registerDescribeApiCommand(extensionUri, refresh),
        registerProjectActionsCommand(extensionUri, refresh),
        vscode.commands.registerCommand('laravelApiGenerator.refresh', refresh),
        vscode.commands.registerCommand('laravelApiGenerator.installPackage', () => {
            const root = LaravelDetector.projectRoot();
            if (root) {
                LaravelDetector.installPackage(root);
            }
        })
    );
}

export function deactivate(): void {
    disposeOutput();
}
