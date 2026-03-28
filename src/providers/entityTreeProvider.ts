import * as vscode from 'vscode';
import * as path from 'path';
import { EntityScanner } from '../services/entityScanner';
import { GeneratedEntity, EntityFile } from '../types';

export class EntityTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly entityName?: string,
        public readonly entityFile?: EntityFile,
        public readonly workspaceRoot?: string
    ) {
        super(label, collapsibleState);

        if (entityFile && workspaceRoot) {
            // File item
            this.iconPath = entityFile.exists
                ? new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.green'))
                : new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));
            this.tooltip = entityFile.path;

            if (entityFile.exists) {
                this.command = {
                    command: 'vscode.open',
                    title: 'Open File',
                    arguments: [vscode.Uri.file(path.join(workspaceRoot, entityFile.path))],
                };
            }
        } else {
            // Entity item
            this.iconPath = new vscode.ThemeIcon('symbol-class');
            this.contextValue = 'entity';
        }
    }
}

export class EntityTreeProvider implements vscode.TreeDataProvider<EntityTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<EntityTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private scanner: EntityScanner;
    private entities: GeneratedEntity[] = [];

    constructor(private workspaceRoot: string) {
        this.scanner = new EntityScanner(workspaceRoot);
        this.refresh();
    }

    refresh(): void {
        this.entities = this.scanner.scan();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: EntityTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: EntityTreeItem): EntityTreeItem[] {
        if (!element) {
            // Root level: show entities
            if (this.entities.length === 0) {
                return [
                    new EntityTreeItem(
                        'No entities generated yet',
                        vscode.TreeItemCollapsibleState.None
                    ),
                ];
            }
            return this.entities.map(
                (entity) =>
                    new EntityTreeItem(
                        entity.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        entity.name
                    )
            );
        }

        // Child level: show files for entity
        const entity = this.entities.find((e) => e.name === element.entityName);
        if (!entity) {
            return [];
        }

        return entity.files.map(
            (file) =>
                new EntityTreeItem(
                    `${file.type} ${file.exists ? '✓' : '✗'}`,
                    vscode.TreeItemCollapsibleState.None,
                    entity.name,
                    file,
                    this.workspaceRoot
                )
        );
    }
}
