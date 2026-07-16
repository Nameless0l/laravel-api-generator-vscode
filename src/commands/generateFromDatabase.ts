import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { ArtisanRunner } from '../services/artisanRunner';
import { pickGenerationOptions, presentGenerationResult } from './generationShared';
import { t } from '../i18n';

/**
 * Generate complete APIs from the project's existing database
 * (package `make:fullapi --from-database`, >= 3.5).
 */
export function registerGenerateFromDatabaseCommand(onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.generateFromDatabase', async () => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        const root = check.root;
        const artisan = new ArtisanRunner(root);

        const tablesResult = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: t('sources.readingDatabase'),
                cancellable: false,
            },
            () => artisan.introspectTables()
        );

        if (!tablesResult.success) {
            vscode.window.showErrorMessage(
                t('sources.couldNotListTables', tablesResult.output || tablesResult.errors.join('\n'))
            );
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

        // Everything preselected except users (would overwrite app/Models/User.php)
        const tablePicks = await vscode.window.showQuickPick(
            tables.map((tbl) => ({
                label: tbl.name,
                description: t('sources.columnsCount', tbl.columns),
                picked: tbl.name !== 'users',
            })),
            {
                canPickMany: true,
                title: t('sources.pickTablesTitle'),
                placeHolder: t('sources.pickTablesPlaceholder'),
            }
        );

        if (!tablePicks || tablePicks.length === 0) {
            return;
        }

        const options = await pickGenerationOptions(true);
        if (options === undefined) {
            return;
        }

        if (options.queryBuilder) {
            void LaravelDetector.promptQueryBuilderInstallIfMissing(root);
        }

        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: t('sources.generating'),
                cancellable: false,
            },
            () =>
                artisan.generateFromDatabase({
                    tables: tablePicks.map((p) => p.label),
                    withMigrations: options.withMigrations,
                    queryBuilder: options.queryBuilder,
                })
        );

        await presentGenerationResult(result, root, onDidGenerate);
    });
}
