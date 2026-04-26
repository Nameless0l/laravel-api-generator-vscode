import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { t } from '../i18n';

interface RawSnippet {
    prefix: string;
    scope?: string;
    body: string[] | string;
    description?: string;
}

interface SnippetEntry {
    title: string;
    prefix: string;
    description: string;
    body: string;
}

export function registerShowSnippetsCommand(extensionPath: string): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.showSnippets', async () => {
        const snippetsPath = path.join(extensionPath, 'snippets', 'laravel-api-generator.json');
        if (!fs.existsSync(snippetsPath)) {
            vscode.window.showErrorMessage(t('snippets.notFound'));
            return;
        }

        let raw: Record<string, RawSnippet>;
        try {
            raw = JSON.parse(fs.readFileSync(snippetsPath, 'utf-8'));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            vscode.window.showErrorMessage(t('snippets.parseFailed', msg));
            return;
        }

        const entries: SnippetEntry[] = Object.entries(raw).map(([title, snip]) => ({
            title,
            prefix: snip.prefix,
            description: snip.description ?? '',
            body: Array.isArray(snip.body) ? snip.body.join('\n') : snip.body,
        }));

        const items = entries.map((entry) => ({
            label: `$(symbol-snippet) ${entry.title}`,
            description: entry.prefix,
            detail: entry.description,
            entry,
        }));

        const pick = await vscode.window.showQuickPick(items, {
            title: t('snippets.pickTitle'),
            placeHolder: t('snippets.pickPlaceholder'),
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (!pick) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        const isPhp = editor?.document.languageId === 'php';

        if (isPhp && editor) {
            // Pass the body straight through. After JSON.parse, the body already
            // contains `\$field` (literal backslash + dollar). VS Code's snippet
            // engine renders `\$` as a literal `$`, so $field, $request, etc.
            // come out correct. Stripping the backslash here would let the engine
            // treat `$field` as an undefined snippet variable and silently eat it.
            const snippet = new vscode.SnippetString(pick.entry.body);
            await editor.insertSnippet(snippet);
            vscode.window.showInformationMessage(
                t('snippets.inserted', pick.entry.title)
            );
        } else {
            // No PHP file open: copy a runnable plain-text version to the clipboard
            await vscode.env.clipboard.writeText(plainTextBody(pick.entry.body));
            vscode.window.showInformationMessage(
                t('snippets.copied', pick.entry.title)
            );
        }
    });
}

/**
 * Build a clipboard-friendly version of a snippet body:
 *   - `\$`               → literal `$`
 *   - `${N:default}`     → `default`
 *   - bare `$N` tab-stop → empty
 *
 * Order matters: we resolve `\$` first (to recover literal dollars like
 * `$field` and `$request`), then expand `${N:...}` placeholders. The final
 * `$\d+` pass only matches bare tab-stop refs (`$0`, `$1`, ...), so literal
 * PHP variables like `$field` stay intact.
 */
function plainTextBody(body: string): string {
    return body
        .replace(/\\\$/g, '$')
        .replace(/\$\{(\d+):([^}]*)\}/g, '$2')
        .replace(/\$\d+/g, '');
}
