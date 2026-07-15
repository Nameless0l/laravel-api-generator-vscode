import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EntityScanner } from '../services/entityScanner';

function makeWorkspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-scanner-'));
    for (const dir of [
        'app/Models',
        'app/Http/Controllers',
        'app/Services',
        'database/migrations',
    ]) {
        fs.mkdirSync(path.join(root, dir), { recursive: true });
    }
    return root;
}

function addEntity(root: string, name: string, modelContent?: string): void {
    fs.writeFileSync(
        path.join(root, 'app/Models', `${name}.php`),
        modelContent ?? `<?php\nclass ${name} extends Model {}\n`
    );
    fs.writeFileSync(
        path.join(root, 'app/Http/Controllers', `${name}Controller.php`),
        '<?php\n'
    );
    fs.writeFileSync(path.join(root, 'app/Services', `${name}Service.php`), '<?php\n');
}

test('scan returns empty array when app/Models is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-empty-'));
    const scanner = new EntityScanner(root);
    assert.deepEqual(scanner.scan(), []);
});

test('a model without Controller + Service is not a generated entity', () => {
    const root = makeWorkspace();
    // Laravel's default User model: no controller, no service
    fs.writeFileSync(path.join(root, 'app/Models/User.php'), '<?php\nclass User {}\n');
    const scanner = new EntityScanner(root);
    assert.deepEqual(scanner.scan(), []);
});

test('a generated entity is detected with its files', () => {
    const root = makeWorkspace();
    addEntity(root, 'Book');
    const scanner = new EntityScanner(root);
    const entities = scanner.scan();
    assert.equal(entities.length, 1);
    assert.equal(entities[0].name, 'Book');
    const controller = entities[0].files.find((f) => f.type === 'Controller');
    assert.ok(controller?.exists);
});

test('a generated User API is included (regression: was filtered out)', () => {
    const root = makeWorkspace();
    addEntity(root, 'User');
    const scanner = new EntityScanner(root);
    const entities = scanner.scan();
    assert.deepEqual(
        entities.map((e) => e.name),
        ['User']
    );
});

test('fillable fields and relationships are parsed from the model', () => {
    const root = makeWorkspace();
    addEntity(
        root,
        'Book',
        `<?php
class Book extends Model
{
    protected $fillable = ['title', 'price'];

    public function author(): BelongsTo
    {
        return $this->belongsTo(Author::class);
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(App\\Models\\Tag::class);
    }
}
`
    );
    const scanner = new EntityScanner(root);
    const book = scanner.scan()[0];
    assert.deepEqual(book.fields, ['title', 'price']);
    assert.deepEqual(book.relations, [
        { name: 'author', type: 'belongsTo', target: 'Author' },
        { name: 'tags', type: 'belongsToMany', target: 'Tag' },
    ]);
});

test('migration is found via pluralized snake_case table name', () => {
    const root = makeWorkspace();
    addEntity(root, 'BlogCategory');
    fs.writeFileSync(
        path.join(root, 'database/migrations', '2026_01_01_000000_create_blog_categories_table.php'),
        '<?php\n'
    );
    const scanner = new EntityScanner(root);
    const migration = scanner.scan()[0].files.find((f) => f.type === 'Migration');
    assert.ok(migration?.exists);
    assert.equal(
        migration?.path,
        'database/migrations/2026_01_01_000000_create_blog_categories_table.php'
    );
});
