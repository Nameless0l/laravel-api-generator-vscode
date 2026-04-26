import * as vscode from 'vscode';
import { EntityScanner } from './entityScanner';
import { t } from '../i18n';

/**
 * Passive visibility for the generator: a left-aligned status-bar item
 * that shows the entity count and focuses the sidebar tree on click.
 */
export class StatusBarManager {
    private item: vscode.StatusBarItem;
    private scanner: EntityScanner | undefined;

    constructor(workspaceRoot: string | undefined) {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        // Reveal the entities tree view on click
        this.item.command = 'laravelApiGenerator.entities.focus';
        if (workspaceRoot) {
            this.scanner = new EntityScanner(workspaceRoot);
        }
    }

    refresh(): void {
        if (!this.scanner) {
            this.item.hide();
            return;
        }
        const count = this.scanner.scan().length;
        this.item.text = `$(symbol-class) ${t('statusbar.entities', count)}`;
        this.item.tooltip = t('statusbar.tooltip');
        this.item.show();
    }

    dispose(): void {
        this.item.dispose();
    }
}
