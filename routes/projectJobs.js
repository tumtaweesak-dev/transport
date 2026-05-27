const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');

function normalizeCompanyKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function allowedCompanyDatabases() {
  return {
    AES: process.env.PG_COMPANY_AES_DATABASE || 'aes_sitecontroldb',
    AESCON: process.env.PG_COMPANY_AES_DATABASE || 'aes_sitecontroldb',
    SGE: process.env.PG_COMPANY_SGE_DATABASE || 'sge_sitecontroldb',
    SIAMGLOBALENGINEERING: process.env.PG_COMPANY_SGE_DATABASE || 'sge_sitecontroldb',
  };
}

function resolveDatabase(req) {
  const companyKey = normalizeCompanyKey(req.query.company || req.get('x-company-code'));
  const requestedDatabase = String(req.query.database || req.get('x-company-database') || '').trim();
  const databaseMap = allowedCompanyDatabases();
  const allowedDatabases = new Set(Object.values(databaseMap).filter(Boolean));

  if (databaseMap[companyKey]) return databaseMap[companyKey];
  if (requestedDatabase === 'aescon_sitecontroldb') return databaseMap.AES;
  if (allowedDatabases.has(requestedDatabase)) return requestedDatabase;
  return process.env.PG_DATABASE;
}

module.exports = function createProjectJobsRouter({ pgPool }) {
  const router = express.Router();

  router.get('/project-jobs', asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 1000);
    const databaseName = resolveDatabase(req);
    const projectPool = typeof pgPool.getPoolForDatabase === 'function'
      ? pgPool.getPoolForDatabase(databaseName)
      : pgPool;

    const params = [];
    let where = `
      WHERE COALESCE(activeflag, true) = true
        AND COALESCE(CAST(projectcode AS TEXT), '') <> ''
        AND NOT (
          COALESCE(CAST(projectcode AS TEXT), '') ILIKE '%close%'
          OR COALESCE(CAST(projectcode AS TEXT), '') ILIKE '%closed%'
          OR COALESCE(CAST(projectcode AS TEXT), '') ILIKE '%ปิด%'
          OR COALESCE(CAST(projectname AS TEXT), '') ILIKE '%close%'
          OR COALESCE(CAST(projectname AS TEXT), '') ILIKE '%closed%'
          OR COALESCE(CAST(projectname AS TEXT), '') ILIKE '%ปิด%'
          OR COALESCE(CAST(remark AS TEXT), '') ILIKE '%close%'
          OR COALESCE(CAST(remark AS TEXT), '') ILIKE '%closed%'
          OR COALESCE(CAST(remark AS TEXT), '') ILIKE '%ปิด%'
        )`;

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (
        CAST(projectcode AS TEXT) ILIKE $1
        OR CAST(projectname AS TEXT) ILIKE $1
        OR CAST(remark AS TEXT) ILIKE $1
      )`;
    }

    params.push(limit);
    const result = await projectPool.query(
      `SELECT primaryid AS id,
              projectcode AS code,
              projectname AS name,
              remark,
              brchcode AS branch_code,
              activeflag AS active
       FROM master_data.master_projectjob
       ${where}
       ORDER BY
         CASE WHEN projectcode = '-' THEN 1 ELSE 0 END,
         projectcode ASC,
         projectname ASC
       LIMIT $${params.length}`,
      params
    );

    res.status(200).json({
      database: databaseName,
      rows: result.rows,
    });
  }));

  return router;
};
