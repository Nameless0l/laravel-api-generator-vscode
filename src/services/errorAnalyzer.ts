import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { t } from '../i18n';
import { ProtocolMessage } from '../types';
import { MANIFEST_PATH } from './manifest';
import { outputChannel } from './outputLog';
import { requirePackageCommand } from './packageState';

export interface ErrorAction {
    label: string;
    /** When run, perform this side effect. Returning a string shows it as the new output. */
    run: (workspaceRoot: string) => Promise<string | void> | string | void;
}

export interface ErrorSuggestion {
    /** Short, friendly summary of what likely went wrong. */
    diagnosis: string;
    /** Buttons to surface in the warning notification. */
    actions: ErrorAction[];
}

interface Pattern {
    /** Action context this pattern applies to (e.g. 'migrate', 'test', 'generate'). Empty = any. */
    contexts?: string[];
    /** RegExp matched against the artisan output. */
    match: RegExp;
    build: () => ErrorSuggestion;
}

const openFile = (relPath: string): ErrorAction => ({
    label: t('diagnosis.openFile', path.basename(relPath)),
    run: async (root) => {
        const full = path.join(root, relPath);
        if (!fs.existsSync(full)) {
            vscode.window.showWarningMessage(t('diagnosis.missingFile', relPath));
            return;
        }
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(full));
        await vscode.window.showTextDocument(doc);
    },
});

const runInTerminal = (label: string, command: string | ((root: string) => string)): ErrorAction => ({
    label,
    run: (root) => {
        const term = vscode.window.createTerminal({ name: 'Laravel API Generator', cwd: root });
        term.sendText(typeof command === 'string' ? command : command(root));
        term.show();
    },
});

const showOutput = (label = t('diagnosis.showOutput')): ErrorAction => ({
    label,
    run: () => outputChannel().show(true),
});

export function createSqliteFile(root: string): string {
    const file = path.join(root, 'database', 'database.sqlite');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.closeSync(fs.openSync(file, 'a'));
    return file;
}

const createSqlite = (): ErrorAction => ({
    label: t('diagnosis.createSqlite'),
    run: (root) => {
        try {
            createSqliteFile(root);
            vscode.window.showInformationMessage(t('diagnosis.sqliteCreated'));
        } catch (e: unknown) {
            vscode.window.showErrorMessage(t('diagnosis.sqliteFailed', e instanceof Error ? e.message : String(e)));
        }
    },
});

