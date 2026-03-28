import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { GeneratorPanel } from '../webview/webviewPanel';

export function registerGenerateCommand(onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.generate', () => {
        const check = LaravelDetector.validate();
        if (!check.valid || !check.root) {
            vscode.window.showErrorMessage(check.message || 'Cannot detect Laravel project.');
            return;
        }

        GeneratorPanel.show(check.root, onDidGenerate);
    });
}
