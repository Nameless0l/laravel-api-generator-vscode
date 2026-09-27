import { GenerationDocument, SUPPORTED_PROTOCOL } from '../types';

export function lastProtocolDocument(output: string): GenerationDocument | null {
    const lines = output.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line.startsWith('{')) {
            continue;
        }
        try {
            const candidate = JSON.parse(line) as Partial<GenerationDocument>;
            if (candidate.protocol === SUPPORTED_PROTOCOL && Array.isArray(candidate.files) && Array.isArray(candidate.errors)) {
                return candidate as GenerationDocument;
            }
        } catch {
            continue;
        }
    }
    return null;
}

export function describeGeneration(document: GenerationDocument, labels: { created: string; updated: string }): string {
    const lines = document.files
        .filter((file) => file.action !== 'unchanged')
        .map((file) => `${file.action === 'create' ? labels.created : labels.updated}  ${file.path}`);
    for (const warning of document.warnings) {
        lines.push(`! ${warning.message}`);
    }
    return lines.join('\n');
}
