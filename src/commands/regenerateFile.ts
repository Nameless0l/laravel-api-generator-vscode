import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { rebuildEntity } from '../services/entityRebuild';
import { EntityScanner } from '../services/entityScanner';
import { recordedEntities } from '../services/manifest';
import { EntityTreeItem } from '../providers/entityTreeProvider';
import { FlowPanel } from '../webview/flowPanel';
import { t } from '../i18n';

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
    { label: 'Requests', description: 'app/Http/Requests/Store{Name}Request.php, app/Http/Requests/Update{Name}Request.php', artisanType: 'Request' },
    { label: 'Resource', description: 'app/Http/Resources/{Name}Resource.php', artisanType: 'Resource' },
    { label: 'Factory', description: 'database/factories/{Name}Factory.php', artisanType: 'Factory' },
    { label: 'Seeder', description: 'database/seeders/{Name}Seeder.php', artisanType: 'Seeder' },
    { label: 'Policy', description: 'app/Policies/{Name}Policy.php', artisanType: 'Policy' },
    { label: 'Feature Test', description: 'tests/Feature/{Name}ControllerTest.php', artisanType: 'FeatureTest' },
    { label: 'Unit Test', description: 'tests/Unit/{Name}ServiceTest.php', artisanType: 'UnitTest' },
];

export function registerRegenerateFileCommand(extensionUri: vscode.Uri, onDidRegenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.regenerateFile', async (item?: EntityTreeItem) => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        const root = check.root;

        const entityName =
            item?.entityName ??
            (await vscode.window.showInputBox({
                prompt: t('regenerate.promptName'),
                placeHolder: 'e.g. Article',
            }));
        if (!entityName) {
            return;
        }

        const recorded = recordedEntities(root).has(entityName);
        const rebuilt = recorded ? undefined : rebuildEntity(root, entityName);
        if (!recorded && !rebuilt) {
            vscode.window.showErrorMessage(t('regenerate.noDefinition', entityName));
            return;
        }

        const files = new EntityScanner(root).getEntityFiles(entityName);
        const picks = await vscode.window.showQuickPick(
            REGENERABLE_TYPES.map((rt) => ({
                label: rt.label,
                description:
                    files.filter((file) => file.kind === rt.artisanType).map((file) => file.path).join(', ') ||
                    rt.description.split('{Name}').join(entityName),
                artisanType: rt.artisanType,
            })),
            {
                canPickMany: true,
                placeHolder: t('regenerate.pickPlaceholder', entityName),
                title: t('regenerate.pickTitle'),
            }
        );
        if (!picks || picks.length === 0) {
            return;
        }

        FlowPanel.plan(
            extensionUri,
            root,
            { kind: 'regenerate', entity: entityName, only: picks.map((pick) => pick.artisanType), rebuilt: rebuilt?.entity },
            onDidRegenerate,
            rebuilt?.options ?? {}
        );
    });
}
