import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { summarizeOpenApiPlan } from '../services/openApiPlan';
import { GenerationDocument } from '../types';

const document: GenerationDocument = {
    protocol: 1,
    dryRun: true,
    files: [
        { path: 'app/Models/Customer.php', kind: 'Model', entity: 'Customer', action: 'create' },
        { path: 'app/Http/Controllers/CustomerController.php', kind: 'Controller', entity: 'Customer', action: 'create' },
        { path: 'app/Models/Order.php', kind: 'Model', entity: 'Order', action: 'update' },
        { path: 'app/Models/Product.php', kind: 'Model', entity: 'Product', action: 'update', kept: true },
        { path: 'routes/api.php', kind: 'Routes', action: 'update' },
        { path: 'database/seeders/DatabaseSeeder.php', kind: 'DatabaseSeeder', action: 'unchanged' },
    ],
    warnings: [
        { code: 'openapi_schema_skipped', message: 'NewOrder was skipped: it looks like a payload of Order.' },
        { code: 'api_routes_not_loaded', message: 'routes/api.php is not loaded.' },
        { code: 'openapi_schema_skipped', message: 'Error was skipped: it describes an error or pagination payload.' },
    ],
    errors: [],
};

test('the preview names the entities, counts the files and lists the skipped schemas', () => {
    assert.deepEqual(summarizeOpenApiPlan(document), {
        entities: ['Customer', 'Order', 'Product'],
        create: 2,
        update: 2,
        kept: 1,
        skipped: ['NewOrder was skipped: it looks like a payload of Order.', 'Error was skipped: it describes an error or pagination payload.'],
        otherWarnings: ['routes/api.php is not loaded.'],
    });
});
