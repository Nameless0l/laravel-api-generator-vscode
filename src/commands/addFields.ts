import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { ArtisanRunner } from '../services/artisanRunner';
import { EntityTreeItem } from '../providers/entityTreeProvider';
import { isUnsupportedOption } from './generationShared';
import { t } from '../i18n';

const FIELDS_PATTERN = /^\s*\w+\s*:\s*\w+(\([\w\s,.-]+\))?\s*(,\s*\w+\s*:\s*\w+(\([\w\s,.-]+\))?\s*)*$/;

export function registerAddFieldsCommand(onDidChange: () => void): vscode.Disposable {
    return vscode.commands.registerCommand(
        'laravelApiGenerator.addFields',
        async (item?: EntityTreeItem) => {
            const check = await LaravelDetector.validateOrPromptInstall();
            if (!check.valid || !check.root) {
                return;
            }
            const root = check.root;

            let entityName = item?.entityName;
            if (!entityName) {
                entityName = await vscode.window.showInputBox({
                    prompt: t('addFields.promptName'),
                    placeHolder: 'e.g. Post',
                });
            }
            if (!entityName) {
                return;
            }

            const fields = await vscode.window.showInputBox({
                prompt: t('addFields.promptFields', entityName),
                placeHolder: 'excerpt:text,status:enum(draft,published)',
                validateInput: (value) =>
                    value.trim() === '' || FIELDS_PATTERN.test(value)
                        ? undefined
                        : t('addFields.invalidFormat'),
            });
            if (!fields || fields.trim() === '') {
                return;
            }

            const artisan = new ArtisanRunner(root);
            const result = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: t('addFields.progress', entityName),
                    cancellable: false,
                },
                () => artisan.addFields(entityName, fields.trim())
            );

            if (result.success) {
                const migrateLabel = t('addFields.runMigrate');
                const action = await vscode.window.showInformationMessage(
                    t('addFields.success', entityName),
                    migrateLabel
                );
                onDidChange();
                if (action === migrateLabel) {
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: t('addFields.migrating'),
                            cancellable: false,
                        },
                        () => artisan.migrate()
                    );
                }
                return;
            }

            if (isUnsupportedOption(result)) {
                vscode.window.showErrorMessage(t('sources.packageTooOld'));
                return;
            }

            const output = result.output || result.errors.join('\n');
            vscode.window.showErrorMessage(
                t('addFields.failed', output.length > 600 ? `${output.slice(0, 600)}...` : output)
            );
        }
    );
}
