import * as vscode from 'vscode';
import * as path from 'path';
import { LaravelDetector } from '../services/laravelDetector';
import { EntityScanner } from '../services/entityScanner';
import { entityOfFile } from '../services/entityOfFile';
import { t } from '../i18n';

export function registerGoToRelatedCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.goToRelated', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage(t('related.noEditor'));
            return;
        }

        const check = LaravelDetector.validate();
        if (!check.valid || !check.root) {
            vscode.window.showErrorMessage(check.message || t('detector.undetected'));
            return;
        }

        const currentFilePath = editor.document.uri.fsPath;
        const entityName = entityOfFile(check.root, currentFilePath);

        if (!entityName) {
            vscode.window.showWarningMessage(t('related.noEntity'));
            return;
        }

        const scanner = new EntityScanner(check.root);
        const entityFiles = scanner.getEntityFiles(entityName);

        const existingFiles = entityFiles.filter((f) => f.exists);

        if (existingFiles.length === 0) {
            vscode.window.showInformationMessage(t('related.noFiles', entityName));
            return;
        }

        const items = existingFiles.map((f) => ({
            label: `$(file) ${path.basename(f.path)}`,
            description: f.type,
            detail: f.path,
            filePath: path.join(check.root!, f.path),
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: t('related.placeholder', entityName),
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (selected) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(selected.filePath));
            await vscode.window.showTextDocument(doc);
        }
    });
}
