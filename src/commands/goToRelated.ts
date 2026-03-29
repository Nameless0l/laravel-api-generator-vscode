import * as vscode from 'vscode';
import * as path from 'path';
import { LaravelDetector } from '../services/laravelDetector';
import { EntityScanner } from '../services/entityScanner';

const EXCLUDED_REQUEST_NAMES = ['Login', 'Register'];

interface EntityPattern {
    regex: RegExp;
    nameIndex: number;
}

const ENTITY_PATTERNS: EntityPattern[] = [
    { regex: /^(.+)ControllerTest\.php$/, nameIndex: 1 },
    { regex: /^(.+)ServiceTest\.php$/, nameIndex: 1 },
    { regex: /^(.+)Controller\.php$/, nameIndex: 1 },
    { regex: /^(.+)Service\.php$/, nameIndex: 1 },
    { regex: /^(.+)DTO\.php$/, nameIndex: 1 },
    { regex: /^(.+)Request\.php$/, nameIndex: 1 },
    { regex: /^(.+)Resource\.php$/, nameIndex: 1 },
    { regex: /^(.+)Policy\.php$/, nameIndex: 1 },
    { regex: /^(.+)Factory\.php$/, nameIndex: 1 },
    { regex: /^(.+)Seeder\.php$/, nameIndex: 1 },
];

function extractEntityName(filePath: string): string | undefined {
    const fileName = path.basename(filePath);

    // Check if file is a Model in app/Models/
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('app/Models/') && fileName.endsWith('.php')) {
        return fileName.replace('.php', '');
    }

    for (const pattern of ENTITY_PATTERNS) {
        const match = fileName.match(pattern.regex);
        if (match) {
            const name = match[pattern.nameIndex];

            // Exclude certain Request names
            if (fileName.endsWith('Request.php') && EXCLUDED_REQUEST_NAMES.includes(name)) {
                return undefined;
            }

            return name;
        }
    }

    return undefined;
}

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
        const entityName = extractEntityName(currentFilePath);

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
