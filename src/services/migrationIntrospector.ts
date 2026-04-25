import * as fs from 'fs';
import * as path from 'path';

interface IntrospectedField {
    name: string;
    type: string;
}

interface IntrospectedSchema {
    fields: IntrospectedField[];
    softDeletes: boolean;
}

/**
 * Reads an existing Laravel migration for a given entity and extracts
 * fields and options so we can regenerate other artifacts without asking
 * the user to retype the schema.
 */
export class MigrationIntrospector {
    constructor(private readonly workspaceRoot: string) {}

    /**
     * Find the latest migration file matching `*_create_{tableName}_table.php`.
     */
    findMigrationFile(entityName: string): string | null {
        const tableName = this.pluralSnake(entityName);
        const migrationsDir = path.join(this.workspaceRoot, 'database', 'migrations');

        if (!fs.existsSync(migrationsDir)) {
            return null;
        }

        const suffix = `_create_${tableName}_table.php`;
        const matches = fs
            .readdirSync(migrationsDir)
            .filter((f) => f.endsWith(suffix))
            .sort();

        if (matches.length === 0) {
            return null;
        }

        return path.join(migrationsDir, matches[matches.length - 1]);
    }

    /**
     * Parse the migration file and extract its schema.
     */
    introspect(entityName: string): IntrospectedSchema | null {
        const migrationPath = this.findMigrationFile(entityName);
        if (!migrationPath) {
            return null;
        }

        const content = fs.readFileSync(migrationPath, 'utf-8');
        return this.parse(content);
    }

    private parse(content: string): IntrospectedSchema {
        const fields: IntrospectedField[] = [];
        let softDeletes = false;

        // Map Laravel Schema methods to our field type names
        const typeMap: Record<string, string> = {
            string: 'string',
            text: 'text',
            longText: 'text',
            mediumText: 'text',
            integer: 'integer',
            bigInteger: 'bigint',
            unsignedBigInteger: 'bigint',
            tinyInteger: 'integer',
            smallInteger: 'integer',
            boolean: 'boolean',
            float: 'float',
            decimal: 'decimal',
            double: 'float',
            json: 'json',
            jsonb: 'json',
            date: 'date',
            dateTime: 'datetime',
            datetime: 'datetime',
            timestamp: 'timestamp',
            time: 'time',
            uuid: 'uuid',
        };

        // Match lines like: $table->string('title') or $table->foreignId('author_id')->constrained(...)
        // We capture the method name and the first string argument.
        const lineRegex = /\$table->(\w+)\(\s*['"]([^'"]+)['"]/g;
        let match: RegExpExecArray | null;

        while ((match = lineRegex.exec(content)) !== null) {
            const [, method, name] = match;

            // Skip pseudo-fields and FK methods (the FK is reconstructed via relationships,
            // not as a regular field)
            if (
                method === 'foreignId' ||
                method === 'foreign' ||
                method === 'index' ||
                method === 'unique' ||
                method === 'primary'
            ) {
                continue;
            }

            const mapped = typeMap[method];
            if (mapped) {
                fields.push({ name, type: mapped });
            }
        }

        if (/\$table->softDeletes\(\s*\)/.test(content)) {
            softDeletes = true;
        }

        return { fields, softDeletes };
    }

    private pluralSnake(name: string): string {
        const snake = name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
        if (snake.endsWith('y')) {
            return snake.slice(0, -1) + 'ies';
        }
        if (
            snake.endsWith('s') ||
            snake.endsWith('x') ||
            snake.endsWith('sh') ||
            snake.endsWith('ch')
        ) {
            return snake + 'es';
        }
        return snake + 's';
    }
}
