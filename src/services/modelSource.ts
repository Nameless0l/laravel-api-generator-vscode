export interface ModelRelation {
    method: string;
    type: string;
    target: string;
}

export interface Column {
    name: string;
    type: string;
    nullable: boolean;
    unique: boolean;
    primary: boolean;
    default?: string;
    enumValues?: string[];
    references?: string;
}

/** Fillable columns of a model, from `$fillable` or, on Laravel 13, `#[Fillable([...])]`. */
export function fillableColumns(content: string): string[] {
    const match = /(?:\$fillable\s*=\s*\[|#\[Fillable\(\s*\[)([\s\S]*?)\]/.exec(content);
    if (!match) {
        return [];
    }

    return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** Enum classes a model uses, imported (4.0) or fully qualified (3.x). */
export function enumClasses(content: string): string[] {
    return [...new Set([...content.matchAll(/App\\Enums\\(\w+)/g)].map((m) => m[1]))];
}

/** Relationship methods of a model: `public function author(): BelongsTo { return $this->belongsTo(Author::class); }`. */
export function modelRelations(content: string): ModelRelation[] {
    const pattern = /public\s+function\s+(\w+)\s*\(\s*\)\s*(?::\s*[\w\\|?]+)?\s*\{[^}]*?\$this->(belongsTo|hasMany|hasOne|belongsToMany|morphTo|morphMany|morphOne)\s*\(\s*([\w\\]+::class)?/g;
    const relations: ModelRelation[] = [];
    for (const match of content.matchAll(pattern)) {
        const target = match[3] ? match[3].replace(/::class$/, '').split('\\').pop() ?? '' : '';
        relations.push({ method: match[1], type: match[2], target });
    }
    return relations;
}

export function usesSoftDeletes(content: string): boolean {
    return /\bSoftDeletes\b/.test(content) || /\$table->softDeletes\(/.test(content);
}

const COLUMN_TYPES: Record<string, string> = {
    string: 'string',
    char: 'string',
    text: 'text',
    mediumText: 'text',
    longText: 'text',
    integer: 'integer',
    tinyInteger: 'integer',
    smallInteger: 'integer',
    mediumInteger: 'integer',
    unsignedInteger: 'integer',
    bigInteger: 'bigint',
    unsignedBigInteger: 'bigint',
    foreignId: 'bigint',
    decimal: 'decimal',
    float: 'float',
    double: 'float',
    boolean: 'boolean',
    json: 'json',
    jsonb: 'json',
    date: 'date',
    dateTime: 'datetime',
    dateTimeTz: 'datetime',
    timestamp: 'timestamp',
    timestampTz: 'timestamp',
    time: 'time',
    uuid: 'uuid',
    foreignUuid: 'uuid',
    ulid: 'string',
    enum: 'enum',
};

const SKIPPED = new Set(['timestamps', 'timestampsTz', 'softDeletes', 'softDeletesTz', 'rememberToken', 'nullableTimestamps', 'morphs', 'nullableMorphs', 'uuidMorphs', 'nullableUuidMorphs', 'index', 'dropColumn', 'renameColumn']);

/** Columns a migration declares, in order, with the modifiers the generator writes. */
export function migrationColumns(content: string): Column[] {
    const columns: Column[] = [];
    const byName = new Map<string, Column>();
    const pattern = /\$table->(\w+)\(([^;]*?)\)((?:\s*->\s*\w+\((?:[^()]|\([^()]*\))*\))*)\s*;/g;

    for (const match of content.matchAll(pattern)) {
        const [, method, rawArgs, chain] = match;
        const args = splitArgs(rawArgs);
        const name = unquote(args[0] ?? '');

        if (method === 'id' || method === 'bigIncrements' || method === 'increments') {
            const column = { name: name || 'id', type: 'bigint', nullable: false, unique: false, primary: true };
            columns.push(column);
            byName.set(column.name, column);
            continue;
        }
        if (method === 'foreign') {
            const on = /->\s*on\(\s*['"]([^'"]+)['"]/.exec(chain);
            const existing = byName.get(name);
            if (existing && on) {
                existing.references = on[1];
            }
            continue;
        }
        if (SKIPPED.has(method) || name === '' || !(method in COLUMN_TYPES)) {
            continue;
        }

        const column: Column = {
            name,
            type: COLUMN_TYPES[method],
            nullable: /->\s*nullable\(\s*\)/.test(chain),
            unique: /->\s*unique\(\s*\)/.test(chain),
            primary: /->\s*primary\(\s*\)/.test(chain),
        };
        const defaultValue = /->\s*default\(\s*((?:'[^']*'|"[^"]*"|[^)]*))\s*\)/.exec(chain);
        if (defaultValue) {
            column.default = unquote(defaultValue[1]);
        }
        if (method === 'enum') {
            column.enumValues = [...(args.slice(1).join(',').matchAll(/['"]([^'"]+)['"]/g))].map((m) => m[1]);
        }
        const constrained = /->\s*constrained\(\s*(?:['"]([^'"]+)['"])?/.exec(chain);
        if (constrained) {
            column.references = constrained[1] ?? `${name.replace(/_id$/, '')}s`;
        }
        columns.push(column);
        byName.set(name, column);
    }

    return columns;
}

function splitArgs(raw: string): string[] {
    const args: string[] = [];
    let depth = 0;
    let current = '';
    let quote = '';
    for (const char of raw) {
        if (quote) {
            current += char;
            if (char === quote) {
                quote = '';
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '[' || char === '(') {
            depth++;
        } else if (char === ']' || char === ')') {
            depth--;
        } else if (char === ',' && depth === 0) {
            args.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim() !== '') {
        args.push(current.trim());
    }
    return args;
}

function unquote(value: string): string {
    return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}
