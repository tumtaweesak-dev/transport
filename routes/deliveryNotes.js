const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { badRequest, requireFields, requireNumber } = require('../middleware/validate');

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest('items must contain at least one product');
  }

  return items.map((item, index) => {
    requireFields(item, ['productId', 'name', 'qty']);
    const qty = requireNumber(item.qty, `items[${index}].qty`);
    if (qty <= 0) {
      throw badRequest(`items[${index}].qty must be greater than 0`);
    }

    const weightKg = requireNumber(item.weightKg ?? item.weight_kg ?? 0, `items[${index}].weightKg`);
    const totalWeightKg = item.totalWeightKg === undefined
      ? qty * weightKg
      : requireNumber(item.totalWeightKg, `items[${index}].totalWeightKg`);

    return {
      productId: String(item.productId),
      sku: item.sku || null,
      name: item.name,
      qty,
      unit: item.unit || null,
      weightKg,
      totalWeightKg,
      dimensions: item.dim || item.dimensions || null,
    };
  });
}

module.exports = function createDeliveryNotesRouter({ mysqlPool }) {
  const router = express.Router();

  router.get('/delivery-notes', asyncHandler(async (req, res) => {
    const [rows] = await mysqlPool.execute(`
      SELECT dn.*,
             COUNT(dni.id) AS item_count
      FROM delivery_notes dn
      LEFT JOIN delivery_note_items dni ON dni.delivery_note_id = dn.id
      GROUP BY dn.id
      ORDER BY dn.id DESC
      LIMIT 100
    `);

    res.status(200).json(rows);
  }));

  router.post('/delivery-notes', asyncHandler(async (req, res) => {
    requireFields(req.body, ['noteNo', 'items']);
    const items = normalizeItems(req.body.items);
    const totalWeight = items.reduce((sum, item) => sum + item.totalWeightKg, 0);

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();

      const [noteResult] = await connection.execute(
        `INSERT INTO delivery_notes
         (note_no, customer_name, origin_name, destination_name, total_weight_kg, status)
         VALUES (?, ?, ?, ?, ?, 'created')`,
        [
          req.body.noteNo,
          req.body.customerName || null,
          req.body.originName || null,
          req.body.destinationName || null,
          totalWeight,
        ]
      );

      const deliveryNoteId = noteResult.insertId;
      for (const item of items) {
        await connection.execute(
          `INSERT INTO delivery_note_items
           (delivery_note_id, product_id, sku, product_name, qty, unit, weight_kg, total_weight_kg, dimensions)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            deliveryNoteId,
            item.productId,
            item.sku,
            item.name,
            item.qty,
            item.unit,
            item.weightKg,
            item.totalWeightKg,
            item.dimensions,
          ]
        );
      }

      await connection.commit();

      const [notes] = await mysqlPool.execute('SELECT * FROM delivery_notes WHERE id = ?', [deliveryNoteId]);
      const [savedItems] = await mysqlPool.execute(
        'SELECT * FROM delivery_note_items WHERE delivery_note_id = ? ORDER BY id ASC',
        [deliveryNoteId]
      );

      res.status(201).json({ ...notes[0], items: savedItems });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }));

  return router;
};
