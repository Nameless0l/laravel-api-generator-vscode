import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { DiagramPanel } from '../webview/diagramPanel';

export function registerDiagramCommand(extensionUri: vscode.Uri, memento: vscode.Memento): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.diagram', () => {
        const root = LaravelDetector.projectRoot();
        if (root) {
            DiagramPanel.show(extensionUri, root, memento);
        }
    });
}
