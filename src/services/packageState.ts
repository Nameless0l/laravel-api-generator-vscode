import * as fs from 'fs';
import * as path from 'path';

export const PACKAGE_NAME = 'nameless/laravel-api-generator';

export const PREVIEW_MIN_VERSION = '3.9.0';

export type PreviewSupport = 'supported' | 'tooOld' | 'unknown';

export type PackageState =
    | { kind: 'notDeclared' }
    | { kind: 'notInstalled' }
    | { kind: 'installed'; version: string; preview: PreviewSupport };

/** composer.json only says the package is wanted; installed.json says what vendor really holds. */
export function readInstalledVersion(root: string): string | null {
    let data: unknown;
    try {
        data = JSON.parse(fs.readFileSync(path.join(root, 'vendor', 'composer', 'installed.json'), 'utf-8'));
    } catch {
        return null;
    }

    const packages = Array.isArray(data) ? data : (data as { packages?: unknown } | null)?.packages;
    if (!Array.isArray(packages)) {
        return null;
    }

    const entry = packages.find(
        (candidate): candidate is { name: string; version: unknown } =>
            typeof candidate === 'object' && candidate !== null && (candidate as { name?: unknown }).name === PACKAGE_NAME
    );

    return entry && typeof entry.version === 'string' ? entry.version : null;
}

export function previewSupport(version: string): PreviewSupport {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
    if (!match) {
        return 'unknown';
    }

    const actual = [Number(match[1]), Number(match[2]), Number(match[3])];
    const required = PREVIEW_MIN_VERSION.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if (actual[i] !== required[i]) {
            return actual[i] > required[i] ? 'supported' : 'tooOld';
        }
    }

    return 'supported';
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
