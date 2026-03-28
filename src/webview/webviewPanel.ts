import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getWebviewContent } from './getWebviewContent';
import { ArtisanRunner } from '../services/artisanRunner';
import { EntityScanner } from '../services/entityScanner';
import { EntityConfig } from '../types';

export class GeneratorPanel {
    public static currentPanel: GeneratorPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly artisan: ArtisanRunner;
    private readonly scanner: EntityScanner;
    private disposables: vscode.Disposable[] = [];
    private onDidGenerate: (() => void) | undefined;

    private constructor(
        panel: vscode.WebviewPanel,
        private workspaceRoot: string
    ) {
        this.panel = panel;
        this.artisan = new ArtisanRunner(workspaceRoot);
        this.scanner = new EntityScanner(workspaceRoot);

        const nonce = crypto.randomBytes(16).toString('hex');
        this.panel.webview.html = getWebviewContent(this.panel.webview, nonce);

        this.panel.webview.onDidReceiveMessage(
            (message) => this.handleMessage(message),
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    static show(workspaceRoot: string, onDidGenerate?: () => void): void {
        if (GeneratorPanel.currentPanel) {
            GeneratorPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            GeneratorPanel.currentPanel.onDidGenerate = onDidGenerate;
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'laravelApiGenerator',
            'Laravel API Generator',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        GeneratorPanel.currentPanel = new GeneratorPanel(panel, workspaceRoot);
        GeneratorPanel.currentPanel.onDidGenerate = onDidGenerate;
    }

    private async handleMessage(message: { type: string; payload?: EntityConfig; action?: string }): Promise<void> {
        switch (message.type) {
            case 'generate':
                if (message.payload) {
                    await this.handleGenerate(message.payload);
                }
                break;
            case 'preview':
                if (message.payload) {
                    this.handlePreview(message.payload);
                }
                break;
            case 'action':
                if (message.action) {
                    await this.handleAction(message.action);
                }
                break;
        }
    }

    private async handleGenerate(config: EntityConfig): Promise<void> {
        const result = await this.artisan.generate(config);

        this.panel.webview.postMessage({
            type: 'generationResult',
            success: result.success,
            output: result.output,
            errors: result.errors,
        });

        if (result.success && this.onDidGenerate) {
            this.onDidGenerate();
        }
    }

    private async handleAction(action: string): Promise<void> {
        let result;
        switch (action) {
            case 'migrate':
                result = await this.artisan.migrate();
                break;
            case 'seed': {
                const confirm = await vscode.window.showWarningMessage(
                    'This will drop all tables and re-run all migrations + seeders. All existing data will be lost.',
                    { modal: true },
                    'Continue'
                );
                if (confirm !== 'Continue') { return; }
                result = await this.artisan.seed();
                break;
            }
            case 'test':
                result = await this.artisan.test();
                break;
            case 'routes':
                result = await this.artisan.routes();
                break;
            case 'docs':
                vscode.env.openExternal(vscode.Uri.parse('http://localhost:8000/docs/api'));
                return;
            default:
                return;
        }

        this.panel.webview.postMessage({
            type: 'actionResult',
            success: result.success,
            output: result.output || result.errors.join('\n'),
        });
    }

    private handlePreview(config: EntityConfig): void {
        const files = this.scanner
            .getEntityFiles(config.name)
            .map((f) => `${f.exists ? '⚠ EXISTS' : '  NEW  '} ${f.path}`);

        this.panel.webview.postMessage({
            type: 'previewResult',
            files,
        });
    }

    private dispose(): void {
        GeneratorPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
