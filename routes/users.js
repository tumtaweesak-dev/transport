const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireFields } = require('../middleware/validate');
const { hashPassword } = require('../utils/passwords');

let lastEmployeeSyncAt = 0;
const EMPLOYEE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const APPROVAL_MENU_IDS = ['manager-approval', 'hr-approval', 'md-approval', 'accounting-approval'];
const ALLOWED_EMPLOYEE_CODE_PATTERN = '^[15A-Za-z]';

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid PostgreSQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function quoteQualifiedIdentifier(value) {
  return String(value || 'security.employee')
    .split('.')
    .map((part) => quoteIdentifier(part.trim()))
    .join('.');
}

function getEmployeeSourceConfig() {
  return {
    table: quoteQualifiedIdentifier(process.env.PG_AUTH_EMPLOYEE_TABLE || 'security.employee'),
    employeeCodeColumn: quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_CODE_COLUMN || 'employeecode'),
    employeeNameColumn: quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_NAME_COLUMN || 'fullname'),
    employeeBranchColumn: quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_BRANCH_COLUMN || 'branch'),
    employeeDepartmentColumn: quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_DEPARTMENT_COLUMN || 'dept_code'),
  };
}

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

function normalizeRoleMenus(menus) {
  if (!Array.isArray(menus)) return [];
  return [...new Set(menus.map((menu) => String(menu).trim()).filter(Boolean))];
}

