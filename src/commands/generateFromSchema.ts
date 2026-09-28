import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LaravelDetector } from '../services/laravelDetector';
import { SCHEMA_FILES } from '../services/projectInfo';
import { FlowPanel } from '../webview/flowPanel';
import { t } from '../i18n';

/**
 * Generate complete APIs from a declarative YAML/JSON schema file
 * (package `make:fullapi --schema=`), after reviewing the dry run.
 */
export function registerGenerateFromSchemaCommand(extensionUri: vscode.Uri, onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.generateFromSchema', async (schema?: vscode.Uri) => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        const root = check.root;

        const schemaPath = schema?.fsPath ?? (await resolveSchemaPath(root));
        if (!schemaPath) {
            return;
        }

        FlowPanel.plan(extensionUri, root, { kind: 'schema', path: schemaPath }, onDidGenerate);
    });
}

async function resolveSchemaPath(root: string): Promise<string | undefined> {
    const detected = SCHEMA_FILES.map((file) => path.join(root, file)).find((file) => fs.existsSync(file));

    if (detected) {
        const useDetected = t('sources.useDetectedSchema', path.basename(detected));
        const browse = t('sources.browseSchema');
        const choice = await vscode.window.showQuickPick([useDetected, browse], {
            title: t('sources.schemaTitle'),
        });
        if (choice === undefined) {
            return undefined;
        }
        if (choice === useDetected) {
            return detected;
        }
    }

    const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: { 'API schema (YAML / JSON)': ['yaml', 'yml', 'json'] },
        title: t('sources.schemaTitle'),
        defaultUri: vscode.Uri.file(root),
    });

    return fileUri && fileUri.length > 0 ? fileUri[0].fsPath : undefined;
}
