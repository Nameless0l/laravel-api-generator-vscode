import * as vscode from 'vscode';
import * as path from 'path';
import { LaravelDetector } from '../services/laravelDetector';
import { OPENAPI_MIN_VERSION, readInstalledVersion, versionSupport } from '../services/packageState';
import { FlowPanel } from '../webview/flowPanel';
import { offerPackageUpdate } from './generationShared';
import { t } from '../i18n';

const SPEC_EXTENSIONS = ['.yaml', '.yml', '.json'];

/**
 * Generate complete APIs from the schemas of an OpenAPI 3 or Swagger 2 spec
 * (package `make:fullapi --openapi=`, >= 3.13), after reviewing the dry run
 * and the schemas it left aside.
 */
export function registerGenerateFromOpenApiCommand(extensionUri: vscode.Uri, onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.generateFromOpenApi', async (spec?: vscode.Uri) => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        const root = check.root;

        const version = readInstalledVersion(root);
        if (version !== null && versionSupport(version, OPENAPI_MIN_VERSION) === 'tooOld') {
            await offerPackageUpdate(root);
            return;
        }

        const specPath = spec?.fsPath ?? (await resolveSpecPath(root));
        if (!specPath) {
            return;
        }

        FlowPanel.plan(extensionUri, root, { kind: 'openapi', path: specPath }, onDidGenerate);
    });
}

async function resolveSpecPath(root: string): Promise<string | undefined> {
    const active = vscode.window.activeTextEditor?.document;
    const activePath = active && !active.isUntitled ? active.uri.fsPath : undefined;

    if (activePath && SPEC_EXTENSIONS.includes(path.extname(activePath).toLowerCase()) && /["']?(openapi|swagger)["']?\s*:/.test(active?.getText() ?? '')) {
        const useCurrent = t('sources.useCurrentFile', path.basename(activePath));
        const choice = await vscode.window.showQuickPick([useCurrent, t('sources.browseOpenApi')], {
            title: t('sources.openApiTitle'),
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
        filters: { 'OpenAPI / Swagger': ['yaml', 'yml', 'json'] },
        title: t('sources.openApiTitle'),
        defaultUri: vscode.Uri.file(root),
    });

    return fileUri && fileUri.length > 0 ? fileUri[0].fsPath : undefined;
}
