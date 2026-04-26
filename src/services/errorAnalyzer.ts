import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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
    label: `Open ${path.basename(relPath)}`,
    run: async (root) => {
        const full = path.join(root, relPath);
        if (!fs.existsSync(full)) {
            vscode.window.showWarningMessage(`${relPath} does not exist.`);
            return;
        }
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(full));
        await vscode.window.showTextDocument(doc);
    },
});

const runInTerminal = (label: string, command: string): ErrorAction => ({
    label,
    run: (root) => {
        const term = vscode.window.createTerminal({ name: 'Laravel API Generator', cwd: root });
        term.sendText(command);
        term.show();
    },
});

const showOutput = (label = 'Show Full Output'): ErrorAction => ({
    label,
    run: () => {
        // The webview already has the output; this just reminds the user it's there.
        vscode.window.showInformationMessage('See the output panel below the form for full details.');
    },
});

const PATTERNS: Pattern[] = [
    // ---- Database connection / driver ----
    {
        match: /SQLSTATE\[HY000\] \[2002\]|Connection refused|getaddrinfo failed/i,
        build: () => ({
            diagnosis: 'Cannot reach the database server. Check that it is running and that your .env credentials are correct.',
            actions: [openFile('.env'), showOutput()],
        }),
    },
    {
        match: /SQLSTATE\[HY000\] \[1045\]|Access denied for user/i,
        build: () => ({
            diagnosis: 'The database refused your credentials (wrong DB_USERNAME / DB_PASSWORD).',
            actions: [openFile('.env'), showOutput()],
        }),
    },
    {
        match: /could not find driver|PDOException.*driver/i,
        build: () => ({
            diagnosis: 'PHP is missing the database driver extension (e.g. pdo_mysql, pdo_sqlite, pdo_pgsql).',
            actions: [openFile('.env'), showOutput()],
        }),
    },
    {
        match: /Database file (.+) does not exist|database file does not exist/i,
        build: () => ({
            diagnosis: 'The SQLite database file does not exist. Touch it and re-run.',
            actions: [
                runInTerminal('Create database/database.sqlite', 'type nul > database\\database.sqlite'),
                openFile('.env'),
            ],
        }),
    },
    {
        match: /Unknown database|Database \[.+?\] not configured/i,
        build: () => ({
            diagnosis: 'The database itself does not exist. Create it first, then re-run migrations.',
            actions: [openFile('.env'), showOutput()],
        }),
    },

    // ---- Composer / autoload ----
    {
        match: /Class ".+" not found|Target class \[.+\] does not exist/i,
        build: () => ({
            diagnosis: 'A class is missing from the autoloader. Refresh composer and try again.',
            actions: [
                runInTerminal('composer dump-autoload', 'composer dump-autoload'),
                showOutput(),
            ],
        }),
    },
    {
        match: /Could not open input file: artisan/i,
        build: () => ({
            diagnosis: 'No artisan file found in the workspace root. Open a Laravel project folder and try again.',
            actions: [showOutput()],
        }),
    },

    // ---- Migration-specific ----
    {
        match: /Migration table not found|Base table or view not found.*migrations/i,
        contexts: ['migrate', 'seed', 'test'],
        build: () => ({
            diagnosis: 'The migrations table is missing — your database has never been initialized.',
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
            diagnosis: 'A table from a previous run is still in the database. Reset it with migrate:fresh.',
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
            diagnosis: 'No pending migrations were found. Generate a new entity to add one.',
            actions: [showOutput()],
        }),
    },

    // ---- Tests ----
    {
        match: /FAIL(URES|ED)|Tests:.*failed|Failed asserting/i,
        contexts: ['test'],
        build: () => ({
            diagnosis: 'Some tests failed. Review the test output for details.',
            actions: [showOutput('Show Test Output')],
        }),
    },
    {
        match: /No tests executed/i,
        contexts: ['test'],
        build: () => ({
            diagnosis: 'No tests were executed. Generate an entity to create test files.',
            actions: [showOutput()],
        }),
    },

    // ---- Generator-specific ----
    {
        match: /Command "?make:fullapi"? is not defined|There are no commands defined in the "make:fullapi"/i,
        contexts: ['generate'],
        build: () => ({
            diagnosis: 'The laravel-api-generator package is not installed in this project.',
            actions: [
                runInTerminal('composer require nameless/laravel-api-generator', 'composer require nameless/laravel-api-generator'),
            ],
        }),
    },
    {
        match: /stub.*missing|Missing required placeholder/i,
        contexts: ['generate'],
        build: () => ({
            diagnosis: 'A customized stub is missing required placeholders.',
            actions: [
                {
                    label: 'Open Stubs Folder',
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
            diagnosis: 'A file or directory could not be written. Check filesystem permissions.',
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
