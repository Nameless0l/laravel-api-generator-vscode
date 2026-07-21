import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { t, getLocale } from '../i18n';
import { getSidebarHomeHtml, SidebarHomeStrings } from './sidebarHomeContent';

const DOCS_BASE = 'https://nameless0l.github.io/laravel-api-generator/';

const ALLOWED_COMMANDS = new Set([
    'laravelApiGenerator.generate',
    'laravelApiGenerator.generateFromDatabase',
    'laravelApiGenerator.generateFromSchema',
    'laravelApiGenerator.generateFromMermaid',
    'laravelApiGenerator.diagram',
    'laravelApiGenerator.showSnippets',
]);

export class SidebarHomeViewProvider implements vscode.WebviewViewProvider {
    static readonly viewId = 'laravelApiGenerator.home';

    constructor(private readonly context: vscode.ExtensionContext) {}

    resolveWebviewView(view: vscode.WebviewView): void {
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
        };

        const render = (): void => {
            view.webview.html = this.buildHtml(view.webview);
        };
        render();

        view.webview.onDidReceiveMessage((msg: { type?: string; command?: string }) => {
            if (msg?.type === 'run' && msg.command && ALLOWED_COMMANDS.has(msg.command)) {
                void vscode.commands.executeCommand(msg.command);
            }
        });

        const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('laravelApiGenerator.locale')) {
                render();
            }
        });
        view.onDidDispose(() => configListener.dispose());
    }

    private buildHtml(webview: vscode.Webview): string {
        const strings: SidebarHomeStrings = {
            tagline: t('sidebar.tagline'),
            newApi: t('sidebar.newApi'),
            generateFrom: t('sidebar.generateFrom'),
            database: t('sidebar.database'),
            databaseDesc: t('sidebar.databaseDesc'),
            schema: t('sidebar.schema'),
            schemaDesc: t('sidebar.schemaDesc'),
            mermaid: t('sidebar.mermaid'),
            mermaidDesc: t('sidebar.mermaidDesc'),
            explore: t('sidebar.explore'),
            diagram: t('sidebar.diagram'),
            snippets: t('sidebar.snippets'),
            docs: t('sidebar.docs'),
        };
        const docsUrl =
            getLocale() === 'fr' ? `${DOCS_BASE}fr/guide/extension/` : `${DOCS_BASE}guide/extension/`;

        const mediaUri = (file: string): string =>
            webview
                .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', file))
                .toString();

        return getSidebarHomeHtml({
            cspSource: webview.cspSource,
            nonce: crypto.randomBytes(16).toString('hex'),
            logoDarkUri: mediaUri('API_dark.png'),
            logoLightUri: mediaUri('API.png'),
            version: (this.context.extension.packageJSON as { version?: string }).version ?? '',
            docsUrl,
            strings,
        });
    }
}
