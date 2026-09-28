import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { FlowPanel } from '../webview/flowPanel';

/** Migrations, tests, seeding, docs and stubs for the whole project, outside a generation. */
export function registerProjectActionsCommand(extensionUri: vscode.Uri, onDidChange: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.projectActions', async () => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }

        FlowPanel.projectActions(extensionUri, check.root, onDidChange);
    });
}
