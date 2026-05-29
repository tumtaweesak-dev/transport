const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { badRequest, requireFields, requireNumber, validateAllowed } = require('../middleware/validate');

const REQUEST_STATUSES = ['manager', 'hr', 'md', 'accounting', 'completed', 'approved', 'rejected'];

function normalizeMoney(value, field) {
  if (value === undefined || value === null || value === '') return 0;
  return requireNumber(value, field);
}

function validateTravelRequest(body) {
  requireFields(body, ['travelers', 'origin', 'destinations', 'date', 'time', 'fuel', 'accommodation']);

  if (!Array.isArray(body.travelers) || body.travelers.length === 0) {
    throw badRequest('travelers must contain at least one traveler');
  }

  if (!Array.isArray(body.destinations) || body.destinations.length === 0) {
    throw badRequest('destinations must contain at least one destination');
  }

  requireFields(body.origin, ['name']);

  body.travelers.forEach((traveler, index) => {
    requireFields(traveler, ['name']);
    traveler.__index = index;
  });

  body.destinations.forEach((destination, index) => {
    requireFields(destination, ['name']);
    destination.distance = normalizeMoney(destination.distance, `destinations[${index}].distance`);
  });

  body.fuel.qty = normalizeMoney(body.fuel.qty, 'fuel.qty');
  body.fuel.price = normalizeMoney(body.fuel.price, 'fuel.price');
  body.fuel.total = normalizeMoney(body.fuel.total, 'fuel.total');
  body.accommodation.qty = normalizeMoney(body.accommodation.qty, 'accommodation.qty');
  body.accommodation.price = normalizeMoney(body.accommodation.price, 'accommodation.price');
  body.accommodation.total = normalizeMoney(body.accommodation.total, 'accommodation.total');
  body.grandTotal = normalizeMoney(body.grandTotal, 'grandTotal');
}

function normalizeActorName(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 200) : null;
}

function normalizeOptionalText(value, maxLength = 200) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTravelVehicle(vehicle = {}) {
  const type = vehicle.type === 'private' ? 'private' : 'company';
  return {
    type,
    plate: normalizeOptionalText(vehicle.plate, 100),
    brand: normalizeOptionalText(vehicle.brand, 100),
    model: normalizeOptionalText(vehicle.model, 100),
    assetCode: normalizeOptionalText(vehicle.assetCode || vehicle.asset_code, 100),
    mileageStart: normalizeOptionalNumber(vehicle.mileageStart ?? vehicle.mileage_start),
    mileageEnd: normalizeOptionalNumber(vehicle.mileageEnd ?? vehicle.mileage_end),
  };
}

function normalizeAttachment(attachment = {}) {
  const fileName = String(attachment.name || attachment.fileName || '').trim();
  const fileData = String(attachment.data || attachment.fileData || '').trim();
  if (!fileName || !fileData) return null;

  return {
    fileName: fileName.slice(0, 255),
    fileType: String(attachment.type || attachment.fileType || 'application/octet-stream').slice(0, 120),
    fileSize: Number(attachment.size || attachment.fileSize) || 0,
    fileData,
  };
}

