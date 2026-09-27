import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { entityOfFile } from '../services/entityOfFile';

function project(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-related-'));
    for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), content);
    }
    return root;
}

function at(root: string, file: string): string {
    return path.join(root, ...file.split('/'));
}

test('the manifest tells which entity a file belongs to', () => {
    const migration = 'database/migrations/2026_01_01_000000_create_posts_table.php';
    const manifest = { version: 1, files: { [migration]: { entity: 'Post', kind: 'Migration', hash: 'x' } } };
    const root = project({ '.api-generator/manifest.json': JSON.stringify(manifest) });

    assert.equal(entityOfFile(root, at(root, migration)), 'Post');
});

test('Store and Update requests point to their entity, a 3.x request whose name starts the same way too', () => {
    const root = project({ 'app/Models/Post.php': '<?php', 'app/Models/Storefront.php': '<?php' });

    assert.equal(entityOfFile(root, at(root, 'app/Http/Requests/StorePostRequest.php')), 'Post');
    assert.equal(entityOfFile(root, at(root, 'app/Http/Requests/UpdatePostRequest.php')), 'Post');
    assert.equal(entityOfFile(root, at(root, 'app/Http/Requests/StorefrontRequest.php')), 'Storefront');
    assert.equal(entityOfFile(root, at(root, 'app/Http/Requests/LoginRequest.php')), undefined);
});

test('an enum points to the model that uses it', () => {
    const root = project({ 'app/Models/Post.php': "<?php\nuse App\\Enums\\PostStatus;\n", 'app/Models/Tag.php': '<?php' });

    assert.equal(entityOfFile(root, at(root, 'app/Enums/PostStatus.php')), 'Post');
    assert.equal(entityOfFile(root, at(root, 'app/Enums/Unused.php')), undefined);
});

test('models, controllers, tests and the other generated files keep their conventional names', () => {
    const root = project({});

    assert.equal(entityOfFile(root, at(root, 'app/Models/Post.php')), 'Post');
    assert.equal(entityOfFile(root, at(root, 'tests/Feature/PostControllerTest.php')), 'Post');
    assert.equal(entityOfFile(root, at(root, 'app/Http/Controllers/PostController.php')), 'Post');
    assert.equal(entityOfFile(root, at(root, 'app/DTO/PostDTO.php')), 'Post');
    assert.equal(entityOfFile(root, at(root, 'app/Http/Controllers/Controller.php')), undefined);
});
