import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PhpCommand } from './phpCommand';
import { readInstalledPackages } from './packageState';

export const SCHEMA_FILES = ['api-schema.yaml', 'api-schema.yml', 'api-schema.json'];

/** "v12.69.2" reads as "12.69". */
export function shortVersion(version: string | undefined): string | undefined {
    const match = /^v?(\d+)\.(\d+)/.exec(version ?? '');
    return match ? `${match[1]}.${match[2]}` : undefined;
}

export function laravelVersion(root: string): string | undefined {
    return shortVersion(readInstalledPackages(root).get('laravel/framework'));
}

export function schemaFile(root: string): string | undefined {
    return SCHEMA_FILES.find((file) => fs.existsSync(path.join(root, file)));
}

export function projectName(root: string): string {
    return path.basename(root);
}

/** The PHP the extension runs, asked once through the configured command (Sail and Docker included). */
export function phpVersion(php: PhpCommand, cwd: string, timeout = 8000): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            execFile(php.command, [...php.args, '-r', 'echo PHP_VERSION;'], { cwd, timeout }, (error, stdout) => {
                const match = /(\d+\.\d+)(?:\.\d+)?/.exec(String(stdout));
                resolve(error || !match ? null : match[1]);
            });
        } catch {
            resolve(null);
        }
    });
}

/** "openapi: 3.1.0" reads as "OpenAPI 3.1", "swagger: '2.0'" as "Swagger 2.0". */
export function specLabel(content: string): string | undefined {
    const match = /["']?(openapi|swagger)["']?\s*:\s*["']?(\d+)\.(\d+)/i.exec(content);
    if (!match) {
        return undefined;
    }
    return `${match[1].toLowerCase() === 'openapi' ? 'OpenAPI' : 'Swagger'} ${match[2]}.${match[3]}`;
}
