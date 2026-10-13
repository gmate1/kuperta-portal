import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://x@localhost/x';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-1234';
process.env.DATA_ENCRYPTION_KEY ??= '0'.repeat(64);

const { encrypt, decrypt, maskTaxNumber } = await import('../src/utils/crypto.js');

test('titkosítás oda-vissza', () => {
  const enc = encrypt('12345678-1-42');
  assert.notEqual(enc, '12345678-1-42');
  assert.equal(decrypt(enc), '12345678-1-42');
});

test('azonos szöveg kétszer titkosítva eltér (véletlen IV)', () => {
  assert.notEqual(encrypt('abc'), encrypt('abc'));
});

test('módosított titkosított szöveget elutasít (GCM hitelesítés)', () => {
  const parts = encrypt('12345678-1-42').split(':');
  const data = Buffer.from(parts[3], 'base64');
  data[0] ^= 1;
  parts[3] = data.toString('base64');
  assert.throws(() => decrypt(parts.join(':')));
});

test('adószám maszkolás', () => {
  assert.equal(maskTaxNumber('12345678-1-42'), '********-1-42');
});
