import * as path from 'path';
import * as fs from 'fs';
import { GeneratedEntity, EntityFile, EntityRelation } from '../types';

export class EntityScanner {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    scan(): GeneratedEntity[] {
        const modelsDir = path.join(this.workspaceRoot, 'app', 'Models');
        if (!fs.existsSync(modelsDir)) {
            return [];
        }

        const modelFiles = fs
            .readdirSync(modelsDir)
            .filter((f) => f.endsWith('.php') && f !== 'User.php');

        const entities: GeneratedEntity[] = [];

        for (const file of modelFiles) {
            const name = file.replace('.php', '');
            const files = this.getEntityFiles(name);

            // Consider it a generated entity if at least Controller + Service exist
            const hasController = files.some((f) => f.type === 'Controller' && f.exists);
            const hasService = files.some((f) => f.type === 'Service' && f.exists);

            if (hasController && hasService) {
                const modelInfo = this.parseModel(name);
                entities.push({ name, files, fields: modelInfo.fields, relations: modelInfo.relations });
            }
        }

        return entities;
    }

    /**
     * Extract fillable + relationship methods from a generated model file.
     */
    private parseModel(name: string): { fields: string[]; relations: EntityRelation[] } {
        const modelPath = path.join(this.workspaceRoot, 'app', 'Models', `${name}.php`);
        if (!fs.existsSync(modelPath)) {
            return { fields: [], relations: [] };
        }

        const content = fs.readFileSync(modelPath, 'utf-8');

        // Extract fillable: $fillable = [ 'a', 'b', ... ];
        const fields: string[] = [];
        const fillableMatch = content.match(/protected\s+\$fillable\s*=\s*\[([\s\S]*?)\];/);
        if (fillableMatch) {
            const inner = fillableMatch[1];
            const re = /['"]([^'"]+)['"]/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(inner)) !== null) {
                fields.push(m[1]);
            }
        }

        // Extract relationship methods: public function name(): RelType { return $this->relType(Target::class) }
        const relations: EntityRelation[] = [];
        const relRegex = /public\s+function\s+(\w+)\s*\(\s*\)\s*(?::\s*[\w\\]+)?\s*\{[^}]*?\$this->(belongsTo|hasMany|hasOne|belongsToMany|morphTo|morphMany)\s*\(\s*([\w\\]+)::class/g;
        let rm: RegExpExecArray | null;
        while ((rm = relRegex.exec(content)) !== null) {
            const [, methodName, relType, target] = rm;
            const cleanTarget = target.split('\\').pop() || target;
            relations.push({ name: methodName, type: relType, target: cleanTarget });
        }

        return { fields, relations };
    }

    getEntityFiles(name: string): EntityFile[] {
        const pluralSnake = this.pluralSnake(name);

        const fileMap: Array<{ type: string; relativePath: string }> = [
            { type: 'Model', relativePath: `app/Models/${name}.php` },
            { type: 'Controller', relativePath: `app/Http/Controllers/${name}Controller.php` },
            { type: 'Service', relativePath: `app/Services/${name}Service.php` },
            { type: 'DTO', relativePath: `app/DTO/${name}DTO.php` },
            { type: 'Request', relativePath: `app/Http/Requests/${name}Request.php` },
            { type: 'Resource', relativePath: `app/Http/Resources/${name}Resource.php` },
            { type: 'Policy', relativePath: `app/Policies/${name}Policy.php` },
            { type: 'Factory', relativePath: `database/factories/${name}Factory.php` },
            { type: 'Seeder', relativePath: `database/seeders/${name}Seeder.php` },
            { type: 'Feature Test', relativePath: `tests/Feature/${name}ControllerTest.php` },
            { type: 'Unit Test', relativePath: `tests/Unit/${name}ServiceTest.php` },
        ];

        // Find migration by glob pattern
        const migrationFile = this.findMigration(pluralSnake);

        const files: EntityFile[] = fileMap.map(({ type, relativePath }) => ({
            type,
            path: relativePath,
            exists: fs.existsSync(path.join(this.workspaceRoot, relativePath)),
        }));

        files.push({
            type: 'Migration',
            path: migrationFile || `database/migrations/*_create_${pluralSnake}_table.php`,
            exists: migrationFile !== null,
        });

        return files;
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