function mapRolePermissionRow(row) {
  return {
    employeeId: row.employee_id,
    name: row.employee_name || row.employee_id,
    roleId: row.role_id || '',
    roleName: row.role_name || '',
    menus: normalizeRoleMenus(parseJsonArray(row.menus)),
    updatedAt: row.updated_at,
  };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function syncEmployeesToMysql({ pgPool, mysqlPool }) {
  const now = Date.now();
  if (now - lastEmployeeSyncAt < EMPLOYEE_SYNC_INTERVAL_MS) return;

  const {
    table,
    employeeCodeColumn,
    employeeNameColumn,
    employeeBranchColumn,
    employeeDepartmentColumn,
  } = getEmployeeSourceConfig();
  const syncLimit = Number(process.env.PG_EMPLOYEE_SYNC_LIMIT || 20000);
  const result = await pgPool.query(
    `SELECT TRIM(CAST(${employeeCodeColumn} AS TEXT)) AS employee_id,
            ${employeeNameColumn} AS name,
            ${employeeBranchColumn} AS branch,
            ${employeeDepartmentColumn} AS department,
            NULL AS position
     FROM ${table}
     WHERE ${employeeCodeColumn} IS NOT NULL
       AND TRIM(CAST(${employeeCodeColumn} AS TEXT)) <> ''
     ORDER BY TRIM(CAST(${employeeCodeColumn} AS TEXT)) ASC
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

async function searchEmployees({ pgPool, mysqlPool, search }) {
  const keyword = String(search || '').trim();
  if (!keyword) return null;

  const {
    table,
    employeeCodeColumn,
    employeeNameColumn,
    employeeBranchColumn,
    employeeDepartmentColumn,
  } = getEmployeeSourceConfig();
  const pgResult = await pgPool.query(
    `SELECT TRIM(CAST(${employeeCodeColumn} AS TEXT)) AS employee_id,
            ${employeeNameColumn} AS name,
            ${employeeBranchColumn} AS branch,
            ${employeeDepartmentColumn} AS department,
            NULL AS position,
            'postgres-live' AS record_source,
            0 AS is_edited
     FROM ${table}
     WHERE TRIM(CAST(${employeeCodeColumn} AS TEXT)) ~ $2
       AND (
         TRIM(CAST(${employeeCodeColumn} AS TEXT)) ILIKE $1
         OR ${employeeNameColumn} ILIKE $1
       )
     ORDER BY TRIM(CAST(${employeeCodeColumn} AS TEXT)) ASC
     LIMIT 50`,
    [`%${keyword}%`, ALLOWED_EMPLOYEE_CODE_PATTERN]
  );

  let mysqlRows = [];
  try {
    const mysqlLike = `%${keyword}%`;
    const [rows] = await mysqlPool.execute(
      `SELECT employee_id, name, branch, department, position, record_source, is_edited
       FROM editable_employees
       WHERE (employee_id LIKE ? OR name LIKE ?)
         AND employee_id REGEXP ?
       ORDER BY employee_id ASC
       LIMIT 50`,
      [mysqlLike, mysqlLike, ALLOWED_EMPLOYEE_CODE_PATTERN]
    );
    mysqlRows = rows;
  } catch (error) {
    console.warn('Editable employee search skipped:', error.message);
  }

  const rowsByEmployeeId = new Map();
  [...pgResult.rows, ...mysqlRows].forEach((row) => {
    const employeeId = String(row.employee_id || '').trim();
    if (!employeeId) return;
    rowsByEmployeeId.set(employeeId, row);
  });

  return Array.from(rowsByEmployeeId.values())
    .sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id), 'th'));
}

async function listLoginEmployees({ pgPool, mysqlPool, page = 1, limit = 100 } = {}) {
  const {
    table,
    employeeCodeColumn,
    employeeNameColumn,
    employeeBranchColumn,
    employeeDepartmentColumn,
  } = getEmployeeSourceConfig();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 20), 500);
  const safePage = Math.max(Number(page) || 1, 1);
  const pgResult = await pgPool.query(
    `SELECT TRIM(CAST(${employeeCodeColumn} AS TEXT)) AS employee_id,
            ${employeeNameColumn} AS name,
            ${employeeBranchColumn} AS branch,
            ${employeeDepartmentColumn} AS department,
            NULL AS position,
            'postgres-live' AS record_source,
            0 AS is_edited
     FROM ${table}
     WHERE ${employeeCodeColumn} IS NOT NULL
       AND TRIM(CAST(${employeeCodeColumn} AS TEXT)) <> ''
       AND TRIM(CAST(${employeeCodeColumn} AS TEXT)) ~ $1
     ORDER BY TRIM(CAST(${employeeCodeColumn} AS TEXT)) ASC`,
    [ALLOWED_EMPLOYEE_CODE_PATTERN]
  );

  let mysqlRows = [];
  try {
    const [rows] = await mysqlPool.execute(
      `SELECT employee_id, name, branch, department, position, record_source, is_edited
       FROM editable_employees
       WHERE employee_id REGEXP ?
       ORDER BY employee_id ASC`,
      [ALLOWED_EMPLOYEE_CODE_PATTERN]
    );
    mysqlRows = rows;
  } catch (error) {
    console.warn('Editable employee list skipped:', error.message);
  }

  const rowsByEmployeeId = new Map();
  pgResult.rows.forEach((row) => {
    const employeeId = String(row.employee_id || '').trim();
    if (!employeeId) return;
    rowsByEmployeeId.set(employeeId, row);
  });

  // Login checks editable_employees first, so edited/login-ready rows should win when duplicated.
  mysqlRows.forEach((row) => {
    const employeeId = String(row.employee_id || '').trim();
    if (!employeeId) return;
    rowsByEmployeeId.set(employeeId, row);
  });

  const mergedRows = Array.from(rowsByEmployeeId.values())
    .sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id), 'th'));
  const total = mergedRows.length;
  const offset = (safePage - 1) * safeLimit;

  return {
    rows: mergedRows.slice(offset, offset + safeLimit),
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.max(Math.ceil(total / safeLimit), 1),
  };
}

module.exports = function createUsersRouter({ pgPool, mysqlPool }) {
  const router = express.Router();

  router.post('/users', asyncHandler(async (req, res) => {
    requireFields(req.body, ['employeeId', 'name']);

    const { employeeId, name, branch, department, position, password } = req.body;
    const employeeCode = String(employeeId).trim();
    const passwordValue = String(password || '').trim();
    const passwordHash = passwordValue ? hashPassword(passwordValue) : null;

    await mysqlPool.execute(
      `INSERT INTO editable_employees
         (employee_id, name, branch, department, position, password_hash, password_updated_at, record_source, is_edited)
       VALUES (?, ?, ?, ?, ?, ?, IF(? IS NULL, NULL, CURRENT_TIMESTAMP), 'mysql-edit', 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         branch = COALESCE(VALUES(branch), branch),
         department = COALESCE(VALUES(department), department),
         position = COALESCE(VALUES(position), position),
         password_hash = COALESCE(VALUES(password_hash), password_hash),
         password_updated_at = IF(VALUES(password_hash) IS NULL, password_updated_at, CURRENT_TIMESTAMP),
         record_source = 'mysql-edit',
         is_edited = 1`,
      [
        employeeCode,
        String(name).trim(),
        branch || null,
        department || null,
        position || null,
        passwordHash,
        passwordHash,
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
      const searchedRows = await searchEmployees({ pgPool, mysqlPool, search: req.query.search });
      if (searchedRows) {
        return res.status(200).json(searchedRows);
      }

      const result = await listLoginEmployees({
        pgPool,
        mysqlPool,
        page: req.query.page,
        limit: req.query.limit,
      });
      res.status(200).json(result);
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

  router.get('/employee-role-permissions', asyncHandler(async (req, res) => {
    try {
      const [rows] = await mysqlPool.execute(`
        SELECT employee_id, employee_name, role_id, role_name, menus, updated_at
        FROM employee_role_permissions
        ORDER BY employee_id ASC
      `);
      res.status(200).json(rows.map(mapRolePermissionRow));
    } catch (error) {
      console.warn('Employee role permissions unavailable, returning empty list:', error.message);
      res.status(200).json([]);
    }
  }));

  router.put('/employee-role-permissions/:employeeId', asyncHandler(async (req, res) => {
    const employeeId = String(req.params.employeeId || '').trim();
    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    const employeeName = String(req.body.name || employeeId).trim();
    const roleId = String(req.body.roleId || '').trim();
    const roleName = String(req.body.roleName || '').trim();
    const menus = normalizeRoleMenus(req.body.menus);

    await mysqlPool.execute(
      `INSERT INTO employee_role_permissions (employee_id, employee_name, role_id, role_name, menus)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         employee_name = VALUES(employee_name),
         role_id = VALUES(role_id),
         role_name = VALUES(role_name),
         menus = VALUES(menus)`,
      [employeeId, employeeName, roleId, roleName, JSON.stringify(menus)]
    );

    const [rows] = await mysqlPool.execute(
      `SELECT employee_id, employee_name, role_id, role_name, menus, updated_at
       FROM employee_role_permissions
       WHERE employee_id = ?
       LIMIT 1`,
      [employeeId]
    );

    res.status(200).json(mapRolePermissionRow(rows[0]));
  }));

  router.delete('/employee-role-permissions/:employeeId', asyncHandler(async (req, res) => {
    const employeeId = String(req.params.employeeId || '').trim();
    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    await mysqlPool.execute('DELETE FROM employee_role_permissions WHERE employee_id = ?', [employeeId]);
    res.status(200).json({ success: true, employeeId });
  }));

  return router;
};
