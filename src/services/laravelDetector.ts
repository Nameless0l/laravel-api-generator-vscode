import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class LaravelDetector {
    static isLaravelProject(workspaceRoot: string): boolean {
        const artisanPath = path.join(workspaceRoot, 'artisan');
        return fs.existsSync(artisanPath);
    }

    static isPackageInstalled(workspaceRoot: string): boolean {
        const composerPath = path.join(workspaceRoot, 'composer.json');
        if (!fs.existsSync(composerPath)) {
            return false;
        }

        try {
            const content = fs.readFileSync(composerPath, 'utf-8');
            const composer = JSON.parse(content);
            const require = composer.require || {};
            const requireDev = composer['require-dev'] || {};
            return (
                'nameless/laravel-api-generator' in require ||
                'nameless/laravel-api-generator' in requireDev
            );
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

    static validate(): { valid: boolean; root?: string; message?: string } {
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
                message: 'nameless/laravel-api-generator is not installed. Run: composer require nameless/laravel-api-generator',
            };
        }
        return { valid: true, root };
    }
}
