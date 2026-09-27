import * as vscode from 'vscode';
import * as path from 'path';
import { LaravelDetector } from '../services/laravelDetector';
import { EntityScanner } from '../services/entityScanner';
import { entityOfFile } from '../services/entityOfFile';

export function registerGoToRelatedCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.goToRelated', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor.');
            return;
        }

        const check = LaravelDetector.validate();
        if (!check.valid || !check.root) {
            vscode.window.showErrorMessage(check.message || 'Cannot detect Laravel project.');
            return;
        }

        const currentFilePath = editor.document.uri.fsPath;
        const entityName = entityOfFile(check.root, currentFilePath);

        if (!entityName) {
            vscode.window.showWarningMessage('Could not determine entity name from the current file.');
            return;
        }

        const scanner = new EntityScanner(check.root);
        const entityFiles = scanner.getEntityFiles(entityName);

        const existingFiles = entityFiles.filter((f) => f.exists);

        if (existingFiles.length === 0) {
            vscode.window.showInformationMessage(`No related files found for entity "${entityName}".`);
            return;
        }

        const items = existingFiles.map((f) => ({
            label: `$(file) ${path.basename(f.path)}`,
            description: f.type,
            detail: f.path,
            filePath: path.join(check.root!, f.path),
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Related files for ${entityName}`,
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (selected) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(selected.filePath));
            await vscode.window.showTextDocument(doc);
        }
    });
}
