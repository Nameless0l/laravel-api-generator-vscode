import * as vscode from 'vscode';
import { LaravelDetector } from './services/laravelDetector';
import { EntityTreeProvider } from './providers/entityTreeProvider';
import { registerGenerateCommand } from './commands/generateApi';
import { registerDeleteCommand } from './commands/deleteApi';
import { registerGoToRelatedCommand } from './commands/goToRelated';
import { registerDiagramCommand } from './commands/showDiagram';
import { registerRegenerateFileCommand } from './commands/regenerateFile';

export function activate(context: vscode.ExtensionContext): void {
    const root = LaravelDetector.getWorkspaceRoot();

    let treeProvider: EntityTreeProvider | undefined;

    if (root && LaravelDetector.isLaravelProject(root)) {
        treeProvider = new EntityTreeProvider(root);
        vscode.window.registerTreeDataProvider('laravelApiGenerator.entities', treeProvider);
    }

    const refresh = (): void => {
        treeProvider?.refresh();
    };

    context.subscriptions.push(
        registerGenerateCommand(refresh),
        registerDeleteCommand(refresh),
        registerRegenerateFileCommand(refresh),
        registerGoToRelatedCommand(),
        registerDiagramCommand(),
        vscode.commands.registerCommand('laravelApiGenerator.refresh', refresh)
    );
}

export function deactivate(): void {
    // Nothing to clean up
}
