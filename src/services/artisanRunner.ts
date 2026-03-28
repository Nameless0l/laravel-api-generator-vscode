import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { ArtisanResult, EntityConfig } from '../types';

export class ArtisanRunner {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    private getPhpPath(): string {
        const config = vscode.workspace.getConfiguration('laravelApiGenerator');
        return config.get<string>('phpPath', 'php');
    }

    async generate(config: EntityConfig): Promise<ArtisanResult> {
        const args = ['artisan', 'make:fullapi', config.name];

        if (config.fields.length > 0) {
            const fieldsStr = config.fields
                .map((f) => `${f.name}:${f.type}`)
                .join(',');
            args.push(`--fields=${fieldsStr}`);
        }

        if (config.options.softDeletes) {
            args.push('--soft-deletes');
        }
        if (config.options.auth) {
            args.push('--auth');
        }
        if (config.options.postman) {
            args.push('--postman');
        }

        return this.run(args);
    }

    async delete(entityName: string): Promise<ArtisanResult> {
        const args = ['artisan', 'delete:fullapi', entityName, '--force'];
        return this.run(args);
    }

    private run(args: string[]): Promise<ArtisanResult> {
        const phpPath = this.getPhpPath();

        return new Promise((resolve) => {
            execFile(
                phpPath,
                args,
                {
                    cwd: this.workspaceRoot,
                    timeout: 30000,
                    env: { ...process.env, FORCE_COLOR: '0' },
                },
                (error, stdout, stderr) => {
                    const output = stdout.toString();
                    const errorOutput = stderr.toString();

                    if (error) {
                        resolve({
                            success: false,
                            output,
                            errors: [errorOutput || error.message],
                        });
                        return;
                    }

                    const hasError =
                        output.toLowerCase().includes('error') ||
                        errorOutput.toLowerCase().includes('error');

                    resolve({
                        success: !hasError,
                        output,
                        errors: hasError ? [errorOutput || output] : [],
                    });
                }
            );
        });
    }
}
