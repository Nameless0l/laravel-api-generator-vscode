export type DraftKind = 'builder' | 'describe' | 'edit';

export interface DraftMemento {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

type Drafts = Record<string, Partial<Record<DraftKind, unknown>>>;

const KEY = 'laravelApiGenerator.drafts';

export class DraftStore {
    constructor(private readonly memento: DraftMemento) {}

    read<T>(kind: DraftKind, root: string): T | undefined {
        return this.memento.get<Drafts>(KEY, {})[root]?.[kind] as T | undefined;
    }

    write(kind: DraftKind, root: string, draft: unknown): void {
        const all = { ...this.memento.get<Drafts>(KEY, {}) };
        const project = { ...all[root] };
        if (draft === undefined || draft === null) {
            delete project[kind];
        } else {
            project[kind] = draft;
        }
        if (Object.keys(project).length === 0) {
            delete all[root];
        } else {
            all[root] = project;
        }
        void this.memento.update(KEY, all);
    }

    writeEntry(kind: DraftKind, root: string, key: string, value: unknown): void {
        const entries = { ...(this.read<Record<string, unknown>>(kind, root) ?? {}) };
        if (value === undefined || value === null) {
            delete entries[key];
        } else {
            entries[key] = value;
        }
        this.write(kind, root, Object.keys(entries).length > 0 ? entries : undefined);
    }

    clear(kind: DraftKind, root: string): void {
        this.write(kind, root, undefined);
    }
}
