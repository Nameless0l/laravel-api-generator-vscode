import * as vscode from 'vscode';
import { ArtisanResult } from '../types';
import { t } from '../i18n';

/**
 * Shared plumbing for the "generate from source" commands
 * (database / schema file / Mermaid diagram), which all require
 * nameless/laravel-api-generator >= 3.5.
 */

export function isUnsupportedOption(result: ArtisanResult): boolean {
    const text = `${result.output}\n${result.errors.join('\n')}`;
    return /option does not exist/i.test(text);
}

export async function presentGenerationResult(
    result: ArtisanResult,
    workspaceRoot: string,
    onDidGenerate?: () => void
): Promise<void> {
    if (result.success) {
        vscode.window.showInformationMessage(t('sources.success'));
        if (onDidGenerate) {
            onDidGenerate();
        }
        return;
    }

    if (isUnsupportedOption(result)) {
        const updateLabel = t('sources.updatePackage');
        const action = await vscode.window.showErrorMessage(t('sources.packageTooOld'), updateLabel);
        if (action === updateLabel) {
            const terminal = vscode.window.createTerminal({
                name: 'Laravel API Generator',
                cwd: workspaceRoot,
            });
            terminal.sendText('composer update nameless/laravel-api-generator -W');
            terminal.show();
        }
        return;
    }

    const output = result.output || result.errors.join('\n');
    const truncated = output.length > 800 ? `${output.slice(0, 800)}\n...` : output;
    vscode.window.showErrorMessage(t('sources.failed', truncated));
}

/**
 * Multi-select QuickPick for the generation options shared by every source.
 * Returns undefined when the user cancels.
 */
export async function pickGenerationOptions(
    withMigrationsChoice: boolean
): Promise<{ queryBuilder: boolean; withMigrations: boolean; pest: boolean } | undefined> {
    const items: Array<vscode.QuickPickItem & { id: string }> = [
        { id: 'qb', label: t('sources.optQueryBuilder'), picked: false },
        { id: 'pest', label: t('sources.optPest'), picked: false },
    ];
    if (withMigrationsChoice) {
        items.push({ id: 'mig', label: t('sources.optWithMigrations'), picked: false });
    }

    const picks = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        title: t('sources.optionsTitle'),
        placeHolder: t('sources.optionsPlaceholder'),
    });

    if (picks === undefined) {
        return undefined;
    }

    return {
        queryBuilder: picks.some((p) => p.id === 'qb'),
        withMigrations: picks.some((p) => p.id === 'mig'),
        pest: picks.some((p) => p.id === 'pest'),
    };
}
