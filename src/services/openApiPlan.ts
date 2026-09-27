import { GenerationDocument } from '../types';

export interface OpenApiPlanSummary {
    entities: string[];
    create: number;
    update: number;
    kept: number;
    skipped: string[];
    otherWarnings: string[];
}

export function summarizeOpenApiPlan(document: GenerationDocument): OpenApiPlanSummary {
    const entities = new Set<string>();
    let create = 0;
    let update = 0;
    let kept = 0;

    for (const file of document.files) {
        if (file.entity && file.kind === 'Model') {
            entities.add(file.entity);
        }
        if (file.kept) {
            kept++;
        } else if (file.action === 'create') {
            create++;
        } else if (file.action === 'update') {
            update++;
        }
    }

    return {
        entities: [...entities],
        create,
        update,
        kept,
        skipped: document.warnings.filter((w) => w.code === 'openapi_schema_skipped').map((w) => w.message),
        otherWarnings: document.warnings.filter((w) => w.code !== 'openapi_schema_skipped').map((w) => w.message),
    };
}
