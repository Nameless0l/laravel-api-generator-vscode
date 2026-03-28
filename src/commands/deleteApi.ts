import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { ArtisanRunner } from '../services/artisanRunner';
import { EntityTreeItem } from '../providers/entityTreeProvider';

export function registerDeleteCommand(onDidDelete: () => void): vscode.Disposable {
    return vscode.commands.registerCommand(
        'laravelApiGenerator.delete',
        async (item?: EntityTreeItem) => {
            const check = LaravelDetector.validate();
            if (!check.valid || !check.root) {
                vscode.window.showErrorMessage(check.message || 'Cannot detect Laravel project.');
                return;
            }

            let entityName = item?.entityName;

            if (!entityName) {
                entityName = await vscode.window.showInputBox({
                    prompt: 'Enter the entity name to delete',
                    placeHolder: 'e.g. Product',
                });
            }

            if (!entityName) {
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Delete all files for "${entityName}"? This cannot be undone.`,
                { modal: true },
                'Delete'
            );

            if (confirm !== 'Delete') {
                return;
            }

            const artisan = new ArtisanRunner(check.root);
            const result = await artisan.delete(entityName);

            if (result.success) {
                vscode.window.showInformationMessage(`"${entityName}" API deleted successfully.`);
                onDidDelete();
            } else {
                vscode.window.showErrorMessage(
                    `Failed to delete "${entityName}": ${result.errors.join(', ')}`
                );
            }
        }
    );
}
