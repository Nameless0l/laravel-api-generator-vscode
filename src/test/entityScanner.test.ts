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

function manifest(root: string, files: Record<string, { entity: string | null; kind: string }>): void {
    fs.mkdirSync(path.join(root, '.api-generator'), { recursive: true });
    const entries = Object.fromEntries(Object.entries(files).map(([file, entry]) => [file, { ...entry, hash: 'x' }]));
    fs.writeFileSync(path.join(root, '.api-generator', 'manifest.json'), JSON.stringify({ version: 1, files: entries }));
}

function touch(root: string, file: string, content = '<?php\n'): void {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
}

test('the manifest names the files of an entity, Store and Update requests and enums included', () => {
    const root = makeWorkspace();
    manifest(root, {
        'app/Models/Post.php': { entity: 'Post', kind: 'Model' },
        'app/Http/Requests/UpdatePostRequest.php': { entity: 'Post', kind: 'Request' },
        'app/Http/Requests/StorePostRequest.php': { entity: 'Post', kind: 'Request' },
        'app/Enums/PostStatus.php': { entity: 'Post', kind: 'Enum' },
        'database/migrations/2026_01_01_000001_add_status_to_posts_table.php': { entity: 'Post', kind: 'Migration' },
        'database/migrations/2026_01_01_000000_create_posts_table.php': { entity: 'Post', kind: 'Migration' },
        'tests/Feature/PostControllerTest.php': { entity: 'Post', kind: 'FeatureTest' },
        'routes/api.php': { entity: null, kind: 'Routes' },
        'app/Http/Controllers/AuthController.php': { entity: null, kind: 'Auth' },
    });
    touch(root, 'app/Models/Post.php', "<?php\n#[Fillable(['title', 'status'])]\nclass Post extends Model {}\n");
    touch(root, 'app/Http/Requests/StorePostRequest.php');
    touch(root, 'app/Enums/PostStatus.php');

    const [post, ...others] = new EntityScanner(root).scan();

    assert.deepEqual(others, []);
    assert.equal(post.name, 'Post');
    assert.deepEqual(post.fields, ['title', 'status']);
    assert.deepEqual(
        post.files.map((file) => [file.type, file.path, file.exists]),
        [
            ['Model', 'app/Models/Post.php', true],
            ['Store Request', 'app/Http/Requests/StorePostRequest.php', true],
            ['Update Request', 'app/Http/Requests/UpdatePostRequest.php', false],
            ['Enum', 'app/Enums/PostStatus.php', true],
            ['Feature Test', 'tests/Feature/PostControllerTest.php', false],
            ['Migration', 'database/migrations/2026_01_01_000000_create_posts_table.php', false],
            ['Migration', 'database/migrations/2026_01_01_000001_add_status_to_posts_table.php', false],
        ]
    );
});

test('entities generated before the manifest are still found next to it', () => {
    const root = makeWorkspace();
    manifest(root, { 'app/Models/Post.php': { entity: 'Post', kind: 'Model' } });
    touch(root, 'app/Models/Post.php');
    addEntity(root, 'Book');

    assert.deepEqual(new EntityScanner(root).scan().map((entity) => entity.name), ['Book', 'Post']);
});

test('an entity whose recorded files are all gone is not listed', () => {
    const root = makeWorkspace();
    manifest(root, { 'app/Models/Ghost.php': { entity: 'Ghost', kind: 'Model' } });

    assert.deepEqual(new EntityScanner(root).scan(), []);
});

test('without a manifest, the conventional files follow the requests and enums of the project', () => {
    const root = makeWorkspace();
    addEntity(root, 'Book', String.raw`<?php
use App\Enums\BookStatus;
class Book extends Model
{
    protected $casts = ['format' => \App\Enums\Format::class];
}
`);
    addEntity(root, 'Author');
    touch(root, 'app/Http/Requests/AuthorRequest.php');

    const [author, book] = new EntityScanner(root).scan();

    assert.deepEqual(author.files.filter((file) => file.kind === 'Request').map((file) => [file.type, file.path]), [
        ['Request', 'app/Http/Requests/AuthorRequest.php'],
    ]);
    assert.deepEqual(book.files.filter((file) => file.kind === 'Request').map((file) => file.type), ['Store Request', 'Update Request']);
    assert.deepEqual(book.files.filter((file) => file.kind === 'Enum').map((file) => file.path), ['app/Enums/BookStatus.php', 'app/Enums/Format.php']);
});
