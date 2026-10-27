import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rebuildEntity, rebuiltSchema } from '../services/entityRebuild';

function project(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-rebuild-'));
    for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), content);
    }
    return root;
}

const createPosts = `<?php
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->text('body')->nullable();
            $table->integer('views')->default('0');
            $table->enum('status', ['draft', 'published']);
            $table->timestamps();
            $table->softDeletes();
            $table->foreignId('category_id')->constrained('categories')->cascadeOnDelete();
        });
    }
};
`;

const postModel = `<?php
class Post extends Model
{
    use HasFactory, SoftDeletes;

    protected function casts(): array
    {
        return ['status' => PostStatus::class, 'tone' => PostTone::class];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class);
    }
}
`;

test('an entity generated before 4.1 is read back from its migrations, model and enums', () => {
    const root = project({
        'database/migrations/2026_10_26_195349_create_posts_table.php': createPosts,
        'database/migrations/2026_10_27_100000_add_tone_to_posts_table.php': `<?php Schema::table('posts', function (Blueprint $table) { $table->string('tone')->nullable(); });`,
        'database/migrations/2026_10_26_195348_create_categories_table.php': `<?php Schema::create('categories', function (Blueprint $table) { $table->string('name'); });`,
        'app/Models/Post.php': postModel,
        'app/Enums/PostTone.php': `<?php enum PostTone: string { case Calm = 'calm'; case Loud = 'loud'; }`,
    });

    assert.deepEqual(rebuildEntity(root, 'Post'), {
        entity: {
            fields: {
                title: { type: 'string' },
                slug: { type: 'string', unique: true },
                body: { type: 'text', nullable: true },
                views: { type: 'integer', default: '0' },
                status: { type: 'string', enum: ['draft', 'published'] },
                tone: { type: 'string', enum: ['calm', 'loud'], nullable: true },
            },
            relations: { category: 'belongsTo Category', tags: 'belongsToMany Tag' },
            soft_deletes: true,
        },
        options: { pest: false, queryBuilder: false, jsonApi: false },
    });
});

test('the options come from the files the entity was generated with', () => {
    const root = project({
        'database/migrations/2026_01_01_000000_create_people_table.php': `<?php Schema::create('people', function (Blueprint $table) { $table->string('code')->primary(); });`,
        'tests/Feature/PersonControllerTest.php': "<?php\n\nit('lists people', function () {});\n",
        'app/Services/PersonService.php': '<?php use Spatie\\QueryBuilder\\QueryBuilder;',
        'app/Http/Resources/PersonResource.php': '<?php class PersonResource extends JsonResource {}',
    });

    assert.deepEqual(rebuildEntity(root, 'Person'), {
        entity: { fields: { code: { type: 'string', primary: true } } },
        options: { pest: true, queryBuilder: true, jsonApi: false },
    });
});

test('without a migration creating the table there is nothing to rebuild', () => {
    const root = project({ 'database/migrations/2026_01_01_000000_add_tone_to_posts_table.php': `<?php Schema::table('posts', fn ($table) => $table->string('tone'));` });

    assert.equal(rebuildEntity(root, 'Post'), undefined);
});

test('the rebuilt entity is sent with the options picked on the review screen', () => {
    const entity = { fields: { title: { type: 'string' } } };

    assert.deepEqual(rebuiltSchema('Post', entity, { pest: true, queryBuilder: false, jsonApi: true }), { options: { pest: true, json_api: true }, entities: { Post: entity } });
    assert.deepEqual(rebuiltSchema('Post', entity, { pest: false, queryBuilder: false, jsonApi: false }), { entities: { Post: entity } });
});
