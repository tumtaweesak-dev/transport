require('dotenv').config();

const { ensurePostgresSchema, ensureMysqlSchema } = require('../db/schema');
const pgPool = require('../db/postgres');
const mysqlPool = require('../db/mysql');

async function migrate() {
  await ensurePostgresSchema();
  console.log('PostgreSQL schema is ready.');

  await ensureMysqlSchema();
  console.log('MySQL schema is ready.');
}

migrate()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end().catch(() => {});
    await mysqlPool.end().catch(() => {});
  });
