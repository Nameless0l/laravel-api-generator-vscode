import { ChildProcess, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface PhpCommand {
    command: string;
    args: string[];
}

export interface ProcessLaunch {
    command: string;
    args: string[];
    windowsVerbatimArguments?: boolean;
}

const CMD_META = /([()\][%!^"`<>&|;, *?])/g;

/**
 * Node only starts executables, so a PHP exposed as a .bat or .cmd file,
 * like Herd's on Windows, runs through cmd.exe with every argument escaped.
 */
export function processLaunch(command: string, args: string[], cwd: string, platform: string = process.platform, env: NodeJS.ProcessEnv = process.env): ProcessLaunch {
    if (platform !== 'win32') {
        return { command, args };
    }
    const file = windowsExecutable(command, cwd, env);
    if (!file || !/\.(bat|cmd)$/i.test(file)) {
        return { command, args };
    }
    const line = [file.replace(CMD_META, '^$1'), ...args.map(cmdArgument)].join(' ');
    return { command: env.ComSpec || env.COMSPEC || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true };
}

function cmdArgument(arg: string): string {
    const quoted = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`;
    return quoted.replace(CMD_META, '^$1');
}

/** The file cmd.exe would run: the first PATH folder holding the name with one of the PATHEXT extensions. */
function windowsExecutable(command: string, cwd: string, env: NodeJS.ProcessEnv): string | undefined {
    const extensions = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter((ext) => ext !== '');
    const named = (base: string): string[] =>
        extensions.some((ext) => ext.toLowerCase() === path.extname(base).toLowerCase()) ? [base] : extensions.map((ext) => base + ext);
    const isFile = (file: string): boolean => {
        try {
            return fs.statSync(file).isFile();
        } catch {
            return false;
        }
    };

    if (/[\\/]/.test(command)) {
        return named(path.resolve(cwd, command)).find(isFile);
    }
    const folders = (env.PATH || env.Path || '').split(';').map((folder) => folder.trim().replace(/^"(.*)"$/, '$1')).filter((folder) => folder !== '');
    for (const folder of folders) {
        const found = named(path.join(folder, command)).find(isFile);
        if (found) {
            return found;
        }
    }
    return undefined;
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

/** On Windows a killed process leaves its children running: the server behind artisan serve, or PHP behind cmd.exe. */
export function stopProcess(child: ChildProcess, platform: string = process.platform): void {
    if (platform === 'win32' && child.pid !== undefined) {
        execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => undefined);
        return;
    }
    child.kill();
}
