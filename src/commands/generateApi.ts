import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { GeneratorPanel } from '../webview/webviewPanel';

export function registerGenerateCommand(onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.generate', async () => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }

        GeneratorPanel.show(check.root, onDidGenerate);
    });
}
