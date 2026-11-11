import * as vscode from 'vscode';
import { ArtisanRunner } from '../services/artisanRunner';
import {
    apiServerLabel,
    apiServerLaunch,
    cursorApiServer,
    CursorServer,
    cursorServer,
    MCP_PROVIDER_ID,
    MCP_SERVER_LABEL,
    McpLaunch,
    mcpLaunch,
} from '../services/mcpServer';

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
    const watchers = ['vendor/composer/installed.json', 'routes/ai.php', 'app/Mcp/Servers/ApiServer.php'].map((file) => {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, file));
        watcher.onDidCreate(fire);
        watcher.onDidChange(fire);
        watcher.onDidDelete(fire);
        return watcher;
    });

    return [
        ...watchers,
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

export function apiServerEnabled(): boolean {
    return vscode.workspace.getConfiguration('laravelApiGenerator').get<boolean>('mcp.apiServer', true);
}

/** The skill folder and the servers, registered while they can start. */
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
    let registered: string[] = [];
    const clear = (): void => {
        registered.forEach((name) => unregisterServer(name));
        registered = [];
    };
    const sync = (): void => {
        clear();
        const php = new ArtisanRunner(root).phpCommand();
        const servers = [
            mcpEnabled() && mcpLaunch(root, php) ? cursorServer(root, php) : null,
            apiServerEnabled() && apiServerLaunch(root, php) ? cursorApiServer(root, php) : null,
        ];
        for (const server of servers) {
            if (server) {
                registerServer(server);
                registered.push(server.name);
            }
        }
    };
    sync();

    return [...disposables, ...onServerInputs(root, sync), { dispose: clear }];
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
            const php = new ArtisanRunner(root).phpCommand();
            const servers: StdioServerDefinition[] = [];
            const offer = (label: string, launch: McpLaunch | null): void => {
                if (launch) {
                    const server = new Definition(label, launch.command, launch.args, {}, launch.version);
                    server.cwd = vscode.Uri.file(root);
                    servers.push(server);
                }
            };
            offer(MCP_SERVER_LABEL, mcpEnabled() ? mcpLaunch(root, php) : null);
            offer(apiServerLabel(root), apiServerEnabled() ? apiServerLaunch(root, php) : null);

            return servers;
        },
    });

    return [changed, provider, ...onServerInputs(root, fire)];
}
