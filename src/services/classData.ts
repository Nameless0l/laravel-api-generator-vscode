import { ApiSchema, ApiSchemaEntity, ApiSchemaField } from '../types';

const KNOWN_TYPES = new Set([
    'integer', 'int', 'long', 'tinyint', 'smallint', 'mediumint', 'short', 'byte',
    'bigint', 'biginteger',
    'str', 'string', 'varchar', 'char', 'enum', 'set',
    'text', 'longtext', 'mediumtext', 'tinytext', 'clob',
    'boolean', 'bool',
    'float', 'double', 'real', 'number',
    'decimal', 'money',
    'date', 'localdate',
    'datetime', 'timestamp', 'localdatetime',
    'time', 'localtime',
    'json', 'jsonb', 'array', 'list', 'map', 'object',
    'uuid',
]);

const RELATION_KEYS: Record<string, string> = {
    oneToOneRelationships: 'hasOne',
    oneToManyRelationships: 'hasMany',
    manyToOneRelationships: 'belongsTo',
    manyToManyRelationships: 'belongsToMany',
};

type Row = Record<string, unknown>;

export interface ClassDataSchema {
    schema: ApiSchema;
    /** Entities that extend another class, which a schema cannot say. */
    inherited: string[];
}

/** The classes of a class_data.json document, whatever its wrapping. */
export function classDataRows(data: unknown): Row[] {
    if (Array.isArray(data)) {
        return data.map(unwrap);
    }
    if (typeof data !== 'object' || data === null) {
        return [];
    }
    const row = data as Row;
    if ((row.data && typeof row.data === 'object') || row.name) {
        return [unwrap(row)];
    }
    return Object.values(row).map(unwrap);
}

/**
 * Rewrites a class_data.json document as a schema, the way the package reads
 * it, so the package can plan it without the file being written in the project.
 */
export function classDataSchema(data: unknown): ClassDataSchema {
    const entities: Record<string, ApiSchemaEntity> = {};
    const inherited: string[] = [];

    for (const row of classDataRows(data)) {
        const name = capitalize(text(row.name));
        const fields = schemaFields(row.attributes);
        if (name === '' || Object.keys(fields).length === 0) {
            continue;
        }

        const entity: ApiSchemaEntity = { fields };
        const relations = schemaRelations(row);
        if (Object.keys(relations).length > 0) {
            entity.relations = relations;
        }
        entities[name] = entity;
        if (text(row.parent) !== '') {
            inherited.push(name);
        }
    }

    return { schema: { entities }, inherited };
}

function schemaFields(attributes: unknown): Record<string, ApiSchemaField> {
    const fields: Record<string, ApiSchemaField> = {};
    for (const attribute of list(attributes)) {
        const name = text(attribute.name);
        const raw = text(attribute._type ?? attribute.type) || 'string';
        if (name === '' || name === 'id' || raw.toLowerCase() === 'void' || name in fields) {
            continue;
        }

        const values = /^enum\((.+)\)$/i.exec(raw.trim());
        const field: ApiSchemaField = values
            ? { type: 'string', enum: values[1].split(',').map((value) => value.trim()).filter((value) => value !== '') }
            : { type: schemaType(raw) };
        if (attribute.primary === true || attribute._primary === true) {
            field.primary = true;
        }
        fields[name] = field;
    }
    return fields;
}

function schemaType(raw: string): string {
    const lower = raw.toLowerCase();
    if (lower.startsWith('list_')) {
        return 'json';
    }
    return KNOWN_TYPES.has(lower) ? lower : 'string';
}

function schemaRelations(row: Row): Record<string, string> {
    const relations: Record<string, string> = {};
    for (const [key, type] of Object.entries(RELATION_KEYS)) {
        for (const relation of list(row[key])) {
            const target = capitalize(text(relation.comodel ?? relation.relatedModel));
            if (target !== '') {
                relations[text(relation.role) || camel(target)] = `${type} ${target}`;
            }
        }
    }
    for (const key of ['compositions', 'aggregations']) {
        for (const relation of list(row[key])) {
            const target = capitalize(text(relation._type ?? relation.comodel));
            if (target !== '') {
                relations[text(relation.name) || camel(target)] = `hasMany ${target}`;
            }
        }
    }
    return relations;
}

function unwrap(item: unknown): Row {
    const row = (typeof item === 'object' && item !== null ? item : {}) as Row;
    return typeof row.data === 'object' && row.data !== null ? (row.data as Row) : row;
}

function list(value: unknown): Row[] {
    return Array.isArray(value) ? value.filter((item): item is Row => typeof item === 'object' && item !== null) : [];
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function camel(value: string): string {
    return value.charAt(0).toLowerCase() + value.slice(1);
}
