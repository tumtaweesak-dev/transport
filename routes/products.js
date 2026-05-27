const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid PostgreSQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function quoteQualifiedIdentifier(value) {
  return String(value || 'products')
    .split('.')
    .map((part) => quoteIdentifier(part.trim()))
    .join('.');
}

function sourceColumn(envName, fallback) {
  const value = process.env[envName];
  return value === undefined ? fallback : value.trim();
}

function selectColumn(column, alias, fallback = 'NULL') {
  if (!column) return `${fallback} AS ${alias}`;
  return `${quoteIdentifier(column)} AS ${alias}`;
}

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
  if (allowedDatabases.has(requestedDatabase)) return requestedDatabase;
  return process.env.PG_DATABASE;
}

function parseCodePrefixes(value) {
  return String(value || '')
    .split(',')
    .map((prefix) => prefix.trim().toUpperCase())
    .filter((prefix) => /^[A-Z0-9]{1,10}$/.test(prefix))
    .slice(0, 20);
}

module.exports = function createProductsRouter({ pgPool }) {
  const router = express.Router();

  router.get('/products', asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const codePrefixes = parseCodePrefixes(req.query.codePrefixes);
    const requestedLimit = Number(req.query.limit);
    const limit = String(req.query.limit || '').toLowerCase() === 'all'
      ? null
      : Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 1000)
      : 100;
    const databaseName = resolveDatabase(req);
    const productPool = typeof pgPool.getPoolForDatabase === 'function'
      ? pgPool.getPoolForDatabase(databaseName)
      : pgPool;
    const table = quoteQualifiedIdentifier(process.env.PG_PRODUCT_TABLE || 'products');
    const columns = {
      id: sourceColumn('PG_PRODUCT_ID_COLUMN', 'id'),
      sku: sourceColumn('PG_PRODUCT_SKU_COLUMN', 'sku'),
      name: sourceColumn('PG_PRODUCT_NAME_COLUMN', 'name'),
      unit: sourceColumn('PG_PRODUCT_UNIT_COLUMN', 'unit'),
      weight: sourceColumn('PG_PRODUCT_WEIGHT_COLUMN', 'weight_kg'),
      width: sourceColumn('PG_PRODUCT_WIDTH_COLUMN', 'width_cm'),
      length: sourceColumn('PG_PRODUCT_LENGTH_COLUMN', 'length_cm'),
      height: sourceColumn('PG_PRODUCT_HEIGHT_COLUMN', 'height_cm'),
      stock: sourceColumn('PG_PRODUCT_STOCK_COLUMN', 'stock_qty'),
    };
    const params = [];
    const whereConditions = [];

    if (search) {
      params.push(`%${search}%`);
      whereConditions.push(`(CAST(${quoteIdentifier(columns.sku)} AS TEXT) ILIKE $${params.length} OR CAST(${quoteIdentifier(columns.name)} AS TEXT) ILIKE $${params.length})`);
    }

    if (codePrefixes.length > 0) {
      const prefixParams = codePrefixes.map((prefix) => {
        params.push(`${prefix}%`);
        return `$${params.length}`;
      });
      whereConditions.push(`UPPER(CAST(${quoteIdentifier(columns.sku)} AS TEXT)) LIKE ANY (ARRAY[${prefixParams.join(', ')}])`);
    }

    const where = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    let limitSql = '';
    if (limit !== null) {
      params.push(limit);
      limitSql = `LIMIT $${params.length}`;
    }

    const result = await productPool.query(
      `SELECT ${selectColumn(columns.id, 'id')},
              ${selectColumn(columns.sku, 'sku')},
              ${selectColumn(columns.name, 'name')},
              ${selectColumn(columns.unit, 'unit', `'หน่วย'`)},
              ${selectColumn(columns.weight, 'weight_kg', '0')},
              ${selectColumn(columns.width, 'width_cm', '0')},
              ${selectColumn(columns.length, 'length_cm', '0')},
              ${selectColumn(columns.height, 'height_cm', '0')},
              ${selectColumn(columns.stock, 'stock_qty', '0')}
       FROM ${table}
       ${where}
       ORDER BY ${quoteIdentifier(columns.name)} ASC
       ${limitSql}`,
      params
    );

    res.status(200).json({
      database: databaseName,
      company: req.query.company || null,
      rows: result.rows,
    });
  }));

  return router;
};
