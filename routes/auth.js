const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');

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

module.exports = function createAuthRouter({ pgPool }) {
  const router = express.Router();

  router.post('/auth/login', asyncHandler(async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' });
    }

    if (username !== password) {
      return res.status(401).json({ error: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const table = quoteQualifiedIdentifier(process.env.PG_AUTH_EMPLOYEE_TABLE || 'security.employee');
    const employeeCodeColumn = quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_CODE_COLUMN || 'employeecode');
    const employeeNameColumn = quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_NAME_COLUMN || 'fullname');
    const employeeCompanyColumn = quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_COMPANY_COLUMN || 'company');
    const employeeBranchColumn = quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_BRANCH_COLUMN || 'branch');
    const employeeDepartmentColumn = quoteIdentifier(process.env.PG_AUTH_EMPLOYEE_DEPARTMENT_COLUMN || 'dept_code');

    const result = await pgPool.query(
      `SELECT ${employeeCodeColumn} AS employee_code,
              ${employeeNameColumn} AS full_name,
              ${employeeCompanyColumn} AS company,
              ${employeeBranchColumn} AS branch,
              ${employeeDepartmentColumn} AS department
       FROM ${table}
       WHERE TRIM(CAST(${employeeCodeColumn} AS TEXT)) = $1
       LIMIT 1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const employee = result.rows[0];
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

  return router;
};
