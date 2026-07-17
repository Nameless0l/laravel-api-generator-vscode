export interface Field {
    name: string;
    type: string;
    /** Marks the field as the table's primary key instead of the default id (package >= 3.6). */
    primary?: boolean;
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
    /** Generate index endpoints with spatie/laravel-query-builder (package >= 3.5). */
    queryBuilder?: boolean;
    /** Generate Pest tests instead of PHPUnit (package >= 3.6). */
    pest?: boolean;
    /** Generate JSON:API-compliant resources (package >= 3.7, Laravel 12.45+). */
    jsonApi?: boolean;
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
    'enum',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];
