import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { enumClasses, fillableColumns, migrationColumns, modelRelations, usesSoftDeletes } from '../services/modelSource';

const ARTICLES = `<?php
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('articles', function (Blueprint $table) {
            $table->id();
            $table->json('meta')->nullable();
            $table->string('title');
            $table->string('slug')->unique();
            $table->enum('status', ['draft', 'published']);
            $table->integer('views')->default('0');
            $table->timestamps();
            $table->softDeletes();
            $table->foreignId('section_id')->constrained('sections')->cascadeOnDelete();
            $table->string('locale_code');
            $table->foreign('locale_code')->references('code')->on('locales')->cascadeOnDelete();
        });
    }
};`;

const MODEL = `<?php
namespace App\\Models;

use App\\Enums\\ArticleStatus;

class Article extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = ['meta', 'title', 'status'];

    public function section(): BelongsTo
    {
        return $this->belongsTo(Section::class);
    }

    public function labels(): BelongsToMany
    {
        return $this->belongsToMany(Label::class);
    }

    public function notes(): MorphMany
    {
        return $this->morphMany(Note::class, 'noteable');
    }

    public function noteable(): MorphTo
    {
        return $this->morphTo();
    }
}`;

test('migration columns keep their order, modifiers and foreign keys', () => {
    const columns = migrationColumns(ARTICLES);

    assert.deepEqual(
        columns.map((column) => column.name),
        ['id', 'meta', 'title', 'slug', 'status', 'views', 'section_id', 'locale_code']
    );
    assert.deepEqual(columns[0], { name: 'id', type: 'bigint', nullable: false, unique: false, primary: true });
    assert.equal(columns[1].nullable, true);
    assert.equal(columns[3].unique, true);
    assert.deepEqual(columns[4].enumValues, ['draft', 'published']);
    assert.equal(columns[5].default, '0');
    assert.equal(columns[6].references, 'sections');
    assert.equal(columns[7].references, 'locales');
});

test('a string primary key and a pivot table read as columns', () => {
    const locales = migrationColumns("Schema::create('locales', function (Blueprint $table) { $table->string('code')->primary(); $table->string('name'); });");
    assert.deepEqual(locales.map((column) => [column.name, column.primary]), [['code', true], ['name', false]]);

    const pivot = migrationColumns("$table->foreignId('article_id')->constrained('articles'); $table->foreignId('label_id')->constrained(); $table->primary(['article_id', 'label_id']);");
    assert.deepEqual(pivot.map((column) => [column.name, column.references]), [['article_id', 'articles'], ['label_id', 'labels']]);
});

test('models expose fillable columns, relations, enums and soft deletes', () => {
    assert.deepEqual(fillableColumns(MODEL), ['meta', 'title', 'status']);
    assert.deepEqual(fillableColumns("#[Fillable(['name', 'email'])]\nclass Writer {}"), ['name', 'email']);
    assert.deepEqual(modelRelations(MODEL), [
        { method: 'section', type: 'belongsTo', target: 'Section' },
        { method: 'labels', type: 'belongsToMany', target: 'Label' },
        { method: 'notes', type: 'morphMany', target: 'Note' },
        { method: 'noteable', type: 'morphTo', target: '' },
    ]);
    assert.deepEqual(enumClasses(MODEL), ['ArticleStatus']);
    assert.equal(usesSoftDeletes(MODEL), true);
    assert.equal(usesSoftDeletes('class Tag extends Model {}'), false);
});
