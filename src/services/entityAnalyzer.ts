import * as fs from 'fs';
import * as path from 'path';

export interface EntityRelationship {
    type: string;
    target: string;
    method: string;
}

export interface EntityInfo {
    name: string;
    fields: string[];
    relationships: EntityRelationship[];
}

export class EntityAnalyzer {
    constructor(private workspaceRoot: string) {}

    analyzeEntities(): EntityInfo[] {
        const modelsDir = path.join(this.workspaceRoot, 'app', 'Models');
        if (!fs.existsSync(modelsDir)) {
            return [];
        }

        const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.php') && f !== 'User.php');
        const entities: EntityInfo[] = [];

        for (const file of files) {
            const filePath = path.join(modelsDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const name = file.replace('.php', '');

            // Check if it's a generated entity (has Controller + Service)
            const hasController = fs.existsSync(path.join(this.workspaceRoot, 'app', 'Http', 'Controllers', `${name}Controller.php`));
            const hasService = fs.existsSync(path.join(this.workspaceRoot, 'app', 'Services', `${name}Service.php`));
            if (!hasController || !hasService) {
                continue;
            }

            const fields = this.extractFillable(content);
            const relationships = this.extractRelationships(content);

            entities.push({ name, fields, relationships });
        }

        return entities;
    }

    private extractFillable(content: string): string[] {
        const match = content.match(/\$fillable\s*=\s*\[([\s\S]*?)\]/);
        if (!match) {
            return [];
        }

        const fields: string[] = [];
        const regex = /'([^']+)'/g;
        let m;
        while ((m = regex.exec(match[1])) !== null) {
            fields.push(m[1]);
        }
        return fields;
    }

    private extractRelationships(content: string): EntityRelationship[] {
        const relationships: EntityRelationship[] = [];

        const patterns = [
            { regex: /public\s+function\s+(\w+)\(\)[^{]*\{\s*return\s+\$this->hasMany\(\s*(\w+)::class/g, type: 'hasMany' },
            { regex: /public\s+function\s+(\w+)\(\)[^{]*\{\s*return\s+\$this->belongsTo\(\s*(\w+)::class/g, type: 'belongsTo' },
            { regex: /public\s+function\s+(\w+)\(\)[^{]*\{\s*return\s+\$this->hasOne\(\s*(\w+)::class/g, type: 'hasOne' },
            { regex: /public\s+function\s+(\w+)\(\)[^{]*\{\s*return\s+\$this->belongsToMany\(\s*(\w+)::class/g, type: 'belongsToMany' },
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.regex.exec(content)) !== null) {
                relationships.push({
                    type: pattern.type,
                    target: match[2],
                    method: match[1],
                });
            }
        }

        return relationships;
    }
}
