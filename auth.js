const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { hashPassword, verifyPassword } = require('../utils/passwords');

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

function getEmployeeAuthConfig() {
  return {
    table: quoteQualifiedIdentifier(process.env.PG_AUTH_EMPLOYEE_TABLE || 'security.employee'),
    employeeCodeColumn: quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_CODE_COLUMN || 'employeecode'),
    employeeNameColumn: quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_NAME_COLUMN || 'fullname'),
    employeeCompanyColumn: quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_COMPANY_COLUMN || 'company'),
    employeeBranchColumn: quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_BRANCH_COLUMN || 'branch'),
    employeeDepartmentColumn: quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_DEPARTMENT_COLUMN || 'dept_code'),
  };
}

async function findEmployeeByCode(pgPool, employeeCode) {
  const {
    table,
    employeeCodeColumn,
    employeeNameColumn,
    employeeCompanyColumn,
    employeeBranchColumn,
    employeeDepartmentColumn,
  } = getEmployeeAuthConfig();

  const result = await pgPool.query(
    `SELECT ${employeeCodeColumn} AS employee_code,
            ${employeeNameColumn} AS full_name,
            ${employeeCompanyColumn} AS company,
            ${employeeBranchColumn} AS branch,
            ${employeeDepartmentColumn} AS department
     FROM ${table}
     WHERE TRIM(CAST(${employeeCodeColumn} AS TEXT)) = $1
     LIMIT 1`,
    [employeeCode]
  );

  return result.rows[0] || null;
}

function mapMysqlEmployee(row) {
  if (!row) return null;
  return {
    employee_code: row.employee_id,
    full_name: row.name || row.employee_id,
    company: null,
    branch: row.branch || null,
    department: row.department || null,
  };
}

async function findEditableEmployeeByCode(mysqlPool, employeeCode) {
  const [rows] = await mysqlPool.execute(
    `SELECT employee_id, name, branch, department, position, password_hash
     FROM editable_employees
     WHERE employee_id = ?
     LIMIT 1`,
    [employeeCode]
  );
  return rows[0] || null;
}

module.exports = function createAuthRouter({ pgPool, mysqlPool }) {
  const router = express.Router();

  router.post('/auth/login', asyncHandler(async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' });
    }

    const editableEmployee = await findEditableEmployeeByCode(mysqlPool, username);
    let employee = editableEmployee ? mapMysqlEmployee(editableEmployee) : null;

    if (editableEmployee?.password_hash) {
      if (!verifyPassword(password, editableEmployee.password_hash)) {
        return res.status(401).json({ error: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง' });
      }
    } else {
      if (username !== password) {
        return res.status(401).json({ error: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง' });
      }

      employee = await findEmployeeByCode(pgPool, username) || employee;
    }

    if (!employee) {
      return res.status(401).json({ error: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง' });
    }

    return res.status(200).json({
      success: true,
      loginAt: new Date().toISOString(),
      user: {
        employeeCode: employee.employee_code,
        name: employee.full_name || employee.employee_code,
        company: employee.company || null,
        branch: employee.branch || null,
        department: employee.department || null,
      },
    });
  }));

  router.post('/auth/reset-password', asyncHandler(async (req, res) => {
    const username = String(req.body?.username || '').trim();

    if (!username) {
      return res.status(400).json({ error: 'กรุณาระบุรหัสพนักงาน' });
    }

    const employee = await findEmployeeByCode(pgPool, username);
    const editableEmployee = await findEditableEmployeeByCode(mysqlPool, username);
    if (!employee && !editableEmployee) {
      return res.status(404).json({ error: 'ไม่พบรหัสพนักงานนี้ในฐานข้อมูล' });
    }

    await mysqlPool.execute(
      `INSERT INTO editable_employees
         (employee_id, name, branch, department, position, password_hash, password_updated_at, record_source, is_edited)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'mysql-edit', 1)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         password_updated_at = CURRENT_TIMESTAMP,
         name = COALESCE(name, VALUES(name)),
         branch = COALESCE(branch, VALUES(branch)),
         department = COALESCE(department, VALUES(department))`,
      [
        username,
        employee?.full_name || editableEmployee?.name || username,
        employee?.branch || editableEmployee?.branch || null,
        employee?.department || editableEmployee?.department || null,
        editableEmployee?.position || null,
        hashPassword(username),
      ]
    );

    return res.status(200).json({
      success: true,
      employeeCode: employee?.employee_code || editableEmployee.employee_id,
      message: 'รีเซ็ตรหัสผ่านแล้ว ใช้รหัสพนักงานเป็นรหัสผ่าน',
    });
  }));

  return router;
};
