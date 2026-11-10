import * as vscode from 'vscode';
import { ArtisanResult, ProtocolMessage } from '../types';
import { ArtisanRunner } from '../services/artisanRunner';
import { analyzeProtocolErrors, presentSuggestion } from '../services/errorAnalyzer';
import { logCommand } from '../services/outputLog';
import { t } from '../i18n';

/** An option the installed package does not know yet. */
export function isUnsupportedOption(result: ArtisanResult): boolean {
    const text = `${result.output}\n${result.errors.join('\n')}`;
    return /option does not exist/i.test(text);
}

/** Errors of the package's JSON document, with the fix their code points to. */
export function presentDocumentErrors(errors: ProtocolMessage[], workspaceRoot: string): void {
    vscode.window.showErrorMessage(t('sources.failed', errors.map((e) => (e.hint ? `${e.message} ${e.hint}` : e.message)).join('\n')));
    const suggestion = analyzeProtocolErrors(errors);
    if (suggestion) {
        void presentSuggestion(workspaceRoot, suggestion);
    }
}

export function deleteWithProgress(workspaceRoot: string, entity: string): Thenable<ArtisanResult> {
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: t('delete.progress', entity), cancellable: false }, async () => {
        const result = await new ArtisanRunner(workspaceRoot).delete(entity);
        logCommand(`php artisan delete:fullapi ${entity} --force`, result.output);
        return result;
    });
}

export async function offerPackageUpdate(workspaceRoot: string): Promise<void> {
    const updateLabel = t('sources.updatePackage');
    const action = await vscode.window.showErrorMessage(t('sources.packageTooOld'), updateLabel);
    if (action === updateLabel) {
        const terminal = vscode.window.createTerminal({ name: 'Laravel API Generator', cwd: workspaceRoot });
        terminal.sendText('composer update nameless/laravel-api-generator -W');
        terminal.show();
    }
}
