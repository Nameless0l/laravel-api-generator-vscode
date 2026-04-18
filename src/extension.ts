import * as vscode from 'vscode';
import { LaravelDetector } from './services/laravelDetector';
import { EntityTreeProvider } from './providers/entityTreeProvider';
import { registerGenerateCommand } from './commands/generateApi';
import { registerDeleteCommand } from './commands/deleteApi';
import { registerGoToRelatedCommand } from './commands/goToRelated';
import { registerDiagramCommand } from './commands/showDiagram';

export function activate(context: vscode.ExtensionContext): void {
    const root = LaravelDetector.getWorkspaceRoot();

    let treeProvider: EntityTreeProvider | undefined;

    if (root && LaravelDetector.isLaravelProject(root)) {
        treeProvider = new EntityTreeProvider(root);
        vscode.window.registerTreeDataProvider('laravelApiGenerator.entities', treeProvider);

        if (!LaravelDetector.isPackageInstalled(root)) {
            void promptPackageInstall(root);
        }
    }

    const refresh = (): void => {
        treeProvider?.refresh();
    };

    context.subscriptions.push(
        registerGenerateCommand(refresh),
        registerDeleteCommand(refresh),
        registerGoToRelatedCommand(),
        registerDiagramCommand(),
        vscode.commands.registerCommand('laravelApiGenerator.refresh', refresh)
    );
}

async function promptPackageInstall(workspaceRoot: string): Promise<void> {
    const action = await vscode.window.showInformationMessage(
        'Laravel API Generator: package not found in this project. Install it now?',
        'Install via Composer',
        'Dismiss'
    );

    if (action === 'Install via Composer') {
        const terminal = vscode.window.createTerminal({
            name: 'Laravel API Generator',
            cwd: workspaceRoot,
        });
        terminal.sendText('composer require nameless/laravel-api-generator');
        terminal.show();
    }
}

export function deactivate(): void {
    // Nothing to clean up
}