async function insertTravelAttachments(connection, requestId, attachments = [], uploadedBy = null) {
  const rows = Array.isArray(attachments)
    ? attachments.map(normalizeAttachment).filter(Boolean)
    : [];

  for (const attachment of rows) {
    await connection.execute(
      `INSERT INTO travel_request_attachments
       (request_id, file_name, file_type, file_size, file_data, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        requestId,
        attachment.fileName,
        attachment.fileType,
        attachment.fileSize,
        attachment.fileData,
        uploadedBy,
      ]
    );
  }
}

module.exports = function createTravelRequestsRouter({ mysqlPool }) {
  const router = express.Router();

  router.post('/travel-requests', asyncHandler(async (req, res) => {
    validateTravelRequest(req.body);

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      const { travelers, origin, destinations, date, time, fuel, accommodation, grandTotal } = req.body;
      const jobDescription = String(req.body.jobDescription || req.body.job_description || '').trim();
      const vehicle = normalizeTravelVehicle(req.body.vehicle);

      const [masterRes] = await connection.execute(
        `INSERT INTO travel_requests
         (origin_project_code, origin_name, origin_gps_link, travel_date, travel_time,
          fuel_type, fuel_qty, fuel_price, fuel_total,
          acc_type, acc_qty, acc_price, acc_total, grand_total, job_description,
          vehicle_type, vehicle_plate, vehicle_brand, vehicle_model, vehicle_asset_code,
          vehicle_mileage_start, vehicle_mileage_end, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manager')`,
        [
          origin.projectCode || null,
          origin.name,
          origin.gpsLink || null,
          date,
          time,
          fuel.type || null,
          fuel.qty,
          fuel.price,
          fuel.total,
          accommodation.type || null,
          accommodation.qty,
          accommodation.price,
          accommodation.total,
          grandTotal,
          jobDescription || null,
          vehicle.type,
          vehicle.plate,
          vehicle.brand,
          vehicle.model,
          vehicle.assetCode,
          vehicle.mileageStart,
          vehicle.mileageEnd,
        ]
      );
      const requestId = masterRes.insertId;

      for (const traveler of travelers) {
        await connection.execute(
          `INSERT INTO travelers (request_id, employee_id, name, department, position, phone, comment)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            requestId,
            traveler.id || null,
            traveler.name,
            traveler.department || null,
            traveler.position || null,
            traveler.phone || null,
            traveler.comment || null,
          ]
        );
      }

      for (const destination of destinations) {
        await connection.execute(
          `INSERT INTO travel_destinations (request_id, project_code, name, gps_link, distance)
           VALUES (?, ?, ?, ?, ?)`,
          [
            requestId,
            destination.projectCode || null,
            destination.name,
            destination.gpsLink || null,
            destination.distance,
          ]
        );
      }

      await insertTravelAttachments(
        connection,
        requestId,
        req.body.attachments,
        normalizeActorName(req.body.createdBy || req.body.uploadedBy)
      );

      await connection.commit();
      const [fetchedMaster] = await mysqlPool.execute('SELECT * FROM travel_requests WHERE id = ?', [requestId]);
      res.status(201).json({ success: true, requestId, data: fetchedMaster[0] });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }));

  router.get('/travel-requests', asyncHandler(async (req, res) => {
    const { status } = req.query;
    const params = [];
    let query = `
      SELECT tr.*,
             (SELECT name FROM travelers WHERE request_id = tr.id LIMIT 1) as traveler_name,
             (SELECT COUNT(*) FROM travel_request_attachments WHERE request_id = tr.id) as attachment_count
      FROM travel_requests tr
    `;

    if (status) {
      validateAllowed(status, REQUEST_STATUSES, 'status');
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY id DESC';
    try {
      const [rows] = await mysqlPool.execute(query, params);
      res.status(200).json(rows);
    } catch (error) {
      console.warn('Travel requests list unavailable, returning empty list:', error.message);
      res.status(200).json([]);
    }
  }));

  router.get('/travel-requests/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [masterRows] = await mysqlPool.execute('SELECT * FROM travel_requests WHERE id = ?', [id]);
    if (masterRows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const [travelersRows] = await mysqlPool.execute('SELECT * FROM travelers WHERE request_id = ?', [id]);
    const [destinationsRows] = await mysqlPool.execute('SELECT * FROM travel_destinations WHERE request_id = ?', [id]);
    const [attachmentRows] = await mysqlPool.execute(
      `SELECT id, file_name, file_type, file_size, file_data, uploaded_by, created_at
       FROM travel_request_attachments
       WHERE request_id = ?
       ORDER BY id DESC`,
      [id]
    );

    res.status(200).json({
      ...masterRows[0],
      travelers: travelersRows,
      destinations: destinationsRows,
      attachments: attachmentRows.map((row) => ({
        id: row.id,
        name: row.file_name,
        type: row.file_type,
        size: row.file_size,
        data: row.file_data,
        uploadedBy: row.uploaded_by,
        createdAt: row.created_at,
      })),
    });
  }));

  router.post('/travel-requests/:id/attachments', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [masterRows] = await mysqlPool.execute('SELECT id FROM travel_requests WHERE id = ?', [id]);
    if (masterRows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      await insertTravelAttachments(
        connection,
        id,
        req.body.attachments,
        normalizeActorName(req.body.uploadedBy || req.body.actorName)
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [attachmentRows] = await mysqlPool.execute(
      `SELECT id, file_name, file_type, file_size, file_data, uploaded_by, created_at
       FROM travel_request_attachments
       WHERE request_id = ?
       ORDER BY id DESC`,
      [id]
    );

    res.status(201).json({
      success: true,
      attachments: attachmentRows.map((row) => ({
        id: row.id,
        name: row.file_name,
        type: row.file_type,
        size: row.file_size,
        data: row.file_data,
        uploadedBy: row.uploaded_by,
        createdAt: row.created_at,
      })),
    });
  }));

  router.delete('/travel-requests/:id/attachments/:attachmentId', asyncHandler(async (req, res) => {
    const { id, attachmentId } = req.params;
    const [result] = await mysqlPool.execute(
      'DELETE FROM travel_request_attachments WHERE id = ? AND request_id = ?',
      [attachmentId, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.status(200).json({ success: true });
  }));

  router.patch('/travel-requests/:id/costs', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const accQty = normalizeMoney(req.body.accQty, 'accQty');
    const accPrice = normalizeMoney(req.body.accPrice, 'accPrice');
    const accTotal = normalizeMoney(req.body.accTotal, 'accTotal');
    const grandTotal = normalizeMoney(req.body.grandTotal, 'grandTotal');

    const [result] = await mysqlPool.execute(
      `UPDATE travel_requests
       SET acc_qty = ?, acc_price = ?, acc_total = ?, grand_total = ?
       WHERE id = ?`,
      [accQty, accPrice, accTotal, grandTotal, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const [updated] = await mysqlPool.execute('SELECT * FROM travel_requests WHERE id = ?', [id]);
    res.status(200).json(updated[0]);
  }));

  router.patch('/travel-requests/:id', asyncHandler(async (req, res) => {
    requireFields(req.body, ['status']);
    validateAllowed(req.body.status, REQUEST_STATUSES, 'status');

    const { id } = req.params;
    const actorName = normalizeActorName(req.body.approverName || req.body.actorName || req.body.updatedBy);
    const actorCode = normalizeActorName(req.body.employeeCode || req.body.actorCode);
    const comment = normalizeOptionalText(req.body.comment || req.body.approvalComment || req.body.rejectionComment, 1000);
    const signedBy = actorName || actorCode;
    const statusColumns = {
      hr: ['manager_approved_by', 'manager_approved_at'],
      md: ['hr_checked_by', 'hr_checked_at'],
      accounting: ['md_approved_by', 'md_approved_at'],
      completed: ['accounting_paid_by', 'accounting_paid_at'],
      rejected: ['rejected_by', 'rejected_at'],
    };
    const approvalColumns = statusColumns[req.body.status];

    let query = 'UPDATE travel_requests SET status = ?';
    const params = [req.body.status];

    if (approvalColumns && signedBy) {
      query += `, ${approvalColumns[0]} = ?, ${approvalColumns[1]} = NOW()`;
      params.push(signedBy);
    }
    if (comment) {
      query += req.body.status === 'rejected'
        ? ', rejection_comment = ?'
        : ', approval_comment = ?';
      params.push(comment);
    }

    query += ' WHERE id = ?';
    params.push(id);

    const [result] = await mysqlPool.execute(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const [updated] = await mysqlPool.execute('SELECT * FROM travel_requests WHERE id = ?', [id]);
    res.status(200).json(updated[0]);
  }));

  return router;
};

module.exports.REQUEST_STATUSES = REQUEST_STATUSES;