const PATTERNS: Pattern[] = [
    // ---- Database connection / driver ----
    {
        match: /SQLSTATE\[HY000\] \[2002\]|Connection refused|getaddrinfo failed/i,
        build: () => ({
            diagnosis: t('diagnosis.dbUnreachable'),
            actions: [openFile('.env'), showOutput()],
        }),
    },
    {
        match: /SQLSTATE\[HY000\] \[1045\]|Access denied for user/i,
        build: () => ({
            diagnosis: t('diagnosis.dbCredentials'),
            actions: [openFile('.env'), showOutput()],
        }),
    },
    {
        match: /could not find driver|PDOException.*driver/i,
        build: () => ({
            diagnosis: t('diagnosis.dbDriver'),
            actions: [openFile('.env'), showOutput()],
        }),
    },
    {
        match: /Database file (.+) does not exist|database file does not exist/i,
        build: () => ({
            diagnosis: t('diagnosis.sqliteMissing'),
            actions: [createSqlite(), openFile('.env')],
        }),
    },
    {
        match: /Unknown database|Database \[.+?\] not configured/i,
        build: () => ({
            diagnosis: t('diagnosis.dbUnknown'),
            actions: [openFile('.env'), showOutput()],
        }),
    },

    // ---- Composer / autoload ----
    {
        match: /Class ".+" not found|Target class \[.+\] does not exist/i,
        build: () => ({
            diagnosis: t('diagnosis.classMissing'),
            actions: [
                runInTerminal('composer dump-autoload', 'composer dump-autoload'),
                showOutput(),
            ],
        }),
    },
    {
        match: /Could not open input file: artisan/i,
        build: () => ({
            diagnosis: t('diagnosis.noArtisan'),
            actions: [showOutput()],
        }),
    },

    // ---- Migration-specific ----
    {
        match: /Migration table not found|Base table or view not found.*migrations/i,
        contexts: ['migrate', 'seed', 'test'],
        build: () => ({
            diagnosis: t('diagnosis.migrationsTableMissing'),
            actions: [
                runInTerminal('php artisan migrate:install', 'php artisan migrate:install'),
                showOutput(),
            ],
        }),
    },
    {
        match: /Table .+ already exists|already exists \(SQL/i,
        contexts: ['migrate', 'generate'],
        build: () => ({
            diagnosis: t('diagnosis.tableExists'),
            actions: [
                runInTerminal('php artisan migrate:fresh', 'php artisan migrate:fresh'),
                showOutput(),
            ],
        }),
    },
    {
        match: /Nothing to migrate/i,
        contexts: ['migrate'],
        build: () => ({
            diagnosis: t('diagnosis.nothingToMigrate'),
            actions: [showOutput()],
        }),
    },

    // ---- Tests ----
    {
        match: /FAIL(URES|ED)|Tests:.*failed|Failed asserting/i,
        contexts: ['test'],
        build: () => ({
            diagnosis: t('diagnosis.testsFailed'),
            actions: [showOutput(t('diagnosis.showTestOutput'))],
        }),
    },
    {
        match: /No tests executed/i,
        contexts: ['test'],
        build: () => ({
            diagnosis: t('diagnosis.noTests'),
            actions: [showOutput()],
        }),
    },

    // ---- Generator-specific ----
    {
        match: /option does not exist/i,
        contexts: ['generate'],
        build: () => ({
            diagnosis: t('sources.packageTooOld'),
            actions: [runInTerminal(t('sources.updatePackage'), 'composer update nameless/laravel-api-generator -W')],
        }),
    },
    {
        match: /Command "?make:fullapi"? is not defined|There are no commands defined in the "make:fullapi"/i,
        contexts: ['generate'],
        build: () => ({
            diagnosis: t('diagnosis.packageMissing'),
            actions: [runInTerminal(t('package.installViaComposer'), requirePackageCommand)],
        }),
    },
    {
        match: /stub.*missing|Missing required placeholder/i,
        contexts: ['generate'],
        build: () => ({
            diagnosis: t('diagnosis.stubPlaceholders'),
            actions: [
                {
                    label: t('generate.openStubsFolder'),
                    run: async (root) => {
                        await vscode.commands.executeCommand(
                            'revealInExplorer',
                            vscode.Uri.file(path.join(root, 'stubs', 'vendor', 'laravel-api-generator'))
                        );
                    },
                },
            ],
        }),
    },

    // ---- Permissions ----
    {
        match: /Permission denied|EACCES/i,
        build: () => ({
            diagnosis: t('diagnosis.permission'),
            actions: [showOutput()],
        }),
    },
];

/**
 * Inspect command output and return a friendly diagnosis with one-click actions,
 * or null if no pattern matched.
 */
export function analyzeError(action: string, output: string): ErrorSuggestion | null {
    if (!output) {
        return null;
    }
    for (const pattern of PATTERNS) {
        if (pattern.contexts && !pattern.contexts.includes(action)) {
            continue;
        }
        if (pattern.match.test(output)) {
            return pattern.build();
        }
    }
    return null;
}

const CODE_SUGGESTIONS: Record<string, () => ErrorSuggestion> = {
    write_failed: () => ({ diagnosis: t('errors.writeFailed'), actions: [showOutput()] }),
    invalid_manifest: () => ({ diagnosis: t('errors.invalidManifest'), actions: [openFile(MANIFEST_PATH)] }),
};

/**
 * The same, from the error codes of the package's JSON document. The package
 * cannot classify an unexpected error, so its message still goes through the
 * patterns above (a database that refuses the connection, for instance).
 */
export function analyzeProtocolErrors(errors: ProtocolMessage[]): ErrorSuggestion | null {
    for (const error of errors) {
        const suggestion = CODE_SUGGESTIONS[error.code]?.() ?? (error.code === 'unexpected_error' ? analyzeError('generate', error.message) : null);
        if (suggestion) {
            return suggestion;
        }
    }
    return null;
}

/**
 * Show a warning notification with action buttons; performs the user's choice.
 */
export async function presentSuggestion(
    workspaceRoot: string,
    suggestion: ErrorSuggestion
): Promise<void> {
    const labels = suggestion.actions.map((a) => a.label);
    const choice = await vscode.window.showWarningMessage(suggestion.diagnosis, ...labels);
    if (!choice) {
        return;
    }
    const action = suggestion.actions.find((a) => a.label === choice);
    if (action) {
        await action.run(workspaceRoot);
    }
}
