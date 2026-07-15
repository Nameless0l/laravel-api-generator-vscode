import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MigrationIntrospector } from '../services/migrationIntrospector';

function makeWorkspace(migrations: Record<string, string> = {}): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-introspect-'));
    const dir = path.join(root, 'database', 'migrations');
    fs.mkdirSync(dir, { recursive: true });
    for (const [file, content] of Object.entries(migrations)) {
        fs.writeFileSync(path.join(dir, file), content);
    }
    return root;
}

const BOOK_MIGRATION = `<?php
return new class extends Migration {
    public function up(): void
    {
        Schema::create('books', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('summary')->nullable();
            $table->decimal('price', 8, 2);
            $table->boolean('published')->default(false);
            $table->foreignId('author_id')->constrained()->cascadeOnDelete();
            $table->index('title');
            $table->softDeletes();
            $table->timestamps();
        });
    }
};
`;

test('returns null when no migration matches', () => {
    const root = makeWorkspace();
    const introspector = new MigrationIntrospector(root);
    assert.equal(introspector.introspect('Book'), null);
});

test('extracts fields, maps types, and skips foreign keys and indexes', () => {
    const root = makeWorkspace({
        '2026_01_01_000000_create_books_table.php': BOOK_MIGRATION,
    });
    const introspector = new MigrationIntrospector(root);
    const schema = introspector.introspect('Book');
    assert.ok(schema);
    assert.deepEqual(schema.fields, [
        { name: 'title', type: 'string' },
        { name: 'summary', type: 'text' },
        { name: 'price', type: 'decimal' },
        { name: 'published', type: 'boolean' },
    ]);
    assert.equal(schema.softDeletes, true);
});

test('softDeletes is false when the column is absent', () => {
    const root = makeWorkspace({
        '2026_01_01_000000_create_notes_table.php': `<?php
Schema::create('notes', function (Blueprint $table) {
    $table->id();
    $table->string('body');
    $table->timestamps();
});
`,
    });
    const introspector = new MigrationIntrospector(root);
    const schema = introspector.introspect('Note');
    assert.ok(schema);
    assert.equal(schema.softDeletes, false);
});

test('picks the most recent migration when several match', () => {
    const root = makeWorkspace({
        '2026_01_01_000000_create_books_table.php': `<?php
Schema::create('books', function (Blueprint $table) {
    $table->string('old_field');
});
`,
        '2026_06_01_000000_create_books_table.php': `<?php
Schema::create('books', function (Blueprint $table) {
    $table->string('new_field');
});
`,
    });
    const introspector = new MigrationIntrospector(root);
    const schema = introspector.introspect('Book');
    assert.deepEqual(schema?.fields, [{ name: 'new_field', type: 'string' }]);
});

test('pluralization handles y -> ies (Category -> categories)', () => {
    const root = makeWorkspace({
        '2026_01_01_000000_create_categories_table.php': `<?php
Schema::create('categories', function (Blueprint $table) {
    $table->string('name');
});
`,
    });
    const introspector = new MigrationIntrospector(root);
    assert.ok(introspector.introspect('Category'));
});
