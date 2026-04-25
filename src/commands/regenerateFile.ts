import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { ArtisanRunner } from '../services/artisanRunner';
import { MigrationIntrospector } from '../services/migrationIntrospector';
import { EntityTreeItem } from '../providers/entityTreeProvider';

interface RegenerableType {
    label: string;
    description: string;
    artisanType: string;
}

const REGENERABLE_TYPES: RegenerableType[] = [
    { label: 'Model', description: 'app/Models/{Name}.php', artisanType: 'Model' },
    { label: 'Controller', description: 'app/Http/Controllers/{Name}Controller.php', artisanType: 'Controller' },
    { label: 'Service', description: 'app/Services/{Name}Service.php', artisanType: 'Service' },
    { label: 'DTO', description: 'app/DTO/{Name}DTO.php', artisanType: 'DTO' },
    { label: 'Request', description: 'app/Http/Requests/{Name}Request.php', artisanType: 'Request' },
    { label: 'Resource', description: 'app/Http/Resources/{Name}Resource.php', artisanType: 'Resource' },
    { label: 'Factory', description: 'database/factories/{Name}Factory.php', artisanType: 'Factory' },
    { label: 'Seeder', description: 'database/seeders/{Name}Seeder.php', artisanType: 'Seeder' },
    { label: 'Policy', description: 'app/Policies/{Name}Policy.php', artisanType: 'Policy' },
    { label: 'Feature Test', description: 'tests/Feature/{Name}ControllerTest.php', artisanType: 'FeatureTest' },
    { label: 'Unit Test', description: 'tests/Unit/{Name}ServiceTest.php', artisanType: 'UnitTest' },
];

export function registerRegenerateFileCommand(onDidRegenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand(
        'laravelApiGenerator.regenerateFile',
        async (item?: EntityTreeItem) => {
            const check = await LaravelDetector.validateOrPromptInstall();
            if (!check.valid || !check.root) {
                return;
            }

            let entityName = item?.entityName;
            if (!entityName) {
                entityName = await vscode.window.showInputBox({
                    prompt: 'Entity name to regenerate',
                    placeHolder: 'e.g. Article',
                });
            }
            if (!entityName) {
                return;
            }

            const introspector = new MigrationIntrospector(check.root);
            const schema = introspector.introspect(entityName);

            if (!schema) {
                vscode.window.showErrorMessage(
                    `No migration found for "${entityName}". Cannot regenerate without the schema.`
                );
                return;
            }

            if (schema.fields.length === 0) {
                vscode.window.showWarningMessage(
                    `Migration for "${entityName}" was found but no fields could be parsed.`
                );
                return;
            }

            const picks = await vscode.window.showQuickPick(
                REGENERABLE_TYPES.map((t) => ({
                    label: t.label,
                    description: t.description.replace('{Name}', entityName!),
                    artisanType: t.artisanType,
                })),
                {
                    canPickMany: true,
                    placeHolder: `Select files to regenerate for "${entityName}"`,
                    title: 'Regenerate Files',
                }
            );

            if (!picks || picks.length === 0) {
                return;
            }

            const types = picks.map((p) => p.artisanType);
            const fieldsString = schema.fields
                .map((f) => `${f.name}:${f.type}`)
                .join(',');

            const confirm = await vscode.window.showWarningMessage(
                `Regenerate ${picks.length} file(s) for "${entityName}"? Existing files will be overwritten.`,
                { modal: true },
                'Regenerate'
            );

            if (confirm !== 'Regenerate') {
                return;
            }

            const artisan = new ArtisanRunner(check.root);
            const result = await artisan.regenerate(
                entityName,
                types,
                fieldsString,
                schema.softDeletes
            );

            if (result.success) {
                vscode.window.showInformationMessage(
                    `Regenerated ${picks.length} file(s) for "${entityName}".`
                );
                onDidRegenerate();
            } else {
                vscode.window.showErrorMessage(
                    `Failed to regenerate: ${result.errors.join(', ') || result.output}`
                );
            }
        }
    );
}
