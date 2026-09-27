import * as vscode from 'vscode';
import { ArtisanRunner } from '../services/artisanRunner';
import { MCP_PROVIDER_ID, MCP_SERVER_LABEL, mcpLaunch } from '../services/mcpServer';

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

/** The MCP API arrived in VS Code 1.101: older versions and forks without it get no server, and nothing breaks. */
export function registerMcpServerProvider(root: string): vscode.Disposable[] {
    const api = vscode as unknown as McpApi;
    const Definition = api.McpStdioServerDefinition;
    const lm = api.lm;

    if (!Definition || !lm?.registerMcpServerDefinitionProvider) {
        return [];
    }

    const changed = new vscode.EventEmitter<void>();
    const fire = (): void => changed.fire();
    const installed = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, 'vendor/composer/installed.json'));
    installed.onDidCreate(fire);
    installed.onDidChange(fire);
    installed.onDidDelete(fire);

    const provider = lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
        onDidChangeMcpServerDefinitions: changed.event,
        provideMcpServerDefinitions: () => {
            if (!vscode.workspace.getConfiguration('laravelApiGenerator').get<boolean>('mcp.enabled', true)) {
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

    return [
        changed,
        installed,
        provider,
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
