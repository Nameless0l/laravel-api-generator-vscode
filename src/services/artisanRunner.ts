import * as vscode from 'vscode';
import { execFile, spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import { ArtisanResult, EntityConfig } from '../types';

export class ArtisanRunner {
    private workspaceRoot: string;
    private serveProcess: ChildProcess | undefined;
    private servePort: number | undefined;

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

    async publishStubs(): Promise<ArtisanResult> {
        return this.run(['artisan', 'vendor:publish', '--tag=api-generator-stubs', '--force']);
    }

    /**
     * Check if a Laravel server is reachable on the given port.
     */
    private checkServerRunning(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const req = http.get(`http://127.0.0.1:${port}`, (res) => {
                res.resume();
                resolve(true);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(2000, () => {
                req.destroy();
                resolve(false);
            });
        });
    }

    /**
     * Try common ports to find a running Laravel server.
     */
    private async findRunningServer(): Promise<number | null> {
        const ports = [8000, 8001, 8002, 8003, 8080];
        for (const port of ports) {
            if (await this.checkServerRunning(port)) {
                return port;
            }
        }
        return null;
    }

    /**
     * Start php artisan serve and return the detected port.
     */
    async startServe(): Promise<{ success: boolean; port?: number; error?: string }> {
        // If we already have a running serve process, return its port
        if (this.serveProcess && !this.serveProcess.killed && this.servePort) {
            const still = await this.checkServerRunning(this.servePort);
            if (still) {
                return { success: true, port: this.servePort };
            }
        }

        // Check if a server is already running on common ports
        const existingPort = await this.findRunningServer();
        if (existingPort) {
            this.servePort = existingPort;
            return { success: true, port: existingPort };
        }

        // Start php artisan serve
        const phpPath = this.getPhpPath();
        return new Promise((resolve) => {
            const proc = spawn(phpPath, ['artisan', 'serve'], {
                cwd: this.workspaceRoot,
                env: { ...process.env },
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            this.serveProcess = proc;
            let resolved = false;

            const onData = (data: Buffer) => {
                const text = data.toString();
                // Laravel outputs: "Server running on [http://127.0.0.1:8000]"
                const match = text.match(/Server running on \[http:\/\/127\.0\.0\.1:(\d+)\]/);
                if (match && !resolved) {
                    resolved = true;
                    this.servePort = parseInt(match[1], 10);
                    resolve({ success: true, port: this.servePort });
                }
            };

            proc.stdout?.on('data', onData);
            proc.stderr?.on('data', onData);

            proc.on('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    resolve({ success: false, error: `Failed to start server: ${err.message}` });
                }
            });

            proc.on('exit', (code) => {
                if (!resolved) {
                    resolved = true;
                    resolve({ success: false, error: `Server exited with code ${code}` });
                }
                this.serveProcess = undefined;
                this.servePort = undefined;
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve({ success: false, error: 'Server start timed out after 10s' });
                }
            }, 10000);
        });
    }

    /**
     * Stop the serve process if we started one.
     */
    stopServe(): void {
        if (this.serveProcess && !this.serveProcess.killed) {
            this.serveProcess.kill();
            this.serveProcess = undefined;
            this.servePort = undefined;
        }
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
                    const output = stripAnsi(stdout.toString()).trim();
                    const errorOutput = stripAnsi(stderr.toString()).trim();

                    // Combine both stdout and stderr to never lose output
                    const parts = [output, errorOutput].filter(Boolean);
                    const fullOutput = parts.join('\n') || (error ? `Command failed: ${error.message}` : '');

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
