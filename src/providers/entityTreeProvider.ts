import * as vscode from 'vscode';
import * as path from 'path';
import { EntityScanner } from '../services/entityScanner';
import { GeneratedEntity, EntityFile } from '../types';

type NodeKind = 'entity' | 'group' | 'file' | 'field' | 'relation' | 'empty';

export class EntityTreeItem extends vscode.TreeItem {
    public readonly kind: NodeKind;
    public readonly entityName?: string;
    public readonly entityFile?: EntityFile;
    public readonly workspaceRoot?: string;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        kind: NodeKind = 'empty',
        opts: {
            entityName?: string;
            entityFile?: EntityFile;
            workspaceRoot?: string;
            description?: string;
            tooltip?: string;
        } = {}
    ) {
        super(label, collapsibleState);
        this.kind = kind;
        this.entityName = opts.entityName;
        this.entityFile = opts.entityFile;
        this.workspaceRoot = opts.workspaceRoot;
        if (opts.description) {
            this.description = opts.description;
        }
        if (opts.tooltip) {
            this.tooltip = opts.tooltip;
        }

        switch (kind) {
            case 'entity':
                this.iconPath = new vscode.ThemeIcon('symbol-class');
                this.contextValue = 'entity';
                break;
            case 'group':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'file':
                if (opts.entityFile && opts.workspaceRoot) {
                    this.iconPath = opts.entityFile.exists
                        ? new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.green'))
                        : new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));
                    this.tooltip = opts.entityFile.path;
                    if (opts.entityFile.exists) {
                        this.command = {
                            command: 'vscode.open',
                            title: 'Open File',
                            arguments: [
                                vscode.Uri.file(path.join(opts.workspaceRoot, opts.entityFile.path)),
                            ],
                        };
                    }
                }
                break;
            case 'field':
                this.iconPath = new vscode.ThemeIcon('symbol-field');
                break;
            case 'relation':
                this.iconPath = new vscode.ThemeIcon('references');
                break;
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
            if (this.entities.length === 0) {
                return [new EntityTreeItem('No entities generated yet', vscode.TreeItemCollapsibleState.None)];
            }
            return this.entities.map(
                (entity) =>
                    new EntityTreeItem(
                        entity.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'entity',
                        { entityName: entity.name }
                    )
            );
        }

        // Entity level: show 3 collapsible groups (Files, Fields, Relations)
        if (element.kind === 'entity' && element.entityName) {
            const entity = this.entities.find((e) => e.name === element.entityName);
            if (!entity) {
                return [];
            }

            const groups: EntityTreeItem[] = [
                new EntityTreeItem(
                    `Files (${entity.files.filter((f) => f.exists).length}/${entity.files.length})`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'group',
                    { entityName: `${entity.name}::files` }
                ),
            ];

            if (entity.fields && entity.fields.length > 0) {
                groups.push(
                    new EntityTreeItem(
                        `Fields (${entity.fields.length})`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'group',
                        { entityName: `${entity.name}::fields` }
                    )
                );
            }

            if (entity.relations && entity.relations.length > 0) {
                groups.push(
                    new EntityTreeItem(
                        `Relations (${entity.relations.length})`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'group',
                        { entityName: `${entity.name}::relations` }
                    )
                );
            }

            return groups;
        }

        // Group level: show items inside the group
        if (element.kind === 'group' && element.entityName) {
            const [name, group] = element.entityName.split('::');
            const entity = this.entities.find((e) => e.name === name);
            if (!entity) {
                return [];
            }

            if (group === 'files') {
                return entity.files.map(
                    (file) =>
                        new EntityTreeItem(
                            `${file.type} ${file.exists ? '✓' : '✗'}`,
                            vscode.TreeItemCollapsibleState.None,
                            'file',
                            {
                                entityName: name,
                                entityFile: file,
                                workspaceRoot: this.workspaceRoot,
                            }
                        )
                );
            }

            if (group === 'fields' && entity.fields) {
                return entity.fields.map(
                    (field) =>
                        new EntityTreeItem(
                            field,
                            vscode.TreeItemCollapsibleState.None,
                            'field',
                            { entityName: name, tooltip: `${name}.${field}` }
                        )
                );
            }

            if (group === 'relations' && entity.relations) {
                return entity.relations.map(
                    (rel) =>
                        new EntityTreeItem(
                            rel.name,
                            vscode.TreeItemCollapsibleState.None,
                            'relation',
                            {
                                entityName: name,
                                description: `${rel.type} → ${rel.target}`,
                                tooltip: `public function ${rel.name}(): ${rel.type}\n→ ${rel.target}`,
                            }
                        )
                );
            }
        }

        return [];
    }
}
