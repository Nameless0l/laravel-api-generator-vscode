import * as fs from 'fs';
import * as path from 'path';
import { MCP_MIN_VERSION, PACKAGE_NAME, readInstalledPackages, versionSupport } from './packageState';
import { PhpCommand } from './phpCommand';

export const MCP_PROVIDER_ID = 'laravelApiGenerator.mcp';

export const MCP_SERVER_LABEL = 'Laravel API Generator';

export const MCP_SERVER_NAME = 'laravel-api-generator';

const GENERATOR_ARGS = ['artisan', 'api-generator:mcp'];

const API_ARGS = ['artisan', 'mcp:start', 'api'];

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

    return { command: php.command, args: [...php.args, ...GENERATOR_ARGS], version };
}

/**
 * The server `make:fullapi --mcp` writes for the application, registered in routes/ai.php as "api".
 * Its version follows the server file, so the editor lists the tools again when an entity joins or leaves.
 */
export function apiServerLaunch(root: string, php: PhpCommand): McpLaunch | null {
    if (!readInstalledPackages(root).has('laravel/mcp')) {
        return null;
    }

    let routes: string;
    let written: number;
    try {
        routes = fs.readFileSync(path.join(root, 'routes', 'ai.php'), 'utf-8');
        written = fs.statSync(path.join(root, 'app', 'Mcp', 'Servers', 'ApiServer.php')).mtimeMs;
    } catch {
        return null;
    }

    if (!/Mcp::local\(\s*['"]api['"]/.test(routes)) {
        return null;
    }

    return { command: php.command, args: [...php.args, ...API_ARGS], version: String(Math.round(written)) };
}

export function apiServerLabel(root: string): string {
    return `${path.basename(root)} API`;
}

export function apiServerName(root: string): string {
    const slug = path
        .basename(root)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${slug || 'laravel'}-api`;
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
function cursorEntry(name: string, root: string, php: PhpCommand, artisan: string[], platform: string): CursorServer {
    const command = [php.command, ...php.args, ...artisan];
    if (php.args.length === 0) {
        return { name, server: { command: php.command, args: [path.join(root, artisan[0]), ...artisan.slice(1)], env: {} } };
    }
    if (platform === 'win32') {
        return { name, server: { command: 'cmd.exe', args: ['/d', '/c', 'cd', '/d', root, '&&', ...command], env: {} } };
    }
    return { name, server: { command: 'sh', args: ['-c', 'cd "$0" && exec "$@"', root, ...command], env: {} } };
}

export function cursorServer(root: string, php: PhpCommand, platform: string = process.platform): CursorServer {
    return cursorEntry(MCP_SERVER_NAME, root, php, GENERATOR_ARGS, platform);
}

export function cursorApiServer(root: string, php: PhpCommand, platform: string = process.platform): CursorServer {
    return cursorEntry(apiServerName(root), root, php, API_ARGS, platform);
}

function claudeCommand(name: string, php: PhpCommand, artisan: string[]): string {
    const quote = (part: string): string => (/^[\w./:@=-]+$/.test(part) ? part : `"${part.replace(/"/g, '\\"')}"`);
    return ['claude', 'mcp', 'add', '-s', 'project', name, '--', php.command, ...php.args, ...artisan].map(quote).join(' ');
}

/** The command Claude Code takes to add the server to the project's .mcp.json. */
export function claudeCodeCommand(php: PhpCommand): string {
    return claudeCommand(MCP_SERVER_NAME, php, GENERATOR_ARGS);
}

export function claudeCodeApiCommand(root: string, php: PhpCommand): string {
    return claudeCommand(apiServerName(root), php, API_ARGS);
}
