/**
 * ==============================================================================
 * Report Automation Module
 * Generates aggregated analytical KPI reports and exports to JSON & CSV
 * ==============================================================================
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { pool } from './db.js';
import { CONFIG } from './config.js';

const reportsDir = path.resolve(CONFIG.paths.root, 'reports');

/**
 * Generate ISO-like filesystem-safe timestamp (e.g. 20261110T150000Z)
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
}

export async function generateAnalyticsReport() {
  console.log(`\n======================================================`);
  console.log(`[REPORT GENERATOR] Querying Sales Performance KPIs...`);
  console.log(`======================================================`);

  await fsp.mkdir(reportsDir, { recursive: true });

  const client = await pool.connect();

  try {
    // 1. Overall Sales KPIs
    const overallRes = await client.query(`
      SELECT 
        COUNT(*)::INTEGER AS total_transactions,
        COALESCE(SUM(total_amount), 0)::NUMERIC(14,2) AS gross_revenue,
        COALESCE(AVG(total_amount), 0)::NUMERIC(14,2) AS average_order_value,
        COALESCE(SUM(quantity), 0)::INTEGER AS total_units_sold,
        MIN(sale_date) AS earliest_sale,
        MAX(sale_date) AS latest_sale
      FROM sales_reports;
    `);
    const kpis = overallRes.rows[0];

    // 2. Top 5 Performing Products
    const topProductsRes = await client.query(`
      SELECT 
        product_id,
        SUM(quantity)::INTEGER AS units_sold,
        SUM(total_amount)::NUMERIC(12,2) AS product_revenue
      FROM sales_reports
      GROUP BY product_id
      ORDER BY product_revenue DESC
      LIMIT 5;
    `);

    // 3. Top 5 Customers by Spend
    const topCustomersRes = await client.query(`
      SELECT 
        customer_id,
        COUNT(*)::INTEGER AS order_count,
        SUM(total_amount)::NUMERIC(12,2) AS customer_spend
      FROM sales_reports
      GROUP BY customer_id
      ORDER BY customer_spend DESC
      LIMIT 5;
    `);

    // 4. Status Breakdown
    const statusRes = await client.query(`
      SELECT 
        status,
        COUNT(*)::INTEGER AS count,
        SUM(total_amount)::NUMERIC(12,2) AS total_amount
      FROM sales_reports
      GROUP BY status;
    `);

    const reportData = {
      generated_at: new Date().toISOString(),
      summary: kpis,
      top_products: topProductsRes.rows,
      top_customers: topCustomersRes.rows,
      status_breakdown: statusRes.rows,
    };

    const timestamp = getTimestamp();
    const jsonPath = path.join(reportsDir, `sales_report_${timestamp}.json`);
    const csvPath = path.join(reportsDir, `top_products_${timestamp}.csv`);

    // Export JSON
    await fsp.writeFile(jsonPath, JSON.stringify(reportData, null, 2), 'utf8');

    // Export Top Products CSV
    const csvLines = ['product_id,units_sold,product_revenue'];
    topProductsRes.rows.forEach((r) => {
      csvLines.push(`${r.product_id},${r.units_sold},${r.product_revenue}`);
    });
    await fsp.writeFile(csvPath, csvLines.join('\n'), 'utf8');

    // Console Visual Reporting
    console.log(`\nExecutive Sales Summary:`);
    console.table([
      { Metric: 'Total Transactions', Value: kpis.total_transactions },
      { Metric: 'Gross Revenue ($)', Value: kpis.gross_revenue },
      { Metric: 'Average Order Value ($)', Value: kpis.average_order_value },
      { Metric: 'Total Units Sold', Value: kpis.total_units_sold },
      { Metric: 'Date Range', Value: `${kpis.earliest_sale || 'N/A'} -> ${kpis.latest_sale || 'N/A'}` },
    ]);

    if (topProductsRes.rows.length > 0) {
      console.log(`\nTop Performing Products:`);
      console.table(topProductsRes.rows);
    }

    if (topCustomersRes.rows.length > 0) {
      console.log(`\nTop Customers by Total Spend:`);
      console.table(topCustomersRes.rows);
    }

    console.log(`\n[EXPORT COMPLETE]`);
    console.log(`- JSON Report: ${jsonPath}`);
    console.log(`- CSV Report : ${csvPath}\n`);

    return reportData;
  } finally {
    client.release();
  }
}

// Standalone execution if invoked directly
if (process.argv[1] && process.argv[1].endsWith('reporter.js')) {
  generateAnalyticsReport()
    .catch((err) => {
      console.error('[REPORT ERROR] Failed to generate sales report:', err.message);
    })
    .finally(async () => {
      await pool.end();
    });
}
