import * as fs from 'fs';
import * as path from 'path';

export const PACKAGE_NAME = 'nameless/laravel-api-generator';

export const PREVIEW_MIN_VERSION = '3.9.0';

export const MCP_MIN_VERSION = '3.12.0';

export const OPENAPI_MIN_VERSION = '3.13.0';

export type PreviewSupport = 'supported' | 'tooOld' | 'unknown';

export type PackageState =
    | { kind: 'notDeclared' }
    | { kind: 'notInstalled' }
    | { kind: 'installed'; version: string; preview: PreviewSupport };

/** composer.json only says what is wanted; installed.json says what vendor really holds, by package name. */
export function readInstalledPackages(root: string): Map<string, string> {
    const installed = new Map<string, string>();
    let data: unknown;
    try {
        data = JSON.parse(fs.readFileSync(path.join(root, 'vendor', 'composer', 'installed.json'), 'utf-8'));
    } catch {
        return installed;
    }

    const packages = Array.isArray(data) ? data : (data as { packages?: unknown } | null)?.packages;
    if (!Array.isArray(packages)) {
        return installed;
    }

    for (const entry of packages) {
        const { name, version } = (entry ?? {}) as { name?: unknown; version?: unknown };
        if (typeof name === 'string' && typeof version === 'string') {
            installed.set(name, version);
        }
    }

    return installed;
}

export function readInstalledVersion(root: string): string | null {
    return readInstalledPackages(root).get(PACKAGE_NAME) ?? null;
}

export function versionSupport(version: string, minimum: string): PreviewSupport {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
    if (!match) {
        return 'unknown';
    }

    const actual = [Number(match[1]), Number(match[2]), Number(match[3])];
    const required = minimum.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if (actual[i] !== required[i]) {
            return actual[i] > required[i] ? 'supported' : 'tooOld';
        }
    }

    return 'supported';
}

export function previewSupport(version: string): PreviewSupport {
    return versionSupport(version, PREVIEW_MIN_VERSION);
}

export function detectPackageState(root: string, declared: boolean): PackageState {
    if (!declared) {
        return { kind: 'notDeclared' };
    }

    const version = readInstalledVersion(root);
    if (version === null) {
        return { kind: 'notInstalled' };
    }

    return { kind: 'installed', version, preview: previewSupport(version) };
}
