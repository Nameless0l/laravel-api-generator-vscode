import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { t } from '../i18n';

export class LaravelDetector {
    static isLaravelProject(workspaceRoot: string): boolean {
        const artisanPath = path.join(workspaceRoot, 'artisan');
        return fs.existsSync(artisanPath);
    }

    static isPackageInstalled(workspaceRoot: string): boolean {
        return this.hasComposerPackage(workspaceRoot, 'nameless/laravel-api-generator');
    }

    static isScrambleInstalled(workspaceRoot: string): boolean {
        return this.hasComposerPackage(workspaceRoot, 'dedoc/scramble');
    }

    static isSanctumInstalled(workspaceRoot: string): boolean {
        return this.hasComposerPackage(workspaceRoot, 'laravel/sanctum');
    }

    static isQueryBuilderInstalled(workspaceRoot: string): boolean {
        return this.hasComposerPackage(workspaceRoot, 'spatie/laravel-query-builder');
    }

    /**
     * The generated code needs spatie/laravel-query-builder at runtime when
     * the QueryBuilder option is on. Non-blocking: offers a one-click
     * composer require but never stops the generation itself.
     */
    static async promptQueryBuilderInstallIfMissing(workspaceRoot: string): Promise<void> {
        if (this.isQueryBuilderInstalled(workspaceRoot)) {
            return;
        }
        const installLabel = t('package.installViaComposer');
        const action = await vscode.window.showWarningMessage(
            t('package.queryBuilderMissing'),
            installLabel
        );
        if (action === installLabel) {
            const terminal = vscode.window.createTerminal({
                name: 'Laravel API Generator',
                cwd: workspaceRoot,
            });
            terminal.sendText('composer require spatie/laravel-query-builder');
            terminal.show();
        }
    }

    private static hasComposerPackage(workspaceRoot: string, packageName: string): boolean {
        const composerPath = path.join(workspaceRoot, 'composer.json');
        if (!fs.existsSync(composerPath)) {
            return false;
        }
        try {
            const content = fs.readFileSync(composerPath, 'utf-8');
            const composer = JSON.parse(content);
            const require = composer.require || {};
            const requireDev = composer['require-dev'] || {};
            return packageName in require || packageName in requireDev;
        } catch {
            return false;
        }
    }

    private static cachedRoot: string | undefined;
    private static cacheInitialized = false;

    static getWorkspaceRoot(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return undefined;
        }
        if (!this.cacheInitialized) {
            this.cachedRoot = this.findLaravelRoot(folders) ?? folders[0].uri.fsPath;
            this.cacheInitialized = true;
        }
        return this.cachedRoot;
    }

    /** Reset the cached root (called when workspace folders change). */
    static resetCache(): void {
        this.cachedRoot = undefined;
        this.cacheInitialized = false;
    }

    /**
     * Locate the Laravel project: workspace folder roots first, then
     * up to two levels of subdirectories (monorepos with Laravel in
     * e.g. backend/ or apps/api/).
     */
    private static findLaravelRoot(folders: readonly vscode.WorkspaceFolder[]): string | undefined {
        for (const folder of folders) {
            if (this.isLaravelProject(folder.uri.fsPath)) {
                return folder.uri.fsPath;
            }
        }
        for (const folder of folders) {
            const nested = this.searchArtisan(folder.uri.fsPath, 2);
            if (nested) {
                return nested;
            }
        }
        return undefined;
    }

    private static searchArtisan(dir: string, depth: number): string | undefined {
        if (depth <= 0) {
            return undefined;
        }
        const skip = new Set(['node_modules', 'vendor', 'storage', 'public', 'resources', 'dist', 'out']);
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return undefined;
        }
        const subdirs = entries.filter(
            (e) => e.isDirectory() && !e.name.startsWith('.') && !skip.has(e.name)
        );
        for (const sub of subdirs) {
            const candidate = path.join(dir, sub.name);
            if (this.isLaravelProject(candidate)) {
                return candidate;
            }
        }
        for (const sub of subdirs) {
            const found = this.searchArtisan(path.join(dir, sub.name), depth - 1);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    static validate(): { valid: boolean; root?: string; message?: string; packageMissing?: boolean } {
        const root = this.getWorkspaceRoot();
        if (!root) {
            return { valid: false, message: 'No workspace folder open.' };
        }
        if (!this.isLaravelProject(root)) {
            return { valid: false, message: 'This is not a Laravel project (no artisan file found).' };
        }
        if (!this.isPackageInstalled(root)) {
            return {
                valid: false,
                root,
                packageMissing: true,
                message: 'nameless/laravel-api-generator is not installed. Run: composer require --dev nameless/laravel-api-generator',
            };
        }
        return { valid: true, root };
    }

    static async validateOrPromptInstall(): Promise<{ valid: boolean; root?: string }> {
        const check = this.validate();

        if (check.packageMissing && check.root) {
            const installLabel = t('package.installViaComposer');
            const action = await vscode.window.showWarningMessage(
                t('package.missing'),
                installLabel,
                t('common.cancel')
            );
            if (action === installLabel) {
                const terminal = vscode.window.createTerminal({
                    name: 'Laravel API Generator',
                    cwd: check.root,
                });
                terminal.sendText('composer require --dev nameless/laravel-api-generator');
                terminal.show();
            }
            return { valid: false };
        }

        if (!check.valid) {
            vscode.window.showErrorMessage(check.message || 'Cannot detect Laravel project.');
            return { valid: false };
        }

        return { valid: true, root: check.root };
    }
}
