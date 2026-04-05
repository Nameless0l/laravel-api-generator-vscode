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

    async generateFromJson(): Promise<ArtisanResult> {
        const args = ['artisan', 'make:fullapi'];
        return this.run(args, 120000);
    }

    async delete(entityName: string): Promise<ArtisanResult> {
        const args = ['artisan', 'delete:fullapi', entityName, '--force'];
        return this.run(args);
    }

    async migrate(): Promise<ArtisanResult> {
        return this.run(['artisan', 'migrate']);
    }

    async seed(): Promise<ArtisanResult> {
        return this.run(['artisan', 'migrate:fresh', '--seed']);
    }

    async test(): Promise<ArtisanResult> {
        return this.run(['artisan', 'test'], 60000);
    }

    async routes(): Promise<ArtisanResult> {
        return this.run(['artisan', 'route:list', '--path=api']);
    }

    private run(args: string[], timeout: number = 30000): Promise<ArtisanResult> {
        const phpPath = this.getPhpPath();

        return new Promise((resolve) => {
            execFile(
                phpPath,
                args,
                {
                    cwd: this.workspaceRoot,
                    timeout,
                    env: { ...process.env, FORCE_COLOR: '0' },
                },
                (error, stdout, stderr) => {
                    const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, '');
                    const output = stripAnsi(stdout.toString());
                    const errorOutput = stripAnsi(stderr.toString());
                    const fullOutput = output || errorOutput;

                    resolve({
                        success: !error,
                        output: fullOutput,
                        errors: error ? [fullOutput] : [],
                    });
                }
            );
        });
    }
}
