import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LaravelDetector } from '../services/laravelDetector';
import { ArtisanRunner } from '../services/artisanRunner';
import { pickGenerationOptions, presentGenerationResult } from './generationShared';
import { t } from '../i18n';

const DEFAULT_SCHEMA_FILES = ['api-schema.yaml', 'api-schema.yml', 'api-schema.json'];

/**
 * Generate complete APIs from a declarative YAML/JSON schema file
 * (package `make:fullapi --schema=`, >= 3.5).
 */
export function registerGenerateFromSchemaCommand(onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.generateFromSchema', async () => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        const root = check.root;

        const schemaPath = await resolveSchemaPath(root);
        if (!schemaPath) {
            return;
        }

        const options = await pickGenerationOptions(false);
        if (options === undefined) {
            return;
        }

        if (options.queryBuilder) {
            void LaravelDetector.promptQueryBuilderInstallIfMissing(root);
        }

        const artisan = new ArtisanRunner(root);
        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: t('sources.generating'),
                cancellable: false,
            },
            () => artisan.generateFromSchema(schemaPath, { queryBuilder: options.queryBuilder, pest: options.pest })
        );

        await presentGenerationResult(result, root, onDidGenerate);
    });
}

async function resolveSchemaPath(root: string): Promise<string | undefined> {
    const detected = DEFAULT_SCHEMA_FILES.map((f) => path.join(root, f)).find((p) =>
        fs.existsSync(p)
    );

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
