import * as vscode from 'vscode';
import { initLocale } from './i18n';
import { LaravelDetector } from './services/laravelDetector';
import { EntityDecorations, EntityTreeProvider } from './providers/entityTreeProvider';
import { registerMcpServerProvider } from './providers/mcpServerProvider';
import { SidebarHomeViewProvider } from './webview/sidebarHomeView';
import { DiagramPanel } from './webview/diagramPanel';
import { StatusBarManager } from './services/statusBar';
import { disposeOutput } from './services/outputLog';
import { registerPlannedContent } from './services/plannedContent';
import { registerGenerateCommand } from './commands/generateApi';
import { registerDeleteCommand } from './commands/deleteApi';
import { registerGoToRelatedCommand } from './commands/goToRelated';
import { registerDiagramCommand } from './commands/showDiagram';
import { registerRegenerateFileCommand } from './commands/regenerateFile';
import { registerShowSnippetsCommand } from './commands/showSnippets';
import { registerGenerateFromDatabaseCommand } from './commands/generateFromDatabase';
import { registerAddFieldsCommand } from './commands/addFields';
import { registerGenerateFromSchemaCommand } from './commands/generateFromSchema';
import { registerGenerateFromMermaidCommand } from './commands/generateFromMermaid';
import { registerGenerateFromOpenApiCommand } from './commands/generateFromOpenApi';
import { registerDescribeApiCommand } from './commands/describeApi';
import { registerProjectActionsCommand } from './commands/projectActions';

export function activate(context: vscode.ExtensionContext): void {
    initLocale();

    const home = new SidebarHomeViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(SidebarHomeViewProvider.viewId, home), registerPlannedContent());

    const root = LaravelDetector.getWorkspaceRoot();
    const isLaravel = !!root && LaravelDetector.isLaravelProject(root);
    void vscode.commands.executeCommand('setContext', 'laravelApiGenerator.laravelProject', isLaravel);

    let treeProvider: EntityTreeProvider | undefined;
    let statusBar: StatusBarManager | undefined;

    if (isLaravel && root) {
        const decorations = new EntityDecorations();
        treeProvider = new EntityTreeProvider(root, decorations);
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('laravelApiGenerator.entities', treeProvider),
            vscode.window.registerFileDecorationProvider(decorations),
            decorations
        );

        statusBar = new StatusBarManager(root);
        statusBar.refresh();
        context.subscriptions.push({ dispose: () => statusBar?.dispose() }, ...registerMcpServerProvider(root));
    }

    const refresh = (): void => {
        treeProvider?.refresh();
        statusBar?.refresh();
        DiagramPanel.refresh();
    };

    // Auto-refresh when PHP files under app/ change outside our own commands
    // (e.g. make:fullapi run in a terminal, git pull, manual deletion)
    if (isLaravel && root) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '{app/**/*.php,database/migrations/*.php,.api-generator/*.json}'));
        let debounce: ReturnType<typeof setTimeout> | undefined;
        const scheduleRefresh = (): void => {
            if (debounce) {
                clearTimeout(debounce);
            }
            debounce = setTimeout(refresh, 500);
        };
        watcher.onDidCreate(scheduleRefresh);
        watcher.onDidChange(scheduleRefresh);
        watcher.onDidDelete(scheduleRefresh);
        context.subscriptions.push(watcher, {
            dispose: () => {
                if (debounce) {
                    clearTimeout(debounce);
                }
            },
        });
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('laravelApiGenerator.locale')) {
                initLocale();
                statusBar?.refresh();
                treeProvider?.refresh();
            }
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            LaravelDetector.resetCache();
            refresh();
        })
    );

    const extensionUri = context.extensionUri;
    context.subscriptions.push(
        registerGenerateCommand(extensionUri, refresh),
        registerDeleteCommand(refresh),
        registerRegenerateFileCommand(refresh),
        registerGoToRelatedCommand(),
        registerDiagramCommand(extensionUri, context.workspaceState),
        registerShowSnippetsCommand(context.extensionPath),
        registerGenerateFromDatabaseCommand(extensionUri, refresh),
        registerAddFieldsCommand(refresh),
        registerGenerateFromSchemaCommand(extensionUri, refresh),
        registerGenerateFromMermaidCommand(extensionUri, refresh),
        registerGenerateFromOpenApiCommand(extensionUri, refresh),
        registerDescribeApiCommand(extensionUri, refresh),
        registerProjectActionsCommand(extensionUri, refresh),
        vscode.commands.registerCommand('laravelApiGenerator.refresh', refresh)
    );
}

export function deactivate(): void {
    disposeOutput();
}
