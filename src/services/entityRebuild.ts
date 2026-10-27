import * as fs from 'fs';
import * as path from 'path';
import { ApiSchema, ApiSchemaEntity, ApiSchemaField, FlowOptions } from '../types';
import { Column, migrationColumns, modelRelations, usesSoftDeletes } from './modelSource';
import { pluralize } from './planView';

export type RebuiltOptions = Pick<FlowOptions, 'pest' | 'queryBuilder' | 'jsonApi'>;

export interface RebuiltEntity {
    entity: ApiSchemaEntity;
    options: RebuiltOptions;
}

const SCHEMA_RELATIONS = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany', 'morphTo', 'morphOne', 'morphMany']);

/**
 * The definition of an entity the package did not record (generated before
 * 4.1), read back from its migrations, model, enums and generated files.
 * Undefined when no migration creates its table.
 */
export function rebuildEntity(root: string, name: string): RebuiltEntity | undefined {
    const table = tableName(name);
    const migrations = tableMigrations(root, table);
    if (!migrations.some((content) => touches(content, 'create', table))) {
        return undefined;
    }

    const model = read(path.join(root, 'app', 'Models', `${name}.php`));
    const relations = modelRelations(model).filter((relation) => SCHEMA_RELATIONS.has(relation.type));
    const parents = relations.filter((relation) => relation.type === 'belongsTo');
    const parentTables = new Set(parents.map((relation) => tableName(relation.target)));
    const parentKeys = parents.map((relation) => `${snake(relation.method)}_`);
    const enums = enumValues(root, model);

    const columns = new Map<string, Column>();
    for (const column of migrations.flatMap(migrationColumns)) {
        columns.set(column.name, column);
    }

    const fields: Record<string, ApiSchemaField> = {};
    for (const column of columns.values()) {
        const foreignKey =
            parentKeys.some((prefix) => column.name === `${prefix}id`) ||
            (column.references !== undefined && (parentTables.has(column.references) || parentKeys.some((prefix) => column.name.startsWith(prefix))));
        if ((column.primary && column.name === 'id') || foreignKey) {
            continue;
        }
        fields[column.name] = schemaField(column, enums.get(column.name));
    }

    const entity: ApiSchemaEntity = { fields };
    if (relations.length > 0) {
        entity.relations = Object.fromEntries(relations.map((relation) => [relation.method, relation.target ? `${relation.type} ${relation.target}` : relation.type]));
    }
    if (usesSoftDeletes(model) || migrations.some(usesSoftDeletes)) {
        entity.soft_deletes = true;
    }

    return { entity, options: generatedOptions(root, name) };
}

export function rebuiltSchema(name: string, entity: ApiSchemaEntity, options: RebuiltOptions): ApiSchema {
    const flags: NonNullable<ApiSchema['options']> = {};
    if (options.queryBuilder) {
        flags.query_builder = true;
    }
    if (options.pest) {
        flags.pest = true;
    }
    if (options.jsonApi) {
        flags.json_api = true;
    }
    return Object.keys(flags).length > 0 ? { options: flags, entities: { [name]: entity } } : { entities: { [name]: entity } };
}

function schemaField(column: Column, castValues: string[] | undefined): ApiSchemaField {
    const values = column.enumValues && column.enumValues.length > 0 ? column.enumValues : castValues;
    const field: ApiSchemaField = values ? { type: 'string', enum: values } : { type: column.type === 'enum' ? 'string' : column.type };
    if (column.primary) {
        field.primary = true;
    }
    if (column.nullable) {
        field.nullable = true;
    }
    if (column.unique && !column.primary) {
        field.unique = true;
    }
    if (column.default !== undefined) {
        field.default = column.default;
    }
    return field;
}

/** Values of the backed enums the model casts its columns to. */
function enumValues(root: string, model: string): Map<string, string[]> {
    const values = new Map<string, string[]>();
    for (const [, column, enumClass] of model.matchAll(/['"](\w+)['"]\s*=>\s*(\w+)::class/g)) {
        const cases = [...read(path.join(root, 'app', 'Enums', `${enumClass}.php`)).matchAll(/case\s+\w+\s*=\s*['"]([^'"]*)['"]\s*;/g)].map((match) => match[1]);
        if (cases.length > 0) {
            values.set(column, cases);
        }
    }
    return values;
}

/** The options the existing files were generated with. */
function generatedOptions(root: string, name: string): RebuiltOptions {
    return {
        pest: /^\s*(?:it|test)\s*\(/m.test(read(path.join(root, 'tests', 'Feature', `${name}ControllerTest.php`))),
        queryBuilder: /\bQueryBuilder\b/.test(read(path.join(root, 'app', 'Services', `${name}Service.php`))),
        jsonApi: /\bJsonApiResource\b/.test(read(path.join(root, 'app', 'Http', 'Resources', `${name}Resource.php`))),
    };
}

function tableMigrations(root: string, table: string): string[] {
    const folder = path.join(root, 'database', 'migrations');
    let files: string[];
    try {
        files = fs.readdirSync(folder).filter((file) => file.endsWith('.php')).sort();
    } catch {
        return [];
    }
    return files.map((file) => read(path.join(folder, file))).filter((content) => touches(content, 'create', table) || touches(content, 'table', table));
}

function touches(content: string, method: 'create' | 'table', table: string): boolean {
    return new RegExp(`Schema::${method}\\(\\s*['"]${table}['"]`).test(content);
}

function tableName(entity: string): string {
    return pluralize(snake(entity));
}

function snake(name: string): string {
    return name.replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase();
}

function read(file: string): string {
    try {
        return fs.readFileSync(file, 'utf-8');
    } catch {
        return '';
    }
}
