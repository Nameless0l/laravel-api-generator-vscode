import * as vscode from 'vscode';
import { ArtisanResult, ProtocolMessage } from '../types';
import { analyzeProtocolErrors, presentSuggestion } from '../services/errorAnalyzer';
import { lastProtocolDocument } from '../services/generationOutput';
import { summarizePlan } from '../services/planSummary';
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
    const document = lastProtocolDocument(result.output);
    if (document && document.errors.length > 0) {
        presentDocumentErrors(document.errors, workspaceRoot);
        return;
    }

    if (result.success) {
        vscode.window.showInformationMessage(t('sources.success'));
        if (onDidGenerate) {
            onDidGenerate();
        }
        return;
    }

    if (isUnsupportedOption(result)) {
        await offerPackageUpdate(workspaceRoot);
        return;
    }

    const output = result.output || result.errors.join('\n');
    const truncated = output.length > 800 ? `${output.slice(0, 800)}\n...` : output;
    vscode.window.showErrorMessage(t('sources.failed', truncated));
}

/** Errors of the package's JSON document, with the fix their code points to. */
export function presentDocumentErrors(errors: ProtocolMessage[], workspaceRoot: string): void {
    vscode.window.showErrorMessage(t('sources.failed', errors.map((e) => (e.hint ? `${e.message} ${e.hint}` : e.message)).join('\n')));
    const suggestion = analyzeProtocolErrors(errors);
    if (suggestion) {
        void presentSuggestion(workspaceRoot, suggestion);
    }
}

export async function offerPackageUpdate(workspaceRoot: string): Promise<void> {
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
}

/**
 * Shows what a dry run found and asks before writing. False when the dry run
 * failed (the error is shown) or the user closes the dialog.
 */
export async function confirmPlannedGeneration(dryRun: ArtisanResult, source: string, workspaceRoot: string): Promise<boolean> {
    const document = lastProtocolDocument(dryRun.output);
    if (!document) {
        await presentGenerationResult(dryRun, workspaceRoot);
        return false;
    }
    if (document.errors.length > 0) {
        presentDocumentErrors(document.errors, workspaceRoot);
        return false;
    }

    const summary = summarizePlan(document);
    const detail = [
        t('sources.planFiles', summary.create, summary.update, summary.kept),
        ...(summary.skipped.length > 0 ? ['', t('sources.planSkipped'), ...summary.skipped] : []),
        ...(summary.otherWarnings.length > 0 ? ['', ...summary.otherWarnings] : []),
    ].join('\n');
    const generate = t('sources.planGenerate');
    const choice = await vscode.window.showInformationMessage(
        t('sources.planSummary', source, summary.entities.join(', ')),
        { modal: true, detail },
        generate
    );

    return choice === generate;
}

/**
 * Multi-select QuickPick for the generation options shared by every source.
 * Returns undefined when the user cancels.
 */
export async function pickGenerationOptions(
    withMigrationsChoice: boolean
): Promise<{ queryBuilder: boolean; withMigrations: boolean; pest: boolean; jsonApi: boolean } | undefined> {
    const items: Array<vscode.QuickPickItem & { id: string }> = [
        { id: 'qb', label: t('sources.optQueryBuilder'), picked: false },
        { id: 'pest', label: t('sources.optPest'), picked: false },
        { id: 'json-api', label: t('sources.optJsonApi'), picked: false },
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
        jsonApi: picks.some((p) => p.id === 'json-api'),
    };
}
