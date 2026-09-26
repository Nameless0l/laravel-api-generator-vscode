import * as path from 'path';

export interface PhpCommand {
    command: string;
    args: string[];
}

export function resolvePhpCommand(phpCommand: unknown, phpPath: string | undefined): PhpCommand {
    if (
        Array.isArray(phpCommand) &&
        phpCommand.length > 0 &&
        phpCommand.every((part) => typeof part === 'string' && part.trim() !== '')
    ) {
        const [command, ...args] = phpCommand as string[];
        return { command, args };
    }

    return { command: phpPath && phpPath.trim() !== '' ? phpPath : 'php', args: [] };
}

/** Paths given to artisan must also exist inside a container, so they stay relative to the project. */
export function projectRelative(workspaceRoot: string, filePath: string): string {
    const relative = path.relative(workspaceRoot, filePath);

    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        return filePath;
    }

    return relative.split(path.sep).join('/');
}
