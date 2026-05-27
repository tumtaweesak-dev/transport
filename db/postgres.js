const { Pool } = require('pg');

function getSslConfig(connectionString) {
  const value = String(process.env.PG_SSL || process.env.PG_SSLMODE || '').toLowerCase();
  const disabled = ['0', 'false', 'no', 'disable'].includes(value);

  if (disabled) return undefined;
  if (['1', 'true', 'yes', 'require'].includes(value)) {
    return { rejectUnauthorized: false };
  }

  if (connectionString && /[?&]sslmode=(require|prefer|verify-ca|verify-full)/i.test(connectionString)) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

const connectionString = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
const ssl = getSslConfig(connectionString);
const defaultDatabase = process.env.PG_DATABASE;
const poolsByDatabase = new Map();
const readOnlyConnectionOptions = '-c default_transaction_read_only=on';

function getQueryText(query) {
  if (typeof query === 'string') return query;
  if (query && typeof query.text === 'string') return query.text;
  return '';
}

function isReadOnlyQuery(query) {
  const text = getQueryText(query).trim();
  return /^(SELECT|SHOW|EXPLAIN)\b/i.test(text);
}

function readOnlyError() {
  const error = new Error('PostgreSQL is read-only in this app. Load/read operations only.');
  error.code = 'PG_READ_ONLY_GUARD';
  return error;
}

function rejectReadOnly(callback) {
  const error = readOnlyError();
  if (typeof callback === 'function') {
    process.nextTick(() => callback(error));
    return undefined;
  }
  return Promise.reject(error);
}

function guardQueryOwner(owner) {
  const originalQuery = owner.query.bind(owner);
  owner.query = function guardedPostgresQuery(query, values, callback) {
    const actualCallback = typeof values === 'function' ? values : callback;
    if (!isReadOnlyQuery(query)) {
      return rejectReadOnly(actualCallback);
    }
    return originalQuery(query, values, callback);
  };
  return owner;
}

function applyReadOnlyGuard(pool) {
  guardQueryOwner(pool);
  return pool;
}

function getConnectionStringForDatabase(databaseName) {
  if (!connectionString || !databaseName) return connectionString;

  try {
    const url = new URL(connectionString);
    url.pathname = `/${databaseName}`;
    return url.toString();
  } catch (error) {
    return connectionString;
  }
}

function createPool(databaseName = defaultDatabase) {
  const poolConnectionString = getConnectionStringForDatabase(databaseName);
  const pool = new Pool(poolConnectionString
    ? {
        connectionString: poolConnectionString,
        ssl,
        options: readOnlyConnectionOptions,
      }
    : {
        user: process.env.PG_USER,
        host: process.env.PG_HOST,
        database: databaseName,
        password: process.env.PG_PASSWORD,
        port: process.env.PG_PORT,
        ssl,
        options: readOnlyConnectionOptions,
      });
  return applyReadOnlyGuard(pool);
}

const pgPool = createPool(defaultDatabase);

pgPool.getPoolForDatabase = function getPoolForDatabase(databaseName) {
  const normalizedDatabaseName = String(databaseName || defaultDatabase || '').trim();
  if (!normalizedDatabaseName || normalizedDatabaseName === defaultDatabase) {
    return pgPool;
  }

  if (!poolsByDatabase.has(normalizedDatabaseName)) {
    poolsByDatabase.set(normalizedDatabaseName, createPool(normalizedDatabaseName));
  }

  return poolsByDatabase.get(normalizedDatabaseName);
};

module.exports = pgPool;
