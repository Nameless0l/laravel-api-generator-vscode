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

    private async handleMessage(message: { type: string; payload: EntityConfig }): Promise<void> {
        switch (message.type) {
            case 'generate':
                await this.handleGenerate(message.payload);
                break;
            case 'preview':
                this.handlePreview(message.payload);
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
