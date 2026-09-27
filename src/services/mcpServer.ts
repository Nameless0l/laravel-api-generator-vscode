import { MCP_MIN_VERSION, PACKAGE_NAME, readInstalledPackages, versionSupport } from './packageState';
import { PhpCommand } from './phpCommand';

export const MCP_PROVIDER_ID = 'laravelApiGenerator.mcp';

export const MCP_SERVER_LABEL = 'Laravel API Generator';

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
