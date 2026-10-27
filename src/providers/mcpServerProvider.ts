import * as vscode from 'vscode';
import { ArtisanRunner } from '../services/artisanRunner';
import { CursorServer, cursorServer, MCP_PROVIDER_ID, MCP_SERVER_LABEL, MCP_SERVER_NAME, mcpLaunch } from '../services/mcpServer';

interface StdioServerDefinition {
    readonly label: string;
    command: string;
    args: string[];
    env: Record<string, string | number | null>;
    version?: string;
    cwd?: vscode.Uri;
}

interface McpApi {
    McpStdioServerDefinition?: new (
        label: string,
        command: string,
        args?: string[],
        env?: Record<string, string | number | null>,
        version?: string
    ) => StdioServerDefinition;
    lm?: {
        registerMcpServerDefinitionProvider?: (
            id: string,
            provider: {
                onDidChangeMcpServerDefinitions?: vscode.Event<void>;
                provideMcpServerDefinitions(): StdioServerDefinition[];
            }
        ) => vscode.Disposable;
    };
}

interface CursorApi {
    cursor?: {
        mcp?: {
            registerServer?: (config: CursorServer) => void;
            unregisterServer?: (name: string) => void;
        };
        plugins?: {
            registerPath?: (path: string) => void;
            unregisterPath?: (path: string) => void;
        };
    };
}

export type AgentHost = 'cursor' | 'copilot' | 'other';

export function agentHost(): AgentHost {
    if ((vscode as unknown as CursorApi).cursor?.mcp?.registerServer) {
        return 'cursor';
    }
    const api = vscode as unknown as McpApi;
    return api.McpStdioServerDefinition && api.lm?.registerMcpServerDefinitionProvider ? 'copilot' : 'other';
}

/** Copilot gets the server from a provider (VS Code 1.101+), Cursor from its own API; other editors get nothing, and nothing breaks. */
export function registerAgents(root: string, extensionPath: string): vscode.Disposable[] {
    return agentHost() === 'cursor' ? registerCursorAgents(root, extensionPath) : registerMcpServerProvider(root);
}

function onServerInputs(root: string, fire: () => void): vscode.Disposable[] {
    const installed = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, 'vendor/composer/installed.json'));
    installed.onDidCreate(fire);
    installed.onDidChange(fire);
    installed.onDidDelete(fire);

    return [
        installed,
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (
                e.affectsConfiguration('laravelApiGenerator.mcp') ||
                e.affectsConfiguration('laravelApiGenerator.phpCommand') ||
                e.affectsConfiguration('laravelApiGenerator.phpPath')
            ) {
                fire();
            }
        }),
    ];
}

function mcpEnabled(): boolean {
    return vscode.workspace.getConfiguration('laravelApiGenerator').get<boolean>('mcp.enabled', true);
}

/** The skill folder and the server, registered while the server can start. */
function registerCursorAgents(root: string, extensionPath: string): vscode.Disposable[] {
    const cursor = (vscode as unknown as CursorApi).cursor;
    const disposables: vscode.Disposable[] = [];

    const plugins = cursor?.plugins;
    if (plugins?.registerPath) {
        plugins.registerPath(extensionPath);
        disposables.push({ dispose: () => plugins.unregisterPath?.(extensionPath) });
    }

    const mcp = cursor?.mcp;
    if (!mcp?.registerServer || !mcp.unregisterServer) {
        return disposables;
    }
    const { registerServer, unregisterServer } = mcp;
    let registered = false;
    const sync = (): void => {
        if (registered) {
            unregisterServer(MCP_SERVER_NAME);
            registered = false;
        }
        const php = new ArtisanRunner(root).phpCommand();
        if (mcpEnabled() && mcpLaunch(root, php)) {
            registerServer(cursorServer(root, php));
            registered = true;
        }
    };
    sync();

    return [
        ...disposables,
        ...onServerInputs(root, sync),
        {
            dispose: () => {
                if (registered) {
                    unregisterServer(MCP_SERVER_NAME);
                }
            },
        },
    ];
}

function registerMcpServerProvider(root: string): vscode.Disposable[] {
    const api = vscode as unknown as McpApi;
    const Definition = api.McpStdioServerDefinition;
    const lm = api.lm;

    if (!Definition || !lm?.registerMcpServerDefinitionProvider) {
        return [];
    }

    const changed = new vscode.EventEmitter<void>();
    const fire = (): void => changed.fire();

    const provider = lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
        onDidChangeMcpServerDefinitions: changed.event,
        provideMcpServerDefinitions: () => {
            if (!mcpEnabled()) {
                return [];
            }

            const launch = mcpLaunch(root, new ArtisanRunner(root).phpCommand());
            if (!launch) {
                return [];
            }

            const server = new Definition(MCP_SERVER_LABEL, launch.command, launch.args, {}, launch.version);
            server.cwd = vscode.Uri.file(root);

            return [server];
        },
    });

    return [changed, provider, ...onServerInputs(root, fire)];
}
