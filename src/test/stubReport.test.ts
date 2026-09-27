import './vscodeStub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { stubLine } from '../services/stubReport';

test('a row names the missing placeholders and why a 3.x stub no longer fits', () => {
    assert.equal(
        stubLine({ stub: 'model', status: 'invalid', missing: ['members', 'classAttributes'] }),
        '  • model.stub: missing {{members}}, {{classAttributes}}'
    );
    assert.equal(
        stubLine({ stub: 'service', status: 'invalid', missing: [], reason: 'saves every DTO property' }),
        '  • service.stub: saves every DTO property'
    );
});
