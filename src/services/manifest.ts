import * as fs from 'fs';
import * as path from 'path';

export const MANIFEST_PATH = '.api-generator/manifest.json';

export interface ManifestEntry {
    path: string;
    entity: string | null;
    kind: string;
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
        const { entity, kind } = (entry ?? {}) as { entity?: unknown; kind?: unknown };
        return typeof kind === 'string' ? [{ path: file, entity: typeof entity === 'string' ? entity : null, kind }] : [];
    });
}
