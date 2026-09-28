import * as vscode from 'vscode';
import * as path from 'path';
import { EntityScanner } from '../services/entityScanner';
import { GeneratedEntity, EntityFile } from '../types';
import { t, tn } from '../i18n';

type NodeKind = 'entity' | 'group' | 'file' | 'field' | 'relation' | 'empty';

const DECORATION_SCHEME = 'laravel-api-generator';

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
            tooltip?: string | vscode.MarkdownString;
            edited?: boolean;
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
                this.iconPath = new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('symbolIcon.classForeground'));
                this.contextValue = 'entity';
                this.resourceUri = decorationUri('entity', opts.entityName ?? label);
                break;
            case 'group':
                this.iconPath = new vscode.ThemeIcon(
                    opts.entityName?.endsWith('::fields') ? 'symbol-field' : opts.entityName?.endsWith('::relations') ? 'references' : 'files'
                );
                break;
            case 'file':
                if (opts.entityFile && opts.workspaceRoot) {
                    this.iconPath = opts.entityFile.exists
                        ? new vscode.ThemeIcon('file-code', opts.edited ? new vscode.ThemeColor('list.warningForeground') : undefined)
                        : new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('list.errorForeground'));
                    this.resourceUri = decorationUri('file', opts.entityFile.path);
                    if (!opts.tooltip) {
                        this.tooltip = opts.entityFile.path;
                    }
                    if (opts.entityFile.exists) {
                        this.command = {
                            command: 'vscode.open',
                            title: 'Open File',
                            arguments: [vscode.Uri.file(path.join(opts.workspaceRoot, opts.entityFile.path))],
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

function decorationUri(kind: 'entity' | 'file', id: string): vscode.Uri {
    return vscode.Uri.from({ scheme: DECORATION_SCHEME, path: `/${kind}/${id}` });
}

/** Colors the entities and files edited by hand, with the count as a badge on the entity. */
export class EntityDecorations implements vscode.FileDecorationProvider {
    private readonly changed = new vscode.EventEmitter<undefined>();
    readonly onDidChangeFileDecorations = this.changed.event;
    private editedByEntity = new Map<string, string[]>();
    private editedFiles = new Set<string>();

    update(entities: GeneratedEntity[]): void {
        this.editedByEntity = new Map(entities.filter((entity) => (entity.edited ?? []).length > 0).map((entity) => [entity.name, entity.edited ?? []]));
        this.editedFiles = new Set(entities.flatMap((entity) => entity.edited ?? []));
        this.changed.fire(undefined);
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (uri.scheme !== DECORATION_SCHEME) {
            return undefined;
        }
        const [, kind, ...rest] = uri.path.split('/');
        const id = rest.join('/');
        if (kind === 'entity') {
            const edited = this.editedByEntity.get(id);
            return edited ? new vscode.FileDecoration(String(Math.min(edited.length, 99)), undefined, new vscode.ThemeColor('list.warningForeground')) : undefined;
        }
        if (kind === 'file' && this.editedFiles.has(id)) {
            return new vscode.FileDecoration(undefined, undefined, new vscode.ThemeColor('list.warningForeground'));
        }
        return undefined;
    }

    dispose(): void {
        this.changed.dispose();
    }
}

export class EntityTreeProvider implements vscode.TreeDataProvider<EntityTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<EntityTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private scanner: EntityScanner;
    private entities: GeneratedEntity[] = [];

    constructor(
        private workspaceRoot: string,
        private readonly decorations?: EntityDecorations
    ) {
        this.scanner = new EntityScanner(workspaceRoot);
        this.refresh();
    }

    refresh(): void {
        this.entities = this.scanner.scan();
        this.decorations?.update(this.entities);
        this._onDidChangeTreeData.fire();
    }

    getEntities(): GeneratedEntity[] {
        return this.entities;
    }

    getTreeItem(element: EntityTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: EntityTreeItem): EntityTreeItem[] {
        if (!element) {
            if (this.entities.length === 0) {
                return [new EntityTreeItem(t('tree.empty'), vscode.TreeItemCollapsibleState.None)];
            }
            return this.entities.map((entity) => this.entityItem(entity));
        }

        if (element.kind === 'entity' && element.entityName) {
            const entity = this.entities.find((e) => e.name === element.entityName);
            if (!entity) {
                return [];
            }

            const existing = entity.files.filter((f) => f.exists).length;
            const groups: EntityTreeItem[] = [
                new EntityTreeItem(t('tree.files'), vscode.TreeItemCollapsibleState.Collapsed, 'group', {
                    entityName: `${entity.name}::files`,
                    description: existing === entity.files.length ? String(existing) : t('tree.someMissing', existing, entity.files.length),
                }),
            ];

            if (entity.fields && entity.fields.length > 0) {
                groups.push(
                    new EntityTreeItem(t('tree.fields'), vscode.TreeItemCollapsibleState.Collapsed, 'group', {
                        entityName: `${entity.name}::fields`,
                        description: String(entity.fields.length),
                    })
                );
            }

            if (entity.relations && entity.relations.length > 0) {
                groups.push(
                    new EntityTreeItem(t('tree.relations'), vscode.TreeItemCollapsibleState.Collapsed, 'group', {
                        entityName: `${entity.name}::relations`,
                        description: String(entity.relations.length),
                    })
                );
            }

            return groups;
        }

        if (element.kind === 'group' && element.entityName) {
            const [name, group] = element.entityName.split('::');
            const entity = this.entities.find((e) => e.name === name);
            if (!entity) {
                return [];
            }

            if (group === 'files') {
                const edited = new Set(entity.edited ?? []);
                return entity.files.map((file) => {
                    const isEdited = edited.has(file.path);
                    const status = !file.exists ? t('tree.missing') : isEdited ? t('tree.edited') : '';
                    return new EntityTreeItem(file.type, vscode.TreeItemCollapsibleState.None, 'file', {
                        entityName: name,
                        entityFile: file,
                        workspaceRoot: this.workspaceRoot,
                        description: status ? `${path.basename(file.path)} · ${status}` : path.basename(file.path),
                        tooltip: isEdited ? `${file.path}\n${t('tree.editedTooltip')}` : undefined,
                        edited: isEdited,
                    });
                });
            }

            if (group === 'fields' && entity.fields) {
                return entity.fields.map(
                    (field) =>
                        new EntityTreeItem(field, vscode.TreeItemCollapsibleState.None, 'field', {
                            entityName: name,
                            tooltip: `${name}.${field}`,
                        })
                );
            }

            if (group === 'relations' && entity.relations) {
                return entity.relations.map(
                    (rel) =>
                        new EntityTreeItem(rel.name, vscode.TreeItemCollapsibleState.None, 'relation', {
                            entityName: name,
                            description: `${rel.type} → ${rel.target}`,
                            tooltip: `public function ${rel.name}(): ${rel.type}\n→ ${rel.target}`,
                        })
                );
            }
        }

        return [];
    }

    private entityItem(entity: GeneratedEntity): EntityTreeItem {
        const existing = entity.files.filter((f) => f.exists).length;
        const edited = entity.edited ?? [];
        const description = [tn('tree.filesCount', existing), ...(edited.length > 0 ? [tn('tree.editedCount', edited.length)] : [])].join(', ');
        const tooltip = new vscode.MarkdownString(
            [`**${entity.name}**`, description, ...(edited.length > 0 ? ['', t('tree.editedTooltip'), '', ...edited.map((file) => `- \`${file}\``)] : [])].join('\n')
        );
        return new EntityTreeItem(entity.name, vscode.TreeItemCollapsibleState.Collapsed, 'entity', {
            entityName: entity.name,
            description,
            tooltip,
        });
    }
}
