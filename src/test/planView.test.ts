import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { countFiles, estimatedRoutes, planView, pluralize, routeName, routesFromList } from '../services/planView';
import { GenerationDocument, PlannedFile } from '../types';

const migration = `Schema::create('products', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('sku')->unique();
    $table->text('description')->nullable();
    $table->foreignId('category_id')->constrained('categories');
    $table->timestamps();
});`;

function file(path: string, kind: string, entity: string | undefined, action: PlannedFile['action'], extra: Partial<PlannedFile> = {}): PlannedFile {
    return { path, kind, ...(entity ? { entity } : {}), action, ...extra };
}

const document: GenerationDocument = {
    protocol: 1,
    dryRun: true,
    files: [
        file('app/Http/Controllers/ProductController.php', 'Controller', 'Product', 'create'),
        file('app/Models/Product.php', 'Model', 'Product', 'create', { content: 'class Product { public function category(): BelongsTo { return $this->belongsTo(Category::class); } }' }),
        file('database/migrations/2026_09_28_000000_create_products_table.php', 'Migration', 'Product', 'create', { content: migration }),
        file('app/Http/Requests/StoreProductRequest.php', 'Request', 'Product', 'create'),
        file('app/Models/Order.php', 'Model', 'Order', 'update', { content: 'use SoftDeletes;' }),
        file('app/Http/Controllers/OrderController.php', 'Controller', 'Order', 'unchanged', { kept: true }),
        file('app/Http/Resources/OrderResource.php', 'Resource', 'Order', 'unchanged'),
        file('routes/api.php', 'Routes', undefined, 'update'),
    ],
    warnings: [
        { code: 'openapi_schema_skipped', message: 'Error was skipped: it has no properties.' },
        { code: 'modified_file_kept', message: 'OrderController.php was kept.' },
        { code: 'unknown_field_type', message: 'Product.weight has the unknown type strng.' },
    ],
    errors: [],
};

test('the plan groups files by entity with their columns, relations and counts', () => {
    const view = planView(document);
    const [product, order] = view.entities;

    assert.deepEqual(view.entities.map((entity) => entity.name), ['Product', 'Order']);
    assert.deepEqual(product.fields.map((field) => field.name), ['name', 'sku', 'description']);
    assert.deepEqual(product.relations, [{ method: 'category', type: 'belongsTo', target: 'Category' }]);
    assert.deepEqual(product.files.map((entry) => entry.kind), ['Model', 'Controller', 'Request', 'Migration']);
    assert.equal(product.route, '/api/products');
    assert.equal(product.existing, false);
    assert.equal(product.newRoutes, 5);

    assert.equal(order.existing, true);
    assert.equal(order.softDeletes, true);
    assert.equal(order.newRoutes, 0);
    assert.deepEqual(order.counts, { create: 0, update: 1, kept: 1, unchanged: 1 });

    assert.deepEqual(view.shared.map((entry) => entry.path), ['routes/api.php']);
    assert.deepEqual(view.totals, { create: 4, update: 2, kept: 1, unchanged: 1, newRoutes: 5 });
});

test('skipped schemas and kept files leave the generic warnings', () => {
    const view = planView(document);

    assert.deepEqual(view.skipped, ['Error']);
    assert.deepEqual(view.skippedMessages, ['Error was skipped: it has no properties.']);
    assert.deepEqual(view.warnings, ['Product.weight has the unknown type strng.']);
});

test('counts put kept files apart from their action', () => {
    assert.deepEqual(countFiles([{ action: 'create' }, { action: 'update', kept: true }, { action: 'unchanged' }]), { create: 1, update: 0, kept: 1, unchanged: 1 });
});

test('routes follow the package naming', () => {
    assert.equal(pluralize('category'), 'categories');
    assert.equal(pluralize('box'), 'boxes');
    assert.equal(pluralize('person'), 'people');
    assert.equal(pluralize('data'), 'data');
    assert.equal(routeName('BlogPost'), 'blogposts');

    const routes = estimatedRoutes('Post', true);
    assert.deepEqual(routes.map((route) => `${route.method} ${route.uri}`), [
        'GET /api/posts',
        'POST /api/posts',
        'GET /api/posts/{post}',
        'PUT /api/posts/{post}',
        'DELETE /api/posts/{post}',
        'POST /api/posts/{post}/restore',
        'DELETE /api/posts/{post}/force-delete',
    ]);
    assert.equal(estimatedRoutes('Post', false).length, 5);
});

test('route:list rows are kept for the generated controllers only', () => {
    const json = JSON.stringify([
        { method: 'GET|HEAD', uri: 'api/posts', action: 'App\\Http\\Controllers\\PostController@index' },
        { method: 'PUT|PATCH', uri: 'api/posts/{post}', action: 'App\\Http\\Controllers\\PostController@update' },
        { method: 'GET|HEAD', uri: 'api/user', action: 'Closure' },
        { method: 'POST', uri: 'api/tags', action: 'App\\Http\\Controllers\\TagController@store' },
    ]);

    assert.deepEqual(routesFromList(`Some noise\n${json}`, ['PostController']), [
        { method: 'GET', uri: '/api/posts', action: 'PostController@index', note: 'paginated' },
        { method: 'PUT', uri: '/api/posts/{post}', action: 'PostController@update', note: 'andPatch' },
    ]);
    assert.equal(routesFromList('not json', ['PostController']), null);
});
