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
    /** The package's kind, as `--only` names it: `Request` covers the Store and Update requests. */
    kind?: string;
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

export const SUPPORTED_PROTOCOL = 1;

export type PlannedAction = 'create' | 'update' | 'unchanged';

export interface PlannedFile {
    path: string;
    kind: string;
    entity?: string;
    action: PlannedAction;
    /** Edited by hand since it was generated: the package leaves it as is unless forced (package >= 3.11). */
    kept?: boolean;
    content?: string;
}

export interface ProtocolMessage {
    code: string;
    message: string;
    hint?: string;
}

export interface PlanResult {
    files: PlannedFile[];
    warnings: ProtocolMessage[];
}

export interface HandshakeResult {
    protocol: number;
    package: { version: string };
    laravel: string;
    php: string;
    capabilities: {
        fieldTypes: string[];
        relationTypes: string[];
        keepsEditedFiles?: boolean;
        options: { json_api: { supported: boolean; reason?: string } };
    };
}

export interface GenerationDocument {
    protocol: number;
    dryRun: boolean;
    files: PlannedFile[];
    warnings: ProtocolMessage[];
    errors: ProtocolMessage[];
}

export interface ApiSchemaField {
    type: string;
    primary?: boolean;
    enum?: string[];
}

export interface ApiSchemaEntity {
    fields: Record<string, ApiSchemaField>;
    relations?: Record<string, string>;
    soft_deletes?: boolean;
}

export interface ApiSchema {
    options?: { query_builder?: boolean; pest?: boolean; json_api?: boolean };
    entities: Record<string, ApiSchemaEntity>;
}

export interface PlanFlags {
    auth?: boolean;
    postman?: boolean;
    only?: string[];
}
