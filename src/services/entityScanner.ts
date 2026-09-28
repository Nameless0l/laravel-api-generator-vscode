import * as path from 'path';
import * as fs from 'fs';
import { GeneratedEntity, EntityFile, EntityRelation } from '../types';
import { editedFiles, ManifestEntry, readManifest } from './manifest';
import { enumClasses, fillableColumns } from './modelSource';

const ENTITY_KINDS = new Set(['Model', 'Controller', 'Service', 'DTO', 'Request', 'Resource', 'Policy', 'Enum', 'Factory', 'Seeder', 'FeatureTest', 'UnitTest', 'Migration']);

const KIND_ORDER = [...ENTITY_KINDS, 'PivotMigration'];

const KIND_LABELS: Record<string, string> = { FeatureTest: 'Feature Test', UnitTest: 'Unit Test', PivotMigration: 'Pivot Migration' };

export class EntityScanner {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Entities recorded in the generation manifest, plus the ones generated
     * before it existed (a model with its Controller and Service).
     */
    scan(): GeneratedEntity[] {
        const manifest = readManifest(this.workspaceRoot);
        const names = new Set([
            ...(manifest ?? []).flatMap((entry) => (entry.entity !== null && ENTITY_KINDS.has(entry.kind) ? [entry.entity] : [])),
            ...this.conventionalEntityNames(),
        ]);

        return [...names].sort().flatMap((name) => {
            const files = this.getEntityFiles(name, manifest);
            if (!files.some((file) => file.exists)) {
                return [];
            }
            const recorded = (manifest ?? []).filter((entry) => entry.entity === name);
            const edited = [...editedFiles(this.workspaceRoot, recorded)].sort();
            return [{ name, files, ...this.parseModel(files), edited, tracked: recorded.length > 0 }];
        });
    }

    /** The manifest's paths when it tracks the entity, the conventional ones otherwise. */
    getEntityFiles(name: string, manifest: ManifestEntry[] | null = readManifest(this.workspaceRoot)): EntityFile[] {
        const recorded = (manifest ?? []).filter((entry) => entry.entity === name && KIND_ORDER.includes(entry.kind));
        if (recorded.length === 0) {
            return this.conventionalFiles(name);
        }

        return recorded
            .map((entry) => this.file(entry.kind, entry.path, name))
            .sort((a, b) => KIND_ORDER.indexOf(a.kind ?? '') - KIND_ORDER.indexOf(b.kind ?? '') || a.path.localeCompare(b.path));
    }

    private conventionalEntityNames(): string[] {
        const modelsDir = path.join(this.workspaceRoot, 'app', 'Models');
        if (!fs.existsSync(modelsDir)) {
            return [];
        }

        // Laravel's default User model has no Controller nor Service, so it stays out.
        return fs
            .readdirSync(modelsDir)
            .filter((file) => file.endsWith('.php'))
            .map((file) => file.replace('.php', ''))
            .filter((name) => this.exists(`app/Http/Controllers/${name}Controller.php`) && this.exists(`app/Services/${name}Service.php`));
    }

    private conventionalFiles(name: string): EntityFile[] {
        const model = `app/Models/${name}.php`;
        const legacyRequest = `app/Http/Requests/${name}Request.php`;
        const requests = this.exists(legacyRequest) && !this.exists(`app/Http/Requests/Store${name}Request.php`)
            ? [legacyRequest]
            : [`app/Http/Requests/Store${name}Request.php`, `app/Http/Requests/Update${name}Request.php`];
        const enums = this.exists(model) ? enumClasses(this.read(model)).map((enumClass) => `app/Enums/${enumClass}.php`) : [];

        const files: EntityFile[] = [
            this.file('Model', model, name),
            this.file('Controller', `app/Http/Controllers/${name}Controller.php`, name),
            this.file('Service', `app/Services/${name}Service.php`, name),
            this.file('DTO', `app/DTO/${name}DTO.php`, name),
            ...requests.map((request) => this.file('Request', request, name)),
            this.file('Resource', `app/Http/Resources/${name}Resource.php`, name),
            this.file('Policy', `app/Policies/${name}Policy.php`, name),
            ...enums.map((enumFile) => this.file('Enum', enumFile, name)),
            this.file('Factory', `database/factories/${name}Factory.php`, name),
            this.file('Seeder', `database/seeders/${name}Seeder.php`, name),
            this.file('FeatureTest', `tests/Feature/${name}ControllerTest.php`, name),
            this.file('UnitTest', `tests/Unit/${name}ServiceTest.php`, name),
        ];

        const table = this.pluralSnake(name);
        const migration = this.findMigration(table);
        files.push({
            type: 'Migration',
            kind: 'Migration',
            path: migration || `database/migrations/*_create_${table}_table.php`,
            exists: migration !== null,
        });

        return files;
    }

    private file(kind: string, relativePath: string, entity: string): EntityFile {
        const base = path.basename(relativePath);
        let type = KIND_LABELS[kind] ?? kind;
        if (kind === 'Request' && base === `Store${entity}Request.php`) {
            type = 'Store Request';
        } else if (kind === 'Request' && base === `Update${entity}Request.php`) {
            type = 'Update Request';
        }

        return { type, kind, path: relativePath, exists: this.exists(relativePath) };
    }

    /**
     * Extract fillable + relationship methods from a generated model file.
     */
    private parseModel(files: EntityFile[]): { fields: string[]; relations: EntityRelation[] } {
        const model = files.find((file) => file.kind === 'Model');
        if (!model || !model.exists) {
            return { fields: [], relations: [] };
        }

        const content = this.read(model.path);

        // Extract relationship methods: public function name(): RelType { return $this->relType(Target::class) }
        const relations: EntityRelation[] = [];
        const relRegex = /public\s+function\s+(\w+)\s*\(\s*\)\s*(?::\s*[\w\\]+)?\s*\{[^}]*?\$this->(belongsTo|hasMany|hasOne|belongsToMany|morphTo|morphMany)\s*\(\s*([\w\\]+)::class/g;
        let rm: RegExpExecArray | null;
        while ((rm = relRegex.exec(content)) !== null) {
            const [, methodName, relType, target] = rm;
            const cleanTarget = target.split('\\').pop() || target;
            relations.push({ name: methodName, type: relType, target: cleanTarget });
        }

        return { fields: fillableColumns(content), relations };
    }

    private exists(relativePath: string): boolean {
        return fs.existsSync(path.join(this.workspaceRoot, relativePath));
    }

    private read(relativePath: string): string {
        try {
            return fs.readFileSync(path.join(this.workspaceRoot, relativePath), 'utf-8');
        } catch {
            return '';
        }
    }

    private findMigration(tableName: string): string | null {
        const migrationsDir = path.join(this.workspaceRoot, 'database', 'migrations');
        if (!fs.existsSync(migrationsDir)) {
            return null;
        }

        const files = fs.readdirSync(migrationsDir);
        const match = files.find((f) => f.includes(`_create_${tableName}_table.php`));
        return match ? `database/migrations/${match}` : null;
    }

    private pluralSnake(name: string): string {
        // Simple PascalCase -> snake_case + plural
        const snake = name
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .replace(/^_/, '');
        // Naive pluralization
        if (snake.endsWith('y')) {
            return snake.slice(0, -1) + 'ies';
        }
        if (snake.endsWith('s') || snake.endsWith('x') || snake.endsWith('ch') || snake.endsWith('sh')) {
            return snake + 'es';
        }
        return snake + 's';
    }
}
