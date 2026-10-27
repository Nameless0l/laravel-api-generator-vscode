import * as path from 'path';
import { MCP_MIN_VERSION, PACKAGE_NAME, readInstalledPackages, versionSupport } from './packageState';
import { PhpCommand } from './phpCommand';

export const MCP_PROVIDER_ID = 'laravelApiGenerator.mcp';

export const MCP_SERVER_LABEL = 'Laravel API Generator';

export const MCP_SERVER_NAME = 'laravel-api-generator';

export interface McpLaunch {
    command: string;
    args: string[];
    version: string;
}

/** The server needs both the package command and laravel/mcp in vendor; development versions are trusted. */
export function mcpLaunch(root: string, php: PhpCommand): McpLaunch | null {
    const installed = readInstalledPackages(root);
    const version = installed.get(PACKAGE_NAME);

    if (version === undefined || !installed.has('laravel/mcp') || versionSupport(version, MCP_MIN_VERSION) === 'tooOld') {
        return null;
    }

    return { command: php.command, args: [...php.args, 'artisan', 'api-generator:mcp'], version };
}

export type McpState = 'ready' | 'missingMcp' | 'tooOld' | 'disabled' | 'noPackage';

export function mcpState(root: string, enabled: boolean): McpState {
    const installed = readInstalledPackages(root);
    const version = installed.get(PACKAGE_NAME);

    if (version === undefined) {
        return 'noPackage';
    }
    if (versionSupport(version, MCP_MIN_VERSION) === 'tooOld') {
        return 'tooOld';
    }
    if (!installed.has('laravel/mcp')) {
        return 'missingMcp';
    }
    return enabled ? 'ready' : 'disabled';
}

export interface CursorServer {
    name: string;
    server: { command: string; args: string[]; env: Record<string, string> };
}

/** Cursor starts a server without a working folder: PHP gets the full path of artisan, a container command runs from the project. */
export function cursorServer(root: string, php: PhpCommand, platform: string = process.platform): CursorServer {
    const command = [php.command, ...php.args, 'artisan', 'api-generator:mcp'];
    if (php.args.length === 0) {
        return { name: MCP_SERVER_NAME, server: { command: php.command, args: [path.join(root, 'artisan'), 'api-generator:mcp'], env: {} } };
    }
    if (platform === 'win32') {
        return { name: MCP_SERVER_NAME, server: { command: 'cmd.exe', args: ['/d', '/c', 'cd', '/d', root, '&&', ...command], env: {} } };
    }
    return { name: MCP_SERVER_NAME, server: { command: 'sh', args: ['-c', 'cd "$0" && exec "$@"', root, ...command], env: {} } };
}

/** The command Claude Code takes to add the server to the project's .mcp.json. */
export function claudeCodeCommand(php: PhpCommand): string {
    const quote = (part: string): string => (/^[\w./:@=-]+$/.test(part) ? part : `"${part.replace(/"/g, '\\"')}"`);
    return ['claude', 'mcp', 'add', '-s', 'project', MCP_SERVER_NAME, '--', php.command, ...php.args, 'artisan', 'api-generator:mcp'].map(quote).join(' ');
}
