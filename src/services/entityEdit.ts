import { ApiSchemaEntity, Field, GeneratedEntity } from '../types';
import { rebuildEntity } from './entityRebuild';
import { EntityScanner } from './entityScanner';
import { recordedDefinition } from './manifest';

export interface EditField {
    name: string;
    type: string;
    nullable?: boolean;
    unique?: boolean;
    primary?: boolean;
    default?: string;
    enumValues?: string[];
}

export interface EditRelation {
    type: string;
    target: string;
    role: string;
}

export interface EditableEntity {
    name: string;
    source: 'recorded' | 'rebuilt' | 'scanned';
    fields: EditField[];
    relations: EditRelation[];
    softDeletes: boolean;
}

const LEGACY_RELATIONS: Record<string, string> = {
    oneToOne: 'hasOne',
    oneToMany: 'hasMany',
    manyToOne: 'belongsTo',
    manyToMany: 'belongsToMany',
};

type Row = Record<string, unknown>;

export function editableEntity(root: string, name: string): EditableEntity | undefined {
    const recorded = editableFromRecorded(name, recordedDefinition(root, name));
    if (recorded) {
        return recorded;
    }
    const rebuilt = rebuildEntity(root, name);
    if (rebuilt) {
        return editableFromSchema(name, rebuilt.entity);
    }
    const scanned = new EntityScanner(root).scan().find((entity) => entity.name === name);
    return scanned ? editableFromScan(scanned) : undefined;
}

/** From the definition the package records in its manifest (4.1+). Undefined when it is not one. */
export function editableFromRecorded(name: string, definition: unknown): EditableEntity | undefined {
    if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
        return undefined;
    }
    const { fields, relationships, options } = definition as Row;

    return {
        name,
        source: 'recorded',
        fields: rows(fields).flatMap((field) => {
            if (typeof field.name !== 'string' || typeof field.type !== 'string') {
                return [];
            }
            const attributes = (typeof field.attributes === 'object' && field.attributes !== null ? field.attributes : {}) as Row;
            const values = Array.isArray(attributes.enum) ? attributes.enum.map(String) : undefined;
            const entry: EditField = { name: field.name, type: values ? 'enum' : field.type };
            if (values) {
                entry.enumValues = values;
            }
            if (field.nullable === true) {
                entry.nullable = true;
            }
            if (field.unique === true) {
                entry.unique = true;
            }
            if (attributes.primary === true) {
                entry.primary = true;
            }
            if (field.default !== undefined && field.default !== null) {
                entry.default = String(field.default);
            }
            return [entry];
        }),
        relations: rows(relationships).flatMap((relation) => {
            if (typeof relation.type !== 'string' || typeof relation.relatedModel !== 'string') {
                return [];
            }
            return [{ type: LEGACY_RELATIONS[relation.type] ?? relation.type, target: relation.relatedModel, role: typeof relation.role === 'string' ? relation.role : '' }];
        }),
        softDeletes: ((typeof options === 'object' && options !== null ? options : {}) as Row).soft_deletes === true,
    };
}

export function editableFromSchema(name: string, entity: ApiSchemaEntity): EditableEntity {
    return {
        name,
        source: 'rebuilt',
        fields: Object.entries(entity.fields).map(([field, definition]) => {
            const entry: EditField = { name: field, type: definition.enum ? 'enum' : definition.type };
            if (definition.enum) {
                entry.enumValues = [...definition.enum];
            }
            if (definition.nullable) {
                entry.nullable = true;
            }
            if (definition.unique) {
                entry.unique = true;
            }
            if (definition.primary) {
                entry.primary = true;
            }
            if (definition.default !== undefined) {
                entry.default = definition.default;
            }
            return entry;
        }),
        relations: Object.entries(entity.relations ?? {}).map(([role, value]) => {
            const [type, target = ''] = value.trim().split(/\s+/);
            return { type, target, role };
        }),
        softDeletes: entity.soft_deletes === true,
    };
}

/** From the model alone, when nothing better exists: the names are known, the types are not. */
export function editableFromScan(entity: GeneratedEntity): EditableEntity {
    return {
        name: entity.name,
        source: 'scanned',
        fields: (entity.fields ?? []).map((field) => ({ name: field, type: '' })),
        relations: (entity.relations ?? []).map((relation) => ({ type: relation.type, target: relation.target, role: relation.name })),
        softDeletes: false,
    };
}

/** The value of `--add-fields`: name:type pairs, an enum carrying its values. */
export function addFieldsSpec(fields: Array<Pick<Field, 'name' | 'type'>>): string {
    return fields
        .map((field) => ({ name: field.name.trim(), type: field.type.trim() }))
        .filter((field) => field.name !== '' && field.type !== '')
        .map((field) => `${field.name}:${field.type}`)
        .join(',');
}

function rows(value: unknown): Row[] {
    return Array.isArray(value) ? value.filter((item): item is Row => typeof item === 'object' && item !== null) : [];
}
