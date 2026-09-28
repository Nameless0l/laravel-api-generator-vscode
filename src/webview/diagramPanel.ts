import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { diagramData, toMermaid } from '../services/diagramData';
import { openProjectFile } from '../services/plannedContent';
import { getLocale, t, webviewStrings } from '../i18n';
import { iconSet } from './ui/icons';
import { renderPage } from './ui/page';

type Positions = Record<string, { x: number; y: number }>;

interface DiagramMessage {
    type: string;
    path?: string;
    command?: 'addFields' | 'regenerateFile' | 'delete';
    entity?: string;
    positions?: Positions;
    format?: 'svg' | 'mermaid';
    content?: string;
}

const POSITIONS_KEY = 'laravelApiGenerator.diagramPositions';
const ENTITY_COMMANDS = new Set(['addFields', 'regenerateFile', 'delete']);

export class DiagramPanel {
    private static current: DiagramPanel | undefined;

    private readonly disposables: vscode.Disposable[] = [];
    private loaded = false;
    private disposed = false;

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly root: string,
        private readonly memento: vscode.Memento
    ) {
        this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon-dark.png');
        this.panel.webview.html = this.html();
        this.disposables.push(
            this.panel.webview.onDidReceiveMessage((message: DiagramMessage) => void this.handle(message)),
            this.panel.onDidDispose(() => this.dispose())
        );
    }

    static show(extensionUri: vscode.Uri, root: string, memento: vscode.Memento): void {
        if (DiagramPanel.current && DiagramPanel.current.root === root) {
            DiagramPanel.current.panel.reveal();
            DiagramPanel.current.sendData();
            return;
        }
        DiagramPanel.current?.panel.dispose();

        const panel = vscode.window.createWebviewPanel('laravelApiGenerator.diagram', t('diagram.title'), vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        });
        DiagramPanel.current = new DiagramPanel(panel, extensionUri, root, memento);
    }

    /** Redraws an open diagram after the entities changed. */
    static refresh(): void {
        DiagramPanel.current?.sendData();
    }

    private html(): string {
        const webview = this.panel.webview;
        const asset = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview', file)).toString();
        return renderPage({
            cspSource: webview.cspSource,
            nonce: crypto.randomBytes(16).toString('hex'),
            lang: getLocale(),
            title: t('diagram.title'),
            styles: [asset('kit.css'), asset('diagram.css')],
            scripts: [asset('common.js'), asset('diagram.js')],
            body: '<div id="app" class="app"></div>',
            bodyClass: 'diagram-view',
            boot: { locale: getLocale(), strings: webviewStrings('diagram'), icons: iconSet() },
        });
    }

    private sendData(): void {
        if (!this.loaded || this.disposed) {
            return;
        }
        void this.panel.webview.postMessage({
            type: 'data',
            entities: diagramData(this.root),
            positions: this.memento.get<Record<string, Positions>>(POSITIONS_KEY, {})[this.root] ?? {},
        });
    }

    private async handle(message: DiagramMessage): Promise<void> {
        switch (message.type) {
            case 'loaded':
                this.loaded = true;
                this.sendData();
                break;
            case 'positions':
                if (message.positions) {
                    const all = this.memento.get<Record<string, Positions>>(POSITIONS_KEY, {});
                    await this.memento.update(POSITIONS_KEY, { ...all, [this.root]: message.positions });
                }
                break;
            case 'open':
                if (message.path) {
                    await openProjectFile(this.root, message.path);
                }
                break;
            case 'command':
                if (message.command && ENTITY_COMMANDS.has(message.command) && message.entity) {
                    await vscode.commands.executeCommand(`laravelApiGenerator.${message.command}`, { entityName: message.entity });
                }
                break;
            case 'newApi':
                await vscode.commands.executeCommand('laravelApiGenerator.generate');
                break;
            case 'export':
                await this.export(message.format, message.content);
                break;
        }
    }

    private async export(format: 'svg' | 'mermaid' | undefined, content: string | undefined): Promise<void> {
        const svg = format === 'svg';
        if (svg && !content) {
            return;
        }
        const target = await vscode.window.showSaveDialog({
            title: t('diagram.exportTitle'),
            defaultUri: vscode.Uri.file(path.join(this.root, svg ? 'entity-diagram.svg' : 'entity-diagram.mmd')),
            filters: svg ? { SVG: ['svg'] } : { Mermaid: ['mmd', 'mermaid'] },
        });
        if (!target) {
            return;
        }
        fs.writeFileSync(target.fsPath, svg ? (content as string) : toMermaid(diagramData(this.root)), 'utf-8');
        const open = t('diagram.openExport');
        const choice = await vscode.window.showInformationMessage(t('diagram.exported', path.basename(target.fsPath)), open);
        if (choice === open) {
            await vscode.commands.executeCommand('vscode.open', target);
        }
    }

    private dispose(): void {
        this.disposed = true;
        if (DiagramPanel.current === this) {
            DiagramPanel.current = undefined;
        }
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }
}
