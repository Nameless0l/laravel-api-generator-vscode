import * as vscode from 'vscode';
import { editableEntity } from '../services/entityEdit';
import { LaravelDetector } from '../services/laravelDetector';
import { GeneratorPanel } from '../webview/webviewPanel';
import { pickEntity } from './entityPick';
import { t } from '../i18n';

/** Add Fields is the same screen under its older name. */
export function registerEditEntityCommands(extensionUri: vscode.Uri, onDidChange: () => void): vscode.Disposable[] {
    const open = async (item?: { entityName?: string }): Promise<void> => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }

        const name = await pickEntity(check.root, item, t('edit.pickTitle'));
        if (!name) {
            return;
        }

        const entity = editableEntity(check.root, name);
        if (!entity) {
            vscode.window.showErrorMessage(t('edit.notFound', name));
            return;
        }

        GeneratorPanel.show(extensionUri, check.root, onDidChange, entity);
    };

    return [vscode.commands.registerCommand('laravelApiGenerator.editEntity', open), vscode.commands.registerCommand('laravelApiGenerator.addFields', open)];
}
