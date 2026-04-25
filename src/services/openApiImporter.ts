/**
 * Convert an OpenAPI 3.0 / Swagger 2.0 document (JSON only for the MVP) into
 * the class_data.json format the package's JsonParser already understands.
 */

interface OpenApiSchema {
    type?: string;
    format?: string;
    properties?: Record<string, OpenApiSchema>;
    items?: OpenApiSchema;
    required?: string[];
    $ref?: string;
}

interface OpenApiDoc {
    components?: { schemas?: Record<string, OpenApiSchema> };
    definitions?: Record<string, OpenApiSchema>; // Swagger 2.0
}

interface ClassDataAttribute {
    name: string;
    _type: string;
    required: boolean;
}

interface ClassDataEntity {
    name: string;
    attributes: ClassDataAttribute[];
    oneToOneRelationships: Array<{ comodel: string; role: string }>;
    oneToManyRelationships: Array<{ comodel: string; role: string }>;
    manyToOneRelationships: Array<{ comodel: string; role: string }>;
    manyToManyRelationships: Array<{ comodel: string; role: string }>;
}

export interface OpenApiImportResult {
    entities: ClassDataEntity[];
    skipped: string[];
}

const SKIP_NAMES = new Set([
    'Error',
    'ErrorResponse',
    'ValidationError',
    'PaginatedResponse',
    'Pagination',
    'Meta',
    'Links',
]);

export function parseOpenApi(raw: string): OpenApiImportResult {
    const doc = JSON.parse(raw) as OpenApiDoc;

    const schemas: Record<string, OpenApiSchema> =
        doc.components?.schemas ?? doc.definitions ?? {};

    const entities: ClassDataEntity[] = [];
    const skipped: string[] = [];

    for (const [schemaName, schema] of Object.entries(schemas)) {
        if (SKIP_NAMES.has(schemaName)) {
            skipped.push(schemaName);
            continue;
        }
        const entity = schemaToEntity(schemaName, schema, schemas);
        if (entity.attributes.length === 0) {
            skipped.push(schemaName);
            continue;
        }
        entities.push(entity);
    }

    return { entities, skipped };
}

function schemaToEntity(
    name: string,
    schema: OpenApiSchema,
    allSchemas: Record<string, OpenApiSchema>
): ClassDataEntity {
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);

    const attributes: ClassDataAttribute[] = [];
    const manyToOne: Array<{ comodel: string; role: string }> = [];
    const oneToMany: Array<{ comodel: string; role: string }> = [];

    for (const [propName, propSchema] of Object.entries(properties)) {
        // Skip technical fields
        if (['id', 'created_at', 'updated_at', 'deleted_at'].includes(propName)) {
            continue;
        }

        // $ref → relationship to another schema
        if (propSchema.$ref) {
            const targetName = refToName(propSchema.$ref);
            if (targetName && allSchemas[targetName]) {
                manyToOne.push({ comodel: targetName, role: propName });
                continue;
            }
        }

        // array of $ref → hasMany
        if (propSchema.type === 'array' && propSchema.items?.$ref) {
            const targetName = refToName(propSchema.items.$ref);
            if (targetName && allSchemas[targetName]) {
                oneToMany.push({ comodel: targetName, role: propName });
                continue;
            }
        }

        const mapped = mapType(propSchema);
        attributes.push({
            name: propName,
            _type: mapped,
            required: required.has(propName),
        });
    }

    return {
        name,
        attributes,
        oneToOneRelationships: [],
        oneToManyRelationships: oneToMany,
        manyToOneRelationships: manyToOne,
        manyToManyRelationships: [],
    };
}

function refToName(ref: string): string | null {
    // "#/components/schemas/User" -> "User"
    // "#/definitions/User" -> "User"
    const m = ref.match(/\/(?:schemas|definitions)\/([^/]+)$/);
    return m ? m[1] : null;
}

function mapType(schema: OpenApiSchema): string {
    const type = schema.type ?? 'string';
    const format = schema.format ?? '';

    if (type === 'integer') {
        return format === 'int64' ? 'bigint' : 'integer';
    }
    if (type === 'number') {
        return format === 'float' ? 'float' : 'decimal';
    }
    if (type === 'boolean') {
        return 'boolean';
    }
    if (type === 'array') {
        return 'json';
    }
    if (type === 'object') {
        return 'json';
    }
    if (type === 'string') {
        if (format === 'date') {
            return 'date';
        }
        if (format === 'date-time') {
            return 'datetime';
        }
        if (format === 'uuid') {
            return 'uuid';
        }
        // long text heuristic
        return 'string';
    }
    return 'string';
}
