import { GenerationDocument, PlannedFile } from '../types';
import { Column, fillableColumns, migrationColumns, modelRelations, ModelRelation, usesSoftDeletes } from './modelSource';

export interface PlanFileView {
    path: string;
    kind: string;
    action: PlannedFile['action'];
    kept: boolean;
}

export interface PlanCounts {
    create: number;
    update: number;
    kept: number;
    unchanged: number;
}

export interface PlanEntityView {
    name: string;
    route: string;
    existing: boolean;
    fields: Column[];
    relations: ModelRelation[];
    files: PlanFileView[];
    counts: PlanCounts;
    softDeletes: boolean;
    newRoutes: number;
}

export interface PlanView {
    entities: PlanEntityView[];
    shared: PlanFileView[];
    sharedCounts: PlanCounts;
    totals: PlanCounts & { newRoutes: number };
    skipped: string[];
    skippedMessages: string[];
    warnings: string[];
}

export interface RouteRow {
    method: string;
    uri: string;
    action: string;
    note?: 'paginated' | 'andPatch';
}

/** Skipped schemas get their own bar and kept files their own notice. */
const SHOWN_ELSEWHERE = new Set(['openapi_schema_skipped', 'modified_file_kept']);

const KIND_ORDER = ['Model', 'Enum', 'Controller', 'Service', 'DTO', 'Request', 'Resource', 'Policy', 'Migration', 'PivotMigration', 'Factory', 'Seeder', 'FeatureTest', 'UnitTest'];

export function planView(document: GenerationDocument): PlanView {
    const groups = new Map<string, PlannedFile[]>();
    const shared: PlannedFile[] = [];
    for (const file of document.files) {
        if (file.entity) {
            groups.set(file.entity, [...(groups.get(file.entity) ?? []), file]);
        } else {
            shared.push(file);
        }
    }

    const entities = [...groups.entries()].map(([name, files]) => entityView(name, files));
    const totals = { ...countFiles(document.files), newRoutes: entities.reduce((sum, entity) => sum + entity.newRoutes, 0) };
    const skippedMessages = document.warnings.filter((w) => w.code === 'openapi_schema_skipped').map((w) => w.message);

    return {
        entities,
        shared: shared.map(fileView),
        sharedCounts: countFiles(shared),
        totals,
        skipped: skippedMessages.map((message) => /^(\S+)\s+was skipped/.exec(message)?.[1] ?? message),
        skippedMessages,
        warnings: document.warnings.filter((w) => !SHOWN_ELSEWHERE.has(w.code)).map((w) => w.message),
    };
}

function entityView(name: string, files: PlannedFile[]): PlanEntityView {
    const model = files.find((file) => file.kind === 'Model');
    const migrations = files.filter((file) => file.kind === 'Migration').sort((a, b) => a.path.localeCompare(b.path));
    const controller = files.find((file) => file.kind === 'Controller');
    const columns = migrations.flatMap((file) => migrationColumns(file.content ?? ''));
    const foreignKeys = new Set(columns.filter((column) => column.references).map((column) => column.name));
    const fields = columns.length > 0
        ? columns.filter((column) => !column.primary || column.name !== 'id').filter((column) => !foreignKeys.has(column.name))
        : fillableColumns(model?.content ?? '').map((field) => ({ name: field, type: '', nullable: false, unique: false, primary: false }));
    const softDeletes = files.some((file) => (file.kind === 'Model' || file.kind === 'Migration') && usesSoftDeletes(file.content ?? ''));
    const newApi = controller?.action === 'create';

    return {
        name,
        route: `/api/${routeName(name)}`,
        existing: model !== undefined && model.action !== 'create',
        fields,
        relations: modelRelations(model?.content ?? ''),
        files: [...files].sort(byKind).map(fileView),
        counts: countFiles(files),
        softDeletes,
        newRoutes: newApi ? (softDeletes ? 7 : 5) : 0,
    };
}

function byKind(a: PlannedFile, b: PlannedFile): number {
    const rank = (kind: string) => {
        const index = KIND_ORDER.indexOf(kind);
        return index === -1 ? KIND_ORDER.length : index;
    };
    return rank(a.kind) - rank(b.kind) || a.path.localeCompare(b.path);
}

