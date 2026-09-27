import { t } from '../i18n';

export interface StubRow {
    stub: string;
    status: string;
    missing: string[];
    reason?: string;
}

/** One validate-stubs row: the placeholders it lacks and why a 3.x stub no longer fits. */
export function stubLine(row: StubRow): string {
    const details = [
        ...(row.missing.length > 0 ? [t('generate.stubMissing', row.missing.map((name) => `{{${name}}}`).join(', '))] : []),
        ...(row.reason ? [row.reason] : []),
    ];
    return `  • ${row.stub}.stub: ${details.join('; ')}`;
}
