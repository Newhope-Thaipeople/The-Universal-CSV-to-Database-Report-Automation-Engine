/**
 * Synthetic Test Data Generator for Pipeline Benchmarking
 * Usage: node scripts/generate-mock-data.js [rowCount] [filename]
 * Example: node scripts/generate-mock-data.js 5000 benchmark_sales.csv
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rowCount = Number.parseInt(process.argv[2], 10) || 1000;
const outputFileName = process.argv[3] || `benchmark_sales_${rowCount}.csv`;
const targetDir = path.resolve(__dirname, '../data/raw');
const targetPath = path.join(targetDir, outputFileName);

const PRODUCTS = [
  { id: 'PROD-MACBOOK', price: 1299.0 },
  { id: 'PROD-IPHONE', price: 899.0 },
  { id: 'PROD-KEYBOARD', price: 129.5 },
  { id: 'PROD-MONITOR', price: 349.99 },
  { id: 'PROD-MOUSE', price: 49.99 },
  { id: 'PROD-HEADPHONES', price: 199.0 },
];

const STATUSES = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'PENDING'];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generate() {
  await fsp.mkdir(targetDir, { recursive: true });

  console.log(`[GENERATOR] Creating ${rowCount} synthetic records...`);
  const lines = ['transaction_id,customer_id,product_id,quantity,unit_price,total_amount,sale_date,status'];

  let invalidCount = 0;

  for (let i = 1; i <= rowCount; i++) {
    const isInvalid = Math.random() < 0.02; // ~2% intentional invalid data for error handling tests
    const txnId = `TXN-${String(10000 + i)}`;
    const custId = `CUST-${String(100 + (i % 50)).padStart(4, '0')}`;
    const product = getRandomItem(PRODUCTS);
    let qty = Math.floor(Math.random() * 5) + 1;
    let unitPrice = product.price;
    const saleDate = new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)).toISOString();
    const status = getRandomItem(STATUSES);

    if (isInvalid) {
      invalidCount++;
      const defectType = i % 3;
      if (defectType === 0) {
        qty = -1; // Defect: negative quantity
      } else if (defectType === 1) {
        unitPrice = 'CORRUPTED_PRICE'; // Defect: non-numeric price
      } else {
        lines.push(`,${custId},${product.id},${qty},${unitPrice},0,${saleDate},${status}`); // Defect: missing txn id
        continue;
      }
    }

    const totalAmount = typeof unitPrice === 'number' ? (qty * unitPrice).toFixed(2) : '0.00';
    lines.push(`${txnId},${custId},${product.id},${qty},${unitPrice},${totalAmount},${saleDate},${status}`);
  }

  await fsp.writeFile(targetPath, lines.join('\n'), 'utf8');

  console.log(`[GENERATOR SUCCESS] Saved: ${targetPath}`);
  console.log(`Total Rows Generated : ${rowCount}`);
  console.log(`Valid Records        : ${rowCount - invalidCount}`);
  console.log(`Intentional Defects  : ${invalidCount} (for Dead-Letter testing)`);
  console.log(`File ready for ingestion in data/raw/\n`);
}

generate().catch(console.error);

