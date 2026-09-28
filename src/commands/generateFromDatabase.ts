import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { ArtisanRunner } from '../services/artisanRunner';
import { ensureEnvReady } from '../webview/projectActions';
import { FlowPanel } from '../webview/flowPanel';
import { t } from '../i18n';

/**
 * Generate complete APIs from the project's existing database
 * (package `make:fullapi --from-database`), after reviewing the dry run.
 */
export function registerGenerateFromDatabaseCommand(extensionUri: vscode.Uri, onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.generateFromDatabase', async () => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        const root = check.root;
        if (!(await ensureEnvReady(root))) {
            return;
        }

        const tablesResult = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: t('sources.readingDatabase'), cancellable: false },
            () => new ArtisanRunner(root).introspectTables()
        );
        if (!tablesResult.success) {
            vscode.window.showErrorMessage(t('sources.couldNotListTables', tablesResult.output || tablesResult.errors.join('\n')));
            return;
        }

        let tables: Array<{ name: string; columns: number }>;
        try {
            const raw = tablesResult.output;
            const start = raw.indexOf('[');
            tables = JSON.parse(start >= 0 ? raw.slice(start) : raw);
        } catch {
            vscode.window.showErrorMessage(t('sources.couldNotParse'));
            return;
        }

        if (tables.length === 0) {
            vscode.window.showWarningMessage(t('sources.noTables'));
            return;
        }

        const picks = await vscode.window.showQuickPick(
            tables.map((table) => ({
                label: table.name,
                description: t('sources.columnsCount', table.columns),
                picked: table.name !== 'users',
            })),
            { canPickMany: true, title: t('sources.pickTablesTitle'), placeHolder: t('sources.pickTablesPlaceholder') }
        );
        if (!picks || picks.length === 0) {
            return;
        }

        FlowPanel.plan(extensionUri, root, { kind: 'database', tables: picks.map((pick) => pick.label) }, onDidGenerate);
    });
}
