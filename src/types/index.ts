export interface Field {
    name: string;
    type: string;
}

export interface GenerateOptions {
    auth: boolean;
    postman: boolean;
    softDeletes: boolean;
}

export interface EntityConfig {
    name: string;
    fields: Field[];
    options: GenerateOptions;
}

export interface ArtisanResult {
    success: boolean;
    output: string;
    errors: string[];
}

export interface GeneratedEntity {
    name: string;
    files: EntityFile[];
}

export interface EntityFile {
    type: string;
    path: string;
    exists: boolean;
}

export const FIELD_TYPES = [
    'string',
    'integer',
    'text',
    'float',
    'decimal',
    'boolean',
    'json',
    'date',
    'datetime',
    'timestamp',
    'time',
    'uuid',
    'bigint',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];
