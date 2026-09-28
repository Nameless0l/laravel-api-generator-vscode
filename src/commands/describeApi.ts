import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { FlowPanel } from '../webview/flowPanel';
import { t } from '../i18n';

/**
 * A chat model offered by VS Code (1.90+, Copilot first) drafts api-schema.yaml
 * from a description; the package's dry run is reviewed before anything is written.
 */
export function registerDescribeApiCommand(extensionUri: vscode.Uri, onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.describeApi', async () => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        if (!(vscode as Partial<typeof vscode>).lm) {
            vscode.window.showWarningMessage(t('describe.noApi'));
            return;
        }

        FlowPanel.describe(extensionUri, check.root, onDidGenerate);
    });
}
