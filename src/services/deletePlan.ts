import { EntityFile } from '../types';

export interface DeletePlan {
    files: Array<{ path: string; edited: boolean }>;
    /** True when the package also removes the entity's lines from routes/api.php and DatabaseSeeder.php. */
    sharedEntries: boolean;
}

/** Reads what `delete:fullapi --dry-run` prints. Null when the output is not a dry run. */
export function parseDeleteDryRun(output: string): DeletePlan | null {
    if (!/Dry run, nothing was deleted/.test(output)) {
        return null;
    }

    const paths: string[] = [];
    const edited = new Set<string>();
    let sharedEntries = false;
    for (const line of output.split(/\r?\n/)) {
        const removal = /^\s*delete\s+(\S+)\s*$/.exec(line);
        const mark = /^\s*!\s+(\S+) was edited by hand/.exec(line);
        if (removal) {
            paths.push(removal[1]);
        } else if (mark) {
            edited.add(mark[1]);
        } else if (/^\s*update\s+\S/.test(line)) {
            sharedEntries = true;
        }
    }

    return { files: paths.map((path) => ({ path, edited: edited.has(path) })), sharedEntries };
}

export function deletePlanFromFiles(files: EntityFile[], edited: string[]): DeletePlan {
    const marked = new Set(edited);
    return {
        files: files.filter((file) => file.exists).map((file) => ({ path: file.path, edited: marked.has(file.path) })),
        sharedEntries: true,
    };
}
