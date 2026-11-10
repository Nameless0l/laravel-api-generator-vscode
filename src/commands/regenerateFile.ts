import * as vscode from 'vscode';
import { LaravelDetector } from '../services/laravelDetector';
import { rebuildEntity } from '../services/entityRebuild';
import { EntityScanner } from '../services/entityScanner';
import { recordedEntities } from '../services/manifest';
import { FlowPanel } from '../webview/flowPanel';
import { pickEntity } from './entityPick';
import { t } from '../i18n';

const REGENERABLE_TYPES: Array<{ kind: string; path: string }> = [
    { kind: 'Model', path: 'app/Models/{Name}.php' },
    { kind: 'Controller', path: 'app/Http/Controllers/{Name}Controller.php' },
    { kind: 'Service', path: 'app/Services/{Name}Service.php' },
    { kind: 'DTO', path: 'app/DTO/{Name}DTO.php' },
    { kind: 'Request', path: 'app/Http/Requests/Store{Name}Request.php, app/Http/Requests/Update{Name}Request.php' },
    { kind: 'Resource', path: 'app/Http/Resources/{Name}Resource.php' },
    { kind: 'Factory', path: 'database/factories/{Name}Factory.php' },
    { kind: 'Seeder', path: 'database/seeders/{Name}Seeder.php' },
    { kind: 'Policy', path: 'app/Policies/{Name}Policy.php' },
    { kind: 'FeatureTest', path: 'tests/Feature/{Name}ControllerTest.php' },
    { kind: 'UnitTest', path: 'tests/Unit/{Name}ServiceTest.php' },
];

export function registerRegenerateFileCommand(extensionUri: vscode.Uri, onDidRegenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.regenerateFile', async (item?: { entityName?: string }) => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        const root = check.root;

        const entityName = await pickEntity(root, item, t('regenerate.pickTitle'));
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
            [...REGENERABLE_TYPES, ...(files.some((file) => file.kind === 'McpTool') ? [{ kind: 'McpTool', path: 'app/Mcp/Tools/{Name}' }] : [])].map((type) => ({
                label: t(`builder.kinds.${type.kind}`),
                description: files.filter((file) => file.kind === type.kind).map((file) => file.path).join(', ') || type.path.split('{Name}').join(entityName),
                fileKind: type.kind,
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
            { kind: 'regenerate', entity: entityName, only: picks.map((pick) => pick.fileKind), rebuilt: rebuilt?.entity },
            onDidRegenerate,
            rebuilt?.options ?? {}
        );
    });
}
