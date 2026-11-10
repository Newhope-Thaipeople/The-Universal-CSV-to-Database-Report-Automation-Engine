/**
 * Validation and cleaning logic for raw CSV rows
 */
export function validateAndCleanRow(rawRow, rowNumber, fileName) {
  const transactionId = rawRow.transaction_id ? String(rawRow.transaction_id).trim() : '';
  const customerId = rawRow.customer_id ? String(rawRow.customer_id).trim() : '';
  const productId = rawRow.product_id ? String(rawRow.product_id).trim() : '';
  const status = rawRow.status ? String(rawRow.status).trim().toUpperCase() : 'COMPLETED';

  // Required identifier validation
  if (!transactionId) {
    return { isValid: false, reason: `Row ${rowNumber}: Missing transaction_id` };
  }
  if (!customerId) {
    return { isValid: false, reason: `Row ${rowNumber}: Missing customer_id` };
  }
  if (!productId) {
    return { isValid: false, reason: `Row ${rowNumber}: Missing product_id` };
  }

  // Quantity validation (positive integer)
  const quantity = Number.parseInt(rawRow.quantity, 10);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      isValid: false,
      reason: `Row ${rowNumber}: Invalid quantity '${rawRow.quantity}' (must be positive integer)`,
    };
  }

  // Unit price validation (non-negative number)
  const unitPrice = Number.parseFloat(rawRow.unit_price);
  if (Number.isNaN(unitPrice) || unitPrice < 0) {
    return {
      isValid: false,
      reason: `Row ${rowNumber}: Invalid unit_price '${rawRow.unit_price}' (must be non-negative number)`,
    };
  }

  // Total amount validation or fallback auto-calculation
  let totalAmount = Number.parseFloat(rawRow.total_amount);
  if (Number.isNaN(totalAmount) || totalAmount < 0) {
    totalAmount = Math.round(quantity * unitPrice * 100) / 100;
  }

  // Date validation
  const parsedDate = Date.parse(rawRow.sale_date);
  if (Number.isNaN(parsedDate)) {
    return {
      isValid: false,
      reason: `Row ${rowNumber}: Invalid sale_date '${rawRow.sale_date}'`,
    };
  }
  const saleDate = new Date(parsedDate).toISOString();

  return {
    isValid: true,
    data: {
      transaction_id: transactionId,
      customer_id: customerId,
      product_id: productId,
      quantity,
      unit_price: unitPrice.toFixed(2),
      total_amount: totalAmount.toFixed(2),
      sale_date: saleDate,
      status,
      source_file: fileName,
    },
  };
}

