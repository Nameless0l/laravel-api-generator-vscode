import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { ArtisanRunner } from '../services/artisanRunner';
import { EntityTreeItem } from '../providers/entityTreeProvider';
import { t } from '../i18n';

export function registerDeleteCommand(onDidDelete: () => void): vscode.Disposable {
    return vscode.commands.registerCommand(
        'laravelApiGenerator.delete',
        async (item?: EntityTreeItem) => {
            const check = await LaravelDetector.validateOrPromptInstall();
            if (!check.valid || !check.root) {
                return;
            }

            let entityName = item?.entityName;

            if (!entityName) {
                entityName = await vscode.window.showInputBox({
                    prompt: t('delete.promptName'),
                    placeHolder: 'e.g. Product',
                });
            }

            if (!entityName) {
                return;
            }

            const deleteLabel = t('delete.deleteAction');
            const confirm = await vscode.window.showWarningMessage(
                t('delete.confirm', entityName),
                { modal: true },
                deleteLabel
            );

            if (confirm !== deleteLabel) {
                return;
            }

            const artisan = new ArtisanRunner(check.root);
            const result = await artisan.delete(entityName);

            if (result.success) {
                vscode.window.showInformationMessage(t('delete.success', entityName));
                onDidDelete();
            } else {
                vscode.window.showErrorMessage(
                    t('delete.failed', entityName, result.errors.join(', '))
                );
            }
        }
    );
}
