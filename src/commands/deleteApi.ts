import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { ArtisanRunner } from '../services/artisanRunner';
import { DeletePlan, deletePlanFromFiles, parseDeleteDryRun } from '../services/deletePlan';
import { EntityScanner } from '../services/entityScanner';
import { FlowPanel } from '../webview/flowPanel';
import { GeneratorPanel } from '../webview/webviewPanel';
import { deleteWithProgress } from './generationShared';
import { pickEntity } from './entityPick';
import { t } from '../i18n';

export function registerDeleteCommand(extensionUri: vscode.Uri, onDidDelete: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.delete', async (item?: { entityName?: string }) => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        const root = check.root;

        const entity = await pickEntity(root, item, t('delete.pickTitle'));
        if (!entity) {
            return;
        }
        const deleted = (): void => {
            GeneratorPanel.forget(root, entity);
            onDidDelete();
        };

        const dryRun = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: t('delete.checking', entity), cancellable: false },
            () => new ArtisanRunner(root).deleteDryRun(entity)
        );
        const plan = dryRun.success ? (parseDeleteDryRun(dryRun.output) ?? scannedPlan(root, entity)) : null;
        if (plan && plan.files.length > 0) {
            FlowPanel.remove(extensionUri, root, entity, plan, deleted);
            return;
        }

        // Before 3.11 the package cannot list what it removes.
        const deleteLabel = t('delete.deleteAction');
        const confirm = await vscode.window.showWarningMessage(t('delete.confirm', entity), { modal: true }, deleteLabel);
        if (confirm !== deleteLabel) {
            return;
        }

        const result = await deleteWithProgress(root, entity);
        if (result.success) {
            vscode.window.showInformationMessage(t('delete.success', entity));
            deleted();
        } else {
            vscode.window.showErrorMessage(t('delete.failed', entity, result.errors.join(', ')));
        }
    });
}

function scannedPlan(root: string, entity: string): DeletePlan | null {
    const scanned = new EntityScanner(root).scan().find((candidate) => candidate.name === entity);
    return scanned ? deletePlanFromFiles(scanned.files, scanned.edited ?? []) : null;
}
