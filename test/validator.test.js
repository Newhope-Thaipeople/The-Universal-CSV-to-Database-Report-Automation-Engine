import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndCleanRow } from '../src/validator.js';

test('Validator: should successfully validate a standard clean row', () => {
  const row = {
    transaction_id: 'TXN-999',
    customer_id: 'CUST-10',
    product_id: 'PROD-A',
    quantity: '5',
    unit_price: '20.50',
    total_amount: '102.50',
    sale_date: '2026-11-10T10:00:00Z',
    status: 'completed',
  };

  const result = validateAndCleanRow(row, 1, 'test.csv');
  assert.equal(result.isValid, true);
  assert.equal(result.data.transaction_id, 'TXN-999');
  assert.equal(result.data.quantity, 5);
  assert.equal(result.data.unit_price, '20.50');
  assert.equal(result.data.total_amount, '102.50');
  assert.equal(result.data.status, 'COMPLETED');
});

test('Validator: should auto-calculate total_amount if missing or invalid', () => {
  const row = {
    transaction_id: 'TXN-998',
    customer_id: 'CUST-11',
    product_id: 'PROD-B',
    quantity: '4',
    unit_price: '25.00',
    total_amount: '',
    sale_date: '2026-11-10T10:00:00Z',
  };

  const result = validateAndCleanRow(row, 2, 'test.csv');
  assert.equal(result.isValid, true);
  assert.equal(result.data.total_amount, '100.00');
});

test('Validator: should reject row with invalid quantity', () => {
  const row = {
    transaction_id: 'TXN-997',
    customer_id: 'CUST-12',
    product_id: 'PROD-C',
    quantity: '-2',
    unit_price: '15.00',
    sale_date: '2026-11-10T10:00:00Z',
  };

  const result = validateAndCleanRow(row, 3, 'test.csv');
  assert.equal(result.isValid, false);
  assert.match(result.reason, /Invalid quantity/);
});

test('Validator: should reject row with invalid unit price', () => {
  const row = {
    transaction_id: 'TXN-996',
    customer_id: 'CUST-13',
    product_id: 'PROD-D',
    quantity: '2',
    unit_price: 'invalid_number',
    sale_date: '2026-11-10T10:00:00Z',
  };

  const result = validateAndCleanRow(row, 4, 'test.csv');
  assert.equal(result.isValid, false);
  assert.match(result.reason, /Invalid unit_price/);
});

test('Validator: should reject row with invalid date', () => {
  const row = {
    transaction_id: 'TXN-995',
    customer_id: 'CUST-14',
    product_id: 'PROD-E',
    quantity: '2',
    unit_price: '10.00',
    sale_date: 'invalid-date-string',
  };

  const result = validateAndCleanRow(row, 5, 'test.csv');
  assert.equal(result.isValid, false);
  assert.match(result.reason, /Invalid sale_date/);
});

test('Validator: should reject row with missing transaction_id', () => {
  const row = {
    transaction_id: '',
    customer_id: 'CUST-15',
    product_id: 'PROD-F',
    quantity: '1',
    unit_price: '10.00',
    sale_date: '2026-11-10T10:00:00Z',
  };

  const result = validateAndCleanRow(row, 6, 'test.csv');
  assert.equal(result.isValid, false);
  assert.match(result.reason, /Missing transaction_id/);
});
