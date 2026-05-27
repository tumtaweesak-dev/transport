const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireFields } = require('../middleware/validate');

let lastEmployeeSyncAt = 0;
const EMPLOYEE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const APPROVAL_MENU_IDS = ['manager-approval', 'hr-approval', 'md-approval', 'accounting-approval'];

function normalizeMenus(menus) {
  if (!Array.isArray(menus)) return [];
  return [...new Set(menus.map((menu) => String(menu).trim()).filter((menu) => APPROVAL_MENU_IDS.includes(menu)))];
}

function parseMenus(value) {
  if (Array.isArray(value)) return normalizeMenus(value);
  if (!value) return [];
  try {
    return normalizeMenus(JSON.parse(value));
  } catch (error) {
    return [];
  }
}

function mapPermissionRow(row) {
  return {
    employeeId: row.employee_id,
    name: row.employee_name || row.employee_id,
    menus: parseMenus(row.menus),
    updatedAt: row.updated_at,
  };
}

async function syncEmployeesToMysql({ pgPool, mysqlPool }) {
  const now = Date.now();
  if (now - lastEmployeeSyncAt < EMPLOYEE_SYNC_INTERVAL_MS) return;

  const syncLimit = Number(process.env.PG_EMPLOYEE_SYNC_LIMIT || 5000);
  const result = await pgPool.query(
    `SELECT TRIM(CAST(employeecode AS TEXT)) AS employee_id,
            fullname AS name,
            branch,
            dept_code AS department,
            NULL AS position
     FROM security.employee
     WHERE employeecode IS NOT NULL
       AND TRIM(CAST(employeecode AS TEXT)) <> ''
     ORDER BY fullname ASC
     LIMIT $1`,
    [syncLimit]
  );

  if (result.rows.length === 0) {
    lastEmployeeSyncAt = now;
    return;
  }

  const values = result.rows.map((row) => [
    row.employee_id,
    row.name || row.employee_id,
    row.branch || null,
    row.department || null,
    row.position || null,
  ]);

  await mysqlPool.query(
    `INSERT INTO editable_employees
       (employee_id, name, branch, department, position, record_source, is_edited)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       name = IF(is_edited = 0, VALUES(name), name),
       branch = IF(is_edited = 0, VALUES(branch), branch),
       department = IF(is_edited = 0, VALUES(department), department),
       position = IF(is_edited = 0, VALUES(position), position),
       record_source = IF(is_edited = 0, 'postgres', record_source)`,
    [values.map((row) => [...row, 'postgres', 0])]
  );

  lastEmployeeSyncAt = now;
}

module.exports = function createUsersRouter({ pgPool, mysqlPool }) {
  const router = express.Router();

  router.post('/users', asyncHandler(async (req, res) => {
    requireFields(req.body, ['employeeId', 'name']);

    const { employeeId, name, branch, department, position } = req.body;
    const employeeCode = String(employeeId).trim();

    await mysqlPool.execute(
      `INSERT INTO editable_employees
         (employee_id, name, branch, department, position, record_source, is_edited)
       VALUES (?, ?, ?, ?, ?, 'mysql-edit', 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         branch = VALUES(branch),
         department = VALUES(department),
         position = VALUES(position),
         record_source = 'mysql-edit',
         is_edited = 1`,
      [
        employeeCode,
        String(name).trim(),
        branch || null,
        department || null,
        position || null,
      ]
    );

    const [rows] = await mysqlPool.execute(
      `SELECT employee_id, name, branch, department, position, record_source, is_edited
       FROM editable_employees
       WHERE employee_id = ?
       LIMIT 1`,
      [employeeCode]
    );

    res.status(201).json(rows[0]);
  }));

  router.get('/users', asyncHandler(async (req, res) => {
    try {
      try {
        await syncEmployeesToMysql({ pgPool, mysqlPool });
      } catch (syncError) {
        console.warn('Employee sync from PostgreSQL skipped, using MySQL copy:', syncError.message);
      }

      const [rows] = await mysqlPool.execute(`
        SELECT employee_id, name, branch, department, position, record_source, is_edited
        FROM editable_employees
        ORDER BY name ASC
        LIMIT 500
      `);
      res.status(200).json(rows);
    } catch (error) {
      console.warn('Users list unavailable, returning empty list:', error.message);
      res.status(200).json([]);
    }
  }));

  router.get('/menu-permissions', asyncHandler(async (req, res) => {
    try {
      const [rows] = await mysqlPool.execute(`
        SELECT employee_id, employee_name, menus, updated_at
        FROM menu_permissions
        ORDER BY employee_id ASC
      `);
      res.status(200).json(rows.map(mapPermissionRow));
    } catch (error) {
      console.warn('Menu permissions unavailable, returning empty list:', error.message);
      res.status(200).json([]);
    }
  }));

  router.put('/menu-permissions/:employeeId', asyncHandler(async (req, res) => {
    const employeeId = String(req.params.employeeId || '').trim();
    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    const menus = normalizeMenus(req.body.menus);
    const employeeName = String(req.body.name || employeeId).trim();

    await mysqlPool.execute(
      `INSERT INTO menu_permissions (employee_id, employee_name, menus)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         employee_name = VALUES(employee_name),
         menus = VALUES(menus)`,
      [employeeId, employeeName, JSON.stringify(menus)]
    );

    const [rows] = await mysqlPool.execute(
      `SELECT employee_id, employee_name, menus, updated_at
       FROM menu_permissions
       WHERE employee_id = ?
       LIMIT 1`,
      [employeeId]
    );

    res.status(200).json(mapPermissionRow(rows[0]));
  }));

  router.delete('/menu-permissions/:employeeId', asyncHandler(async (req, res) => {
    const employeeId = String(req.params.employeeId || '').trim();
    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    await mysqlPool.execute('DELETE FROM menu_permissions WHERE employee_id = ?', [employeeId]);
    res.status(200).json({ success: true, employeeId });
  }));

  return router;
};
