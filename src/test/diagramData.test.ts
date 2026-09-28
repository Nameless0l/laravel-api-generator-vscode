import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createdTable, diagramData, toMermaid } from '../services/diagramData';

function write(root: string, file: string, content: string): void {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
}

function workspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-diagram-'));
    for (const name of ['Author', 'Post']) {
        write(root, `app/Http/Controllers/${name}Controller.php`, '<?php\n');
        write(root, `app/Services/${name}Service.php`, '<?php\n');
    }
    write(
        root,
        'app/Models/Author.php',
        "<?php\nclass Author extends Model {\n    protected $fillable = ['name'];\n    public function posts(): HasMany { return $this->hasMany(Post::class); }\n}\n"
    );
    write(
        root,
        'app/Models/Post.php',
        "<?php\nclass Post extends Model {\n    use SoftDeletes;\n    protected $fillable = ['title', 'author_id'];\n    public function author(): BelongsTo { return $this->belongsTo(Author::class); }\n}\n"
    );
    write(root, 'database/migrations/2026_01_01_000001_create_authors_table.php', "Schema::create('authors', function (Blueprint $table) { $table->id(); $table->string('name'); $table->timestamps(); });");
    write(
        root,
        'database/migrations/2026_01_01_000002_create_posts_table.php',
        "Schema::create('posts', function (Blueprint $table) { $table->id(); $table->string('title')->unique(); $table->foreignId('author_id')->constrained('authors'); $table->timestamps(); $table->softDeletes(); });"
    );
    return root;
}

test('the diagram reads columns, foreign keys and relations from the project', () => {
    const [author, post] = diagramData(workspace());

    assert.equal(author.name, 'Author');
    assert.equal(author.table, 'authors');
    assert.equal(author.route, '/api/authors');
    assert.deepEqual(author.columns.map((column) => column.name), ['id', 'name']);
    assert.deepEqual(author.relations, [{ method: 'posts', type: 'hasMany', target: 'Post' }]);

    assert.deepEqual(post.columns.map((column) => column.name), ['id', 'title', 'author_id']);
    assert.equal(post.columns[1].unique, true);
    assert.equal(post.columns[2].target, 'Author');
    assert.equal(post.softDeletes, true);
    assert.ok(post.files.some((file) => file.kind === 'Model' && file.exists && !file.edited));
});

test('the Mermaid export draws one link per pair, from the one side', () => {
    const mermaid = toMermaid(diagramData(workspace()));

    assert.match(mermaid, /^erDiagram\n/);
    assert.match(mermaid, /    Post \{\n        bigint id PK\n        string title\n        bigint author_id FK\n    \}/);
    assert.deepEqual(mermaid.split('\n').filter((line) => line.includes('--')), ['    Author ||--o{ Post : posts']);
});

test('the created table is read from the migration', () => {
    assert.equal(createdTable("Schema::create('blog_posts', function () {})"), 'blog_posts');
    assert.equal(createdTable("Schema::table('posts', function () {})"), undefined);
});
