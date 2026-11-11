import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { deletePlanFromFiles, parseDeleteDryRun } from '../services/deletePlan';

const DRY_RUN = [
    'Dry run, nothing was deleted. Deleting Post would remove:',
    '  delete    app/Models/Post.php',
    '  delete    app/Http/Controllers/PostController.php',
    '  delete    database/migrations/2026_01_01_000000_create_posts_table.php',
    '  update    routes/api.php and DatabaseSeeder.php (the Post entries)',
    '  ! app/Models/Post.php was edited by hand since it was generated.',
    '',
].join('\r\n');

test('the dry run lists the files to remove and calls out the edited ones', () => {
    assert.deepEqual(parseDeleteDryRun(DRY_RUN), {
        files: [
            { path: 'app/Models/Post.php', edited: true },
            { path: 'app/Http/Controllers/PostController.php', edited: false },
            { path: 'database/migrations/2026_01_01_000000_create_posts_table.php', edited: false },
        ],
        sharedEntries: true,
        mcpTools: false,
    });
});

test('the dry run says when MCP tools leave the server', () => {
    const plan = parseDeleteDryRun(
        [
            'Dry run, nothing was deleted. Deleting Post would remove:',
            '  delete    app/Mcp/Tools/Post/ListPostsTool.php',
            '  update    routes/api.php and DatabaseSeeder.php (the Post entries)',
            '  update    app/Mcp/Servers/ApiServer.php (the Post tools)',
        ].join('\n')
    );

    assert.deepEqual(plan, { files: [{ path: 'app/Mcp/Tools/Post/ListPostsTool.php', edited: false }], sharedEntries: true, mcpTools: true });
});

test('an output that is not a dry run is not read as one', () => {
    assert.equal(parseDeleteDryRun('The "--dry-run" option does not exist.'), null);
    assert.equal(parseDeleteDryRun('  delete    app/Models/Post.php'), null);
    assert.deepEqual(parseDeleteDryRun('Dry run, nothing was deleted. Deleting Tag would remove:\n'), { files: [], sharedEntries: false, mcpTools: false });
});

test('the scanned files stand in for a dry run that cannot be read', () => {
    const plan = deletePlanFromFiles(
        [
            { type: 'Model', path: 'app/Models/Post.php', exists: true },
            { type: 'Policy', path: 'app/Policies/PostPolicy.php', exists: false },
            { type: 'Service', path: 'app/Services/PostService.php', exists: true },
            { type: 'MCP Tool', kind: 'McpTool', path: 'app/Mcp/Tools/Post/ShowPostTool.php', exists: true },
        ],
        ['app/Services/PostService.php']
    );

    assert.deepEqual(plan.files, [
        { path: 'app/Models/Post.php', edited: false },
        { path: 'app/Services/PostService.php', edited: true },
        { path: 'app/Mcp/Tools/Post/ShowPostTool.php', edited: false },
    ]);
    assert.equal(plan.sharedEntries, true);
    assert.equal(plan.mcpTools, true);
});