function fileView(file: PlannedFile): PlanFileView {
    return { path: file.path, kind: file.kind, action: file.action, kept: file.kept === true };
}

export function countFiles(files: Array<Pick<PlannedFile, 'action' | 'kept'>>): PlanCounts {
    const counts = { create: 0, update: 0, kept: 0, unchanged: 0 };
    for (const file of files) {
        if (file.kept) {
            counts.kept++;
        } else if (file.action === 'create') {
            counts.create++;
        } else if (file.action === 'update') {
            counts.update++;
        } else {
            counts.unchanged++;
        }
    }
    return counts;
}

const IRREGULAR: Record<string, string> = { person: 'people', man: 'men', woman: 'women', child: 'children', tooth: 'teeth', foot: 'feet', mouse: 'mice', goose: 'geese', ox: 'oxen', leaf: 'leaves', life: 'lives', knife: 'knives', wife: 'wives' };
const UNCOUNTABLE = new Set(['equipment', 'information', 'rice', 'money', 'species', 'series', 'fish', 'sheep', 'news', 'data', 'feedback', 'metadata', 'software', 'hardware', 'staff', 'traffic', 'audio', 'media', 'police']);

/** English plural the way Laravel's Str::plural treats regular words. */
export function pluralize(word: string): string {
    const lower = word.toLowerCase();
    if (UNCOUNTABLE.has(lower)) {
        return word;
    }
    if (IRREGULAR[lower]) {
        return IRREGULAR[lower];
    }
    if (/[^aeiou]y$/.test(lower)) {
        return `${word.slice(0, -1)}ies`;
    }
    if (/(s|x|z|ch|sh)$/.test(lower)) {
        return `${word}es`;
    }
    return `${word}s`;
}

/** The package names routes after the lowercased entity: BlogPost answers on /api/blogposts. */
export function routeName(entity: string): string {
    return pluralize(entity.toLowerCase());
}

export function routeParameter(entity: string): string {
    return entity.toLowerCase();
}

export function estimatedRoutes(entity: string, softDeletes: boolean): RouteRow[] {
    const base = `/api/${routeName(entity)}`;
    const item = `${base}/{${routeParameter(entity)}}`;
    const controller = `${entity}Controller`;
    const rows: RouteRow[] = [
        { method: 'GET', uri: base, action: `${controller}@index`, note: 'paginated' },
        { method: 'POST', uri: base, action: `${controller}@store` },
        { method: 'GET', uri: item, action: `${controller}@show` },
        { method: 'PUT', uri: item, action: `${controller}@update`, note: 'andPatch' },
        { method: 'DELETE', uri: item, action: `${controller}@destroy` },
    ];
    if (softDeletes) {
        rows.push({ method: 'POST', uri: `${item}/restore`, action: `${controller}@restore` });
        rows.push({ method: 'DELETE', uri: `${item}/force-delete`, action: `${controller}@forceDelete` });
    }
    return rows;
}

/** Rows of `php artisan route:list --json` that the given controllers answer. */
export function routesFromList(json: string, controllers: string[]): RouteRow[] | null {
    let data: unknown;
    try {
        const start = json.indexOf('[');
        data = JSON.parse(start >= 0 ? json.slice(start) : json);
    } catch {
        return null;
    }
    if (!Array.isArray(data)) {
        return null;
    }

    const wanted = new Set(controllers);
    const rows: RouteRow[] = [];
    for (const entry of data as Array<{ method?: unknown; uri?: unknown; action?: unknown }>) {
        if (typeof entry.method !== 'string' || typeof entry.uri !== 'string' || typeof entry.action !== 'string') {
            continue;
        }
        const [controllerClass, method] = entry.action.split('@');
        const controller = controllerClass.split('\\').pop() ?? '';
        if (!wanted.has(controller)) {
            continue;
        }
        const verbs = entry.method.split('|').filter((verb) => verb !== 'HEAD');
        const verb = verbs.includes('PUT') ? 'PUT' : verbs[0] ?? entry.method;
        rows.push({
            method: verb,
            uri: `/${entry.uri.replace(/^\//, '')}`,
            action: `${controller}@${method ?? ''}`,
            ...(method === 'index' ? { note: 'paginated' as const } : verbs.includes('PATCH') && verb === 'PUT' ? { note: 'andPatch' as const } : {}),
        });
    }
    return rows;
}
