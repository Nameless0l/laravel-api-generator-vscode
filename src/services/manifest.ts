import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const MANIFEST_PATH = '.api-generator/manifest.json';

export interface ManifestEntry {
    path: string;
    entity: string | null;
    kind: string;
    hash?: string;
}

/** The files the package recorded (package >= 3.11), or null when the project has no readable manifest. */
export function readManifest(root: string): ManifestEntry[] | null {
    let data: unknown;
    try {
        data = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_PATH), 'utf-8'));
    } catch {
        return null;
    }

    const files = (data as { files?: unknown } | null)?.files;
    if (typeof files !== 'object' || files === null || Array.isArray(files)) {
        return null;
    }

    return Object.entries(files as Record<string, unknown>).flatMap(([file, entry]) => {
        const { entity, kind, hash } = (entry ?? {}) as { entity?: unknown; kind?: unknown; hash?: unknown };
        if (typeof kind !== 'string') {
            return [];
        }
        return [{ path: file, entity: typeof entity === 'string' ? entity : null, kind, ...(typeof hash === 'string' ? { hash } : {}) }];
    });
}

/** The package's hash: line endings are ignored so a checkout with core.autocrlf does not look like an edit. */
export function contentHash(content: string): string {
    return crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** Recorded files that still exist but no longer match what the package wrote. */
export function editedFiles(root: string, entries: ManifestEntry[]): Set<string> {
    const edited = new Set<string>();
    for (const entry of entries) {
        if (!entry.hash) {
            continue;
        }
        let content: string;
        try {
            content = fs.readFileSync(path.join(root, entry.path), 'utf-8');
        } catch {
            continue;
        }
        if (contentHash(content) !== entry.hash) {
            edited.add(entry.path);
        }
    }
    return edited;
}
