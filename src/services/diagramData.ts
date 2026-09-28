import * as fs from 'fs';
import * as path from 'path';
import { EntityScanner } from './entityScanner';
import { Column, fillableColumns, migrationColumns, usesSoftDeletes } from './modelSource';
import { pluralize, routeName } from './planView';

export interface DiagramColumn extends Column {
    /** The entity a foreign key points to, when the diagram shows it. */
    target?: string;
}

export interface DiagramRelation {
    method: string;
    type: string;
    target: string;
}

export interface DiagramFile {
    path: string;
    kind: string;
    label: string;
    exists: boolean;
    edited: boolean;
}

export interface DiagramEntity {
    name: string;
    table: string;
    route: string;
    columns: DiagramColumn[];
    relations: DiagramRelation[];
    files: DiagramFile[];
    tracked: boolean;
    softDeletes: boolean;
}

const TIMESTAMPS = new Set(['created_at', 'updated_at', 'deleted_at']);

function read(root: string, relativePath: string): string {
    try {
        return fs.readFileSync(path.join(root, relativePath), 'utf-8');
    } catch {
        return '';
    }
}

export function createdTable(migration: string): string | undefined {
    return /Schema::create\(\s*['"]([^'"]+)['"]/.exec(migration)?.[1];
}

/** Every generated entity with the columns its migrations declare, its relations and the state of its files. */
export function diagramData(root: string): DiagramEntity[] {
    const scanned = new EntityScanner(root).scan();
    const drafts = scanned.map((entity) => {
        const migrations = entity.files
            .filter((file) => file.kind === 'Migration' && file.exists)
            .map((file) => file.path)
            .sort();
        const contents = migrations.map((file) => read(root, file));
        const model = entity.files.find((file) => file.kind === 'Model' && file.exists);
        const modelContent = model ? read(root, model.path) : '';

        const columns: DiagramColumn[] = [];
        for (const column of contents.flatMap((content) => migrationColumns(content))) {
            if (!TIMESTAMPS.has(column.name) && !columns.some((known) => known.name === column.name)) {
                columns.push(column);
            }
        }
        if (columns.length === 0) {
            columns.push({ name: 'id', type: 'bigint', nullable: false, unique: false, primary: true });
            for (const field of entity.fields ?? fillableColumns(modelContent)) {
                columns.push({ name: field, type: '', nullable: false, unique: false, primary: false });
            }
        }

        const edited = new Set(entity.edited ?? []);
        return {
            name: entity.name,
            table: contents.map(createdTable).find((table) => table !== undefined) ?? pluralize(entity.name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()),
            route: `/api/${routeName(entity.name)}`,
            columns,
            relations: (entity.relations ?? []).map((relation) => ({ method: relation.name, type: relation.type, target: relation.target })),
            files: entity.files.map((file) => ({ path: file.path, kind: file.kind ?? file.type, label: file.type, exists: file.exists, edited: edited.has(file.path) })),
            tracked: entity.tracked === true,
            softDeletes: usesSoftDeletes(modelContent) || contents.some((content) => usesSoftDeletes(content)),
        };
    });

    const byTable = new Map(drafts.map((entity) => [entity.table, entity.name]));
    for (const entity of drafts) {
        entity.columns = entity.columns.map((column) => {
            const target = column.references ? byTable.get(column.references) : undefined;
            return target ? { ...column, target } : column;
        });
    }
    return drafts;
}

function mermaidType(column: DiagramColumn): string {
    return (column.type || 'string').replace(/[^A-Za-z0-9_]/g, '') || 'string';
}

/**
 * An erDiagram of the entities, one link per pair: the owner of a foreign key
 * is the "many" side, belongsToMany reads as many to many.
 */
export function toMermaid(entities: DiagramEntity[]): string {
    const names = new Set(entities.map((entity) => entity.name));
    const lines = ['erDiagram'];

    for (const entity of entities) {
        lines.push(`    ${entity.name} {`);
        for (const column of entity.columns) {
            const key = column.primary ? ' PK' : column.target ? ' FK' : '';
            lines.push(`        ${mermaidType(column)} ${column.name}${key}`);
        }
        lines.push('    }');
    }

    const seen = new Set<string>();
    const link = (from: string, to: string, shape: string, label: string) => {
        const key = [from, to].sort().join('|');
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        lines.push(`    ${from} ${shape} ${to} : ${label}`);
    };

    for (const entity of entities) {
        for (const column of entity.columns) {
            if (column.target && names.has(column.target)) {
                const inverse = entities.find((candidate) => candidate.name === column.target)?.relations.find((relation) => relation.target === entity.name);
                link(column.target, entity.name, inverse?.type === 'hasOne' ? '||--o|' : '||--o{', inverse?.method ?? column.name.replace(/_id$/, ''));
            }
        }
    }
    for (const entity of entities) {
        for (const relation of entity.relations) {
            if (!names.has(relation.target)) {
                continue;
            }
            if (relation.type === 'belongsToMany') {
                link(entity.name, relation.target, '}o--o{', relation.method);
            } else if (relation.type === 'hasMany') {
                link(entity.name, relation.target, '||--o{', relation.method);
            } else if (relation.type === 'hasOne') {
                link(entity.name, relation.target, '||--o|', relation.method);
            } else if (relation.type === 'belongsTo') {
                link(relation.target, entity.name, '||--o{', relation.method);
            }
        }
    }

    return `${lines.join('\n')}\n`;
}
