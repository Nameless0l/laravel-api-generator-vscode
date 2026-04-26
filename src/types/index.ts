export interface Field {
    name: string;
    type: string;
}

export interface Relationship {
    type: 'belongsTo' | 'hasMany' | 'hasOne' | 'belongsToMany';
    target: string;
    role: string;
}

export interface GenerateOptions {
    auth: boolean;
    postman: boolean;
    softDeletes: boolean;
}

export interface EntityConfig {
    name: string;
    fields: Field[];
    relationships?: Relationship[];
    options: GenerateOptions;
    /** When set, only these artifact types are generated (passes --only= to artisan). */
    onlyTypes?: string[];
}

export interface ArtisanResult {
    success: boolean;
    output: string;
    errors: string[];
}

export interface EntityRelation {
    name: string;
    type: string;
    target: string;
}

export interface GeneratedEntity {
    name: string;
    files: EntityFile[];
    fields?: string[];
    relations?: EntityRelation[];
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
