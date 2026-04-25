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

    static getWorkspaceRoot(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return undefined;
        }
        return folders[0].uri.fsPath;
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
                message: 'nameless/laravel-api-generator is not installed. Run: composer require nameless/laravel-api-generator',
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
                terminal.sendText('composer require nameless/laravel-api-generator');
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
