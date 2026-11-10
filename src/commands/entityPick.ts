import * as vscode from 'vscode';
import { EntityScanner } from '../services/entityScanner';
import { entitySummary } from '../services/entitySummary';
import { t } from '../i18n';

export async function pickEntity(root: string, item: { entityName?: string } | undefined, title: string): Promise<string | undefined> {
    if (typeof item?.entityName === 'string' && item.entityName !== '') {
        return item.entityName;
    }

    const entities = new EntityScanner(root).scan();
    if (entities.length === 0) {
        vscode.window.showInformationMessage(t('entity.none'));
        return undefined;
    }

    const pick = await vscode.window.showQuickPick(
        entities.map((entity) => ({ label: entity.name, description: entitySummary(entity) })),
        { title, placeHolder: t('entity.pickPlaceholder'), matchOnDescription: true }
    );
    return pick?.label;
}
