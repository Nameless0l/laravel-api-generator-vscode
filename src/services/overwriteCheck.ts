import { PlannedFile } from '../types';

export const SHARED_KINDS = ['Routes', 'DatabaseSeeder', 'Bootstrap'];

export interface OverwriteCheck {
    /** Edited by hand since they were generated; the package keeps them unless forced. */
    kept: string[];
    /** Packages before 3.11 overwrite every existing entity file. */
    overwritten: string[];
}

export function overwriteCheck(files: PlannedFile[], keepsEditedFiles: boolean): OverwriteCheck {
    if (keepsEditedFiles) {
        return { kept: files.filter((file) => file.kept).map((file) => file.path), overwritten: [] };
    }

    return {
        kept: [],
        overwritten: files
            .filter((file) => file.action === 'update' && !SHARED_KINDS.includes(file.kind))
            .map((file) => file.path),
    };
}
