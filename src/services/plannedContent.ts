import * as vscode from 'vscode';
import * as path from 'path';
import { PlannedFile } from '../types';
import { t } from '../i18n';

const SCHEME = 'laravel-api-plan';
const contents = new Map<string, string>();
const changed = new vscode.EventEmitter<vscode.Uri>();

/** Serves the files a preview or a dry run planned, so they open read-only and diff against the disk. */
export function registerPlannedContent(): vscode.Disposable {
    return vscode.Disposable.from(
        changed,
        vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
            onDidChange: changed.event,
            provideTextDocumentContent: (uri) => contents.get(uri.path.replace(/^\//, '')) ?? '',
        })
    );
}

export function rememberPlanned(files: PlannedFile[]): void {
    for (const file of files) {
        if (file.content === undefined) {
            continue;
        }
        contents.set(file.path, file.content);
        changed.fire(plannedUri(file.path));
    }
}

export function plannedUri(relativePath: string): vscode.Uri {
    return vscode.Uri.from({ scheme: SCHEME, path: '/' + relativePath });
}

export async function openPlannedDiff(root: string, relativePath: string): Promise<void> {
    const current = vscode.Uri.file(path.join(root, ...relativePath.split('/')));
    await vscode.commands.executeCommand('vscode.diff', current, plannedUri(relativePath), t('preview.diffTitle', relativePath), { preview: true });
}

export async function openPlannedDiffs(root: string, paths: string[]): Promise<void> {
    if (paths.length <= 1) {
        if (paths[0]) {
            await openPlannedDiff(root, paths[0]);
        }
        return;
    }
    const picks = await vscode.window.showQuickPick(
        paths.map((file) => ({ label: path.basename(file), description: path.dirname(file), file })),
        { canPickMany: true, placeHolder: t('flow.viewDiffs') }
    );
    for (const pick of picks ?? []) {
        await openPlannedDiff(root, pick.file);
    }
}

export async function openPlanned(relativePath: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(plannedUri(relativePath));
    await vscode.window.showTextDocument(document, { preview: true });
}

export async function openProjectFile(root: string, relativePath: string): Promise<void> {
    try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, ...relativePath.split('/'))));
        await vscode.window.showTextDocument(document, { preview: false });
    } catch {
        // The file may have been removed since the view was drawn.
    }
}
