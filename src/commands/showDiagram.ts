import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { DiagramPanel } from '../webview/diagramPanel';

export function registerDiagramCommand(extensionUri: vscode.Uri, memento: vscode.Memento): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.diagram', () => {
        const root = LaravelDetector.getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        if (!LaravelDetector.isLaravelProject(root)) {
            vscode.window.showErrorMessage('Not a Laravel project.');
            return;
        }

        DiagramPanel.show(extensionUri, root, memento);
    });
}
