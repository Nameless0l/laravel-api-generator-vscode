import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { contentHash, editedFiles, MANIFEST_PATH, readManifest } from '../services/manifest';

test('the hash ignores line endings, like the package', () => {
    assert.equal(contentHash('<?php\r\nclass Post {}\r\n'), contentHash('<?php\nclass Post {}\n'));
    assert.notEqual(contentHash('<?php\nclass Post {}\n'), contentHash('<?php\nclass Post { }\n'));
});

test('files edited since the generation are the ones whose hash moved', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-manifest-'));
    fs.mkdirSync(path.join(root, 'app', 'Models'), { recursive: true });
    fs.mkdirSync(path.join(root, path.dirname(MANIFEST_PATH)), { recursive: true });
    const original = '<?php\nclass Post {}\n';
    fs.writeFileSync(path.join(root, 'app/Models/Post.php'), '<?php\nclass Post { use HasUuids; }\n');
    fs.writeFileSync(path.join(root, 'app/Models/Tag.php'), original.replace('Post', 'Tag'));
    fs.writeFileSync(
        path.join(root, MANIFEST_PATH),
        JSON.stringify({
            version: 1,
            files: {
                'app/Models/Post.php': { entity: 'Post', kind: 'Model', hash: contentHash(original) },
                'app/Models/Tag.php': { entity: 'Tag', kind: 'Model', hash: contentHash(original.replace('Post', 'Tag')) },
                'app/Models/Gone.php': { entity: 'Gone', kind: 'Model', hash: 'abc' },
                'routes/api.php': { entity: null, kind: 'Routes' },
            },
        })
    );

    const entries = readManifest(root);
    assert.ok(entries);
    assert.equal(entries.length, 4);
    assert.deepEqual([...editedFiles(root, entries)], ['app/Models/Post.php']);
});
