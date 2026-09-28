export interface TestSummary {
    passed: number;
    failed: number;
}

/** Counts from `php artisan test`, whether it prints Collision's "Tests:" line or PHPUnit's plain summary. */
export function testSummary(output: string): TestSummary | null {
    const clean = output.replace(/\x1B\[[0-9;]*m/g, '');
    const collision = /^\s*Tests:\s+(.+)$/m.exec(clean);
    if (collision && /\b(passed|failed)\b/.test(collision[1])) {
        const count = (label: string) => Number(new RegExp(`(\\d+)\\s+${label}`).exec(collision[1])?.[1] ?? 0);
        return { passed: count('passed'), failed: count('failed') + count('errors?') };
    }

    const ok = /OK \((\d+) tests?/.exec(clean);
    if (ok) {
        return { passed: Number(ok[1]), failed: 0 };
    }

    const failures = /Tests:\s*(\d+),\s*Assertions:\s*\d+(?:,\s*Errors:\s*(\d+))?(?:,\s*Failures:\s*(\d+))?/.exec(clean);
    if (failures) {
        const failed = Number(failures[2] ?? 0) + Number(failures[3] ?? 0);
        return { passed: Math.max(0, Number(failures[1]) - failed), failed };
    }

    return null;
}

/** Migrations `php artisan migrate` ran, or 0 when it had nothing to do. */
export function migrationCount(output: string): number {
    const clean = output.replace(/\x1B\[[0-9;]*m/g, '');
    if (/Nothing to migrate/i.test(clean)) {
        return 0;
    }
    return clean.split(/\r?\n/).filter((line) => /\bDONE\s*$/.test(line) || /^Migrated:/.test(line.trim())).length;
}

/** The first lines worth showing when a command fails. */
export function failureExcerpt(output: string, maxLines = 4): string {
    const lines = output
        .replace(/\x1B\[[0-9;]*m/g, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '' && !/^[=\-_~.\s]+$/.test(line) && !/^at\s/.test(line));
    const important = lines.findIndex((line) => /(error|exception|failed|fail|could not|refused|denied|SQLSTATE)/i.test(line));
    const start = important === -1 ? 0 : important;
    return lines.slice(start, start + maxLines).join('\n');
}
