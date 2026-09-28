import { ApiSchema, ApiSchemaEntity, ApiSchemaField, EntityConfig, PlanFlags } from '../types';

export function schemaFromConfig(config: EntityConfig): ApiSchema {
    const fields: Record<string, ApiSchemaField> = {};
    for (const field of config.fields) {
        const name = field.name.trim();
        if (name === '') {
            continue;
        }
        const enumValues = /^enum\((.*)\)$/.exec(field.type);
        const entry: ApiSchemaField = enumValues
            ? { type: 'string', enum: enumValues[1].split(',').map((value) => value.trim()).filter((value) => value !== '') }
            : { type: field.type };
        if (field.primary) {
            entry.primary = true;
        }
        if (field.nullable) {
            entry.nullable = true;
        }
        if (field.unique && !field.primary) {
            entry.unique = true;
        }
        if (field.default !== undefined && field.default !== '') {
            entry.default = field.default;
        }
        fields[name] = entry;
    }

    const entity: ApiSchemaEntity = { fields };
    if (config.options.softDeletes) {
        entity.soft_deletes = true;
    }

    const relations: Record<string, string> = {};
    for (const relation of config.relationships ?? []) {
        const role = (relation.role || relation.target.toLowerCase()).trim();
        relations[role] = `${relation.type} ${relation.target}`;
    }
    if (Object.keys(relations).length > 0) {
        entity.relations = relations;
    }

    const options: NonNullable<ApiSchema['options']> = {};
    if (config.options.queryBuilder) {
        options.query_builder = true;
    }
    if (config.options.pest) {
        options.pest = true;
    }
    if (config.options.jsonApi) {
        options.json_api = true;
    }

    const schema: ApiSchema = { entities: { [config.name]: entity } };
    if (Object.keys(options).length > 0) {
        return { options, entities: schema.entities };
    }
    return schema;
}

export function flagsFromConfig(config: EntityConfig): PlanFlags {
    const flags: PlanFlags = {};
    if (config.options.auth) {
        flags.auth = true;
    }
    if (config.options.postman) {
        flags.postman = true;
    }
    if (config.onlyTypes && config.onlyTypes.length > 0) {
        flags.only = [...config.onlyTypes];
    }
    return flags;
}
