import * as vscode from 'vscode';
import { initLocale } from './i18n';
import { LaravelDetector } from './services/laravelDetector';
import { EntityTreeProvider } from './providers/entityTreeProvider';
import { StatusBarManager } from './services/statusBar';
import { registerGenerateCommand } from './commands/generateApi';
import { registerDeleteCommand } from './commands/deleteApi';
import { registerGoToRelatedCommand } from './commands/goToRelated';
import { registerDiagramCommand } from './commands/showDiagram';
import { registerRegenerateFileCommand } from './commands/regenerateFile';
import { registerShowSnippetsCommand } from './commands/showSnippets';

export function activate(context: vscode.ExtensionContext): void {
    initLocale();

    const root = LaravelDetector.getWorkspaceRoot();
    const isLaravel = !!root && LaravelDetector.isLaravelProject(root);

    let treeProvider: EntityTreeProvider | undefined;
    let statusBar: StatusBarManager | undefined;

    if (isLaravel && root) {
        treeProvider = new EntityTreeProvider(root);
        vscode.window.registerTreeDataProvider('laravelApiGenerator.entities', treeProvider);

        statusBar = new StatusBarManager(root);
        statusBar.refresh();
        context.subscriptions.push({ dispose: () => statusBar?.dispose() });
    }

    const refresh = (): void => {
        treeProvider?.refresh();
        statusBar?.refresh();
    };

    // Re-init i18n + statusbar when the locale setting changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('laravelApiGenerator.locale')) {
                initLocale();
                statusBar?.refresh();
            }
        })
    );

    context.subscriptions.push(
        registerGenerateCommand(refresh),
        registerDeleteCommand(refresh),
        registerRegenerateFileCommand(refresh),
        registerGoToRelatedCommand(),
        registerDiagramCommand(),
        registerShowSnippetsCommand(context.extensionPath),
        vscode.commands.registerCommand('laravelApiGenerator.refresh', refresh)
    );
}

export function deactivate(): void {
    // Nothing to clean up
}
