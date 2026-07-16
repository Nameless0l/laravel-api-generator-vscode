import * as vscode from 'vscode';
import * as path from 'path';
import { LaravelDetector } from '../services/laravelDetector';
import { ArtisanRunner } from '../services/artisanRunner';
import { pickGenerationOptions, presentGenerationResult } from './generationShared';
import { t } from '../i18n';

const MERMAID_EXTENSIONS = ['.mmd', '.mermaid'];

/**
 * Generate complete APIs from a Mermaid erDiagram / classDiagram file
 * (package `make:fullapi --mermaid=`, >= 3.5).
 */
export function registerGenerateFromMermaidCommand(onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.generateFromMermaid', async () => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        const root = check.root;

        const diagramPath = await resolveDiagramPath(root);
        if (!diagramPath) {
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
            () => artisan.generateFromMermaid(diagramPath, options.queryBuilder)
        );

        await presentGenerationResult(result, root, onDidGenerate);
    });
}

async function resolveDiagramPath(root: string): Promise<string | undefined> {
    const active = vscode.window.activeTextEditor?.document;
    const activePath = active && !active.isUntitled ? active.uri.fsPath : undefined;
    const activeIsMermaid =
        activePath !== undefined && MERMAID_EXTENSIONS.includes(path.extname(activePath).toLowerCase());

    if (activeIsMermaid && activePath) {
        const useCurrent = t('sources.useCurrentFile', path.basename(activePath));
        const browse = t('sources.browseMermaid');
        const choice = await vscode.window.showQuickPick([useCurrent, browse], {
            title: t('sources.mermaidTitle'),
        });
        if (choice === undefined) {
            return undefined;
        }
        if (choice === useCurrent) {
            return activePath;
        }
    }

    const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: { 'Mermaid diagram': ['mmd', 'mermaid', 'md', 'txt'] },
        title: t('sources.mermaidTitle'),
        defaultUri: vscode.Uri.file(root),
    });

    return fileUri && fileUri.length > 0 ? fileUri[0].fsPath : undefined;
}
