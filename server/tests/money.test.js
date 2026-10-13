import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcLine, calcTotals, calcExpense } from '../src/utils/money.js';

test('tétel: 3 óra × 25 000 Ft, 27% ÁFA', () => {
  assert.deepEqual(calcLine({ quantity: 3, unit_price: 25000, vat_rate: 27 }), {
    line_net: 75000,
    line_vat: 20250,
    line_gross: 95250,
  });
});

test('tétel kedvezménnyel: 10% le', () => {
  const l = calcLine({ quantity: 1, unit_price: 350000, discount_pct: 10, vat_rate: 27 });
  assert.equal(l.line_net, 315000);
  assert.equal(l.line_vat, 85050);
});

test('tört mennyiség és fillér kerekítés', () => {
  const l = calcLine({ quantity: 1.5, unit_price: 333.33, vat_rate: 27 });
  assert.equal(l.line_net, 500); // 499.995 → 500.00
  assert.equal(l.line_vat, 135);
});

test('ÁFA-mentes tétel', () => {
  const l = calcLine({ quantity: 2, unit_price: 10000, vat_rate: 0 });
  assert.equal(l.line_vat, 0);
  assert.equal(l.line_gross, 20000);
});

test('összesítés nem halmoz lebegőpontos hibát', () => {
  const items = Array.from({ length: 10 }, () => ({ quantity: 1, unit_price: 0.1, vat_rate: 0 }));
  assert.equal(calcTotals(items).net_total, 1);
});

test('költség bruttósítás', () => {
  assert.deepEqual(calcExpense(10000, 27), { amount_vat: 2700, amount_gross: 12700 });
});
