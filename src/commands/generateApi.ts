import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { GeneratorPanel } from '../webview/webviewPanel';

/** The builder opens even without the package: its preview then says how to install it. */
export function registerGenerateCommand(extensionUri: vscode.Uri, onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.generate', () => {
        const root = LaravelDetector.projectRoot();
        if (root) {
            GeneratorPanel.show(extensionUri, root, onDidGenerate);
        }
    });
}
