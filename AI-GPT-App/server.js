const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const aiEnv = require('dotenv').config({ path: path.join(__dirname, '.env'), override: false }).parsed || {};
for (const [key, value] of Object.entries(aiEnv)) {
  if (key === 'PORT' || key === 'HOST') continue;
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}

const app = express();
const port = process.env.PORT || 3100;
const host = process.env.HOST || '0.0.0.0';
const publicBasePath = process.env.AI_GPT_PUBLIC_BASE_PATH || '';
const dataDir = path.join(__dirname, 'data');
const generatedImagesDir = path.join(dataDir, 'generated-images');
const usersFile = path.join(dataDir, 'users.json');
const sessions = new Map();
const resetTokens = new Map();

let mysqlPool = null;

app.use(express.json({ limit: '40mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/generated-images', express.static(generatedImagesDir));

function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function quoteMysqlIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid MySQL identifier: ${value}`);
  }
  return `\`${value}\``;
}

function getUsersTableName() {
  return quoteMysqlIdentifier(process.env.MYSQL_USERS_TABLE || 'ai_users');
}

function hasMysqlConfig() {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

async function getMysqlPool() {
  if (!hasMysqlConfig()) return null;
  if (mysqlPool) return mysqlPool;

  const mysql = require('mysql2/promise');
  mysqlPool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    ...(process.env.MYSQL_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  await ensureMysqlUserSchema();
  return mysqlPool;
}

async function ensureMysqlUserSchema() {
  if (!mysqlPool) return;
  const table = getUsersTableName();
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(80) NOT NULL UNIQUE,
      display_name VARCHAR(180) NOT NULL,
      employee_id VARCHAR(80) NOT NULL DEFAULT '',
      role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
      active TINYINT(1) NOT NULL DEFAULT 1,
      password_hash VARCHAR(128) NOT NULL,
      password_salt VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_ai_users_username (username),
      INDEX idx_ai_users_employee_id (employee_id),
      INDEX idx_ai_users_active (active)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  const [employeeColumns] = await mysqlPool.query(`SHOW COLUMNS FROM ${table} LIKE 'employee_id'`);
  if (!employeeColumns.length) {
    await mysqlPool.query(`ALTER TABLE ${table} ADD COLUMN employee_id VARCHAR(80) NOT NULL DEFAULT '' AFTER display_name`);
  }

  const [employeeIndexes] = await mysqlPool.query(`SHOW INDEX FROM ${table} WHERE Key_name = 'idx_ai_users_employee_id'`);
  if (!employeeIndexes.length) {
    await mysqlPool.query(`CREATE INDEX idx_ai_users_employee_id ON ${table} (employee_id)`);
  }
}

function readJsonUsersStore() {
  try {
    if (!fs.existsSync(usersFile)) {
      return { users: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
    };
  } catch (error) {
    console.warn('Unable to read users store:', error.message);
    return { users: [] };
  }
}

function writeJsonUsersStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(usersFile, JSON.stringify(store, null, 2), 'utf8');
}

function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    employeeId: row.employee_id || '',
    role: row.role,
    active: Boolean(row.active),
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function userToSqlParams(user) {
  return [
    user.id,
    user.username,
    user.displayName,
    user.employeeId || '',
    user.role,
    user.active === false ? 0 : 1,
    user.passwordHash,
    user.passwordSalt,
    user.createdAt.slice(0, 19).replace('T', ' '),
    user.updatedAt.slice(0, 19).replace('T', ' '),
  ];
}

async function listUsers() {
  const pool = await getMysqlPool();
  if (!pool) {
    return readJsonUsersStore().users;
  }

  const [rows] = await pool.query(`SELECT * FROM ${getUsersTableName()} ORDER BY created_at ASC`);
  return rows.map(rowToUser);
}

async function findUserById(id) {
  const pool = await getMysqlPool();
  if (!pool) {
    return readJsonUsersStore().users.find((user) => user.id === id) || null;
  }

  const [rows] = await pool.query(`SELECT * FROM ${getUsersTableName()} WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

async function findUserByUsername(username) {
  const pool = await getMysqlPool();
  if (!pool) {
    return readJsonUsersStore().users.find((user) => user.username === username) || null;
  }

  const [rows] = await pool.query(`SELECT * FROM ${getUsersTableName()} WHERE username = ? LIMIT 1`, [username]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

async function findUserByEmployeeId(employeeId) {
  if (!employeeId) return null;

  const pool = await getMysqlPool();
  if (!pool) {
    return readJsonUsersStore().users.find((user) => user.employeeId === employeeId) || null;
  }

  const [rows] = await pool.query(`SELECT * FROM ${getUsersTableName()} WHERE employee_id = ? LIMIT 1`, [employeeId]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

async function insertUser(user) {
  const pool = await getMysqlPool();
  if (!pool) {
    const store = readJsonUsersStore();
    store.users.push(user);
    writeJsonUsersStore(store);
    return;
  }

  await pool.query(
    `INSERT INTO ${getUsersTableName()}
      (id, username, display_name, employee_id, role, active, password_hash, password_salt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userToSqlParams(user)
  );
}

async function updateUserPassword(userId, password) {
  const passwordData = hashPassword(password);
  const updatedAt = new Date().toISOString();
  const pool = await getMysqlPool();

  if (!pool) {
    const store = readJsonUsersStore();
    const user = store.users.find((item) => item.id === userId);
    if (!user) return false;
    user.passwordHash = passwordData.hash;
    user.passwordSalt = passwordData.salt;
    user.updatedAt = updatedAt;
    writeJsonUsersStore(store);
    return true;
  }

  const [result] = await pool.query(
    `UPDATE ${getUsersTableName()}
     SET password_hash = ?, password_salt = ?, updated_at = ?
     WHERE id = ?`,
    [passwordData.hash, passwordData.salt, updatedAt.slice(0, 19).replace('T', ' '), userId]
  );
  return result.affectedRows > 0;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    employeeId: user.employeeId || '',
    role: user.role,
    active: user.active !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmployeeId(value) {
  return String(value || '').trim();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  const { hash } = hashPassword(password, user.passwordSalt);
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = Buffer.from(hash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
  });
  return token;
}

function createResetToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  resetTokens.set(token, {
    userId: user.id,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return token;
}

function consumeResetToken(token) {
  const reset = token ? resetTokens.get(token) : null;
  if (!reset) return null;
  resetTokens.delete(token);
  if (reset.expiresAt < Date.now()) return null;
  return reset.userId;
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function getSessionUser(req) {
  const token = getBearerToken(req);
  const session = token ? sessions.get(token) : null;
  if (!session) return null;

  const user = await findUserById(session.userId);
  return user && user.active !== false ? user : null;
}

async function requireAuth(req, res, next) {
  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  }
  next();
}

function validateUserInput({ username, password, displayName, employeeId }) {
  if (!username || username.length < 3) {
    return 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร';
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดกลาง และขีดล่าง';
  }
  if (!displayName || displayName.length < 2) {
    return 'ชื่อ-นามสกุลต้องมีอย่างน้อย 2 ตัวอักษร';
  }
  if (!employeeId) {
    return 'กรุณากรอกรหัสพนักงาน';
  }
  if (employeeId.length > 80) {
    return 'รหัสพนักงานต้องไม่เกิน 80 ตัวอักษร';
  }
  if (!password || password.length < 6) {
    return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  }
  return '';
}

function buildUser({ username, displayName, employeeId, password, role }) {
  const passwordData = hashPassword(password);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    username,
    displayName,
    employeeId,
    role,
    active: true,
    passwordHash: passwordData.hash,
    passwordSalt: passwordData.salt,
    createdAt: now,
    updatedAt: now,
  };
}

app.get('/api/status', (req, res) => {
  const openAiModel = process.env.OPENAI_MODEL || 'gpt-5';
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  const defaultProvider = process.env.AI_PROVIDER === 'gemini' ? 'gemini' : 'openai';

  res.json({
    configured: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
    model: defaultProvider === 'gemini' ? geminiModel : openAiModel,
    defaultProvider,
    providers: {
      openai: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        model: openAiModel,
      },
      gemini: {
        configured: Boolean(process.env.GEMINI_API_KEY),
        model: geminiModel,
      },
      imageEdit: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        model: imageModel,
      },
      imageGenerate: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        model: imageModel,
      },
    },
    userStorage: hasMysqlConfig() ? 'mysql' : 'json',
  });
});

app.get('/api/auth/status', asyncHandler(async (req, res) => {
  const users = await listUsers();
  const user = await getSessionUser(req);
  res.json({
    hasUsers: users.length > 0,
    authenticated: Boolean(user),
    user: user ? publicUser(user) : null,
    userStorage: hasMysqlConfig() ? 'mysql' : 'json',
  });
}));

app.post('/api/auth/setup', asyncHandler(async (req, res) => {
  const users = await listUsers();
  if (users.length > 0) {
    return res.status(409).json({ error: 'ระบบมีผู้ใช้แล้ว กรุณาเข้าสู่ระบบ' });
  }

  const username = normalizeUsername(req.body?.username);
  const displayName = String(req.body?.displayName || '').trim();
  const employeeId = normalizeEmployeeId(req.body?.employeeId);
  const password = String(req.body?.password || '');
  const validationError = validateUserInput({ username, password, displayName, employeeId });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const user = buildUser({ username, displayName, employeeId, password, role: 'admin' });
  await insertUser(user);

  const token = createSession(user);
  res.status(201).json({ token, user: publicUser(user) });
}));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const users = await listUsers();
  const username = normalizeUsername(req.body?.username);
  const displayName = String(req.body?.displayName || '').trim();
  const employeeId = normalizeEmployeeId(req.body?.employeeId);
  const password = String(req.body?.password || '');
  const validationError = validateUserInput({ username, password, displayName, employeeId });

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  if (await findUserByUsername(username)) {
    return res.status(409).json({ error: 'User นี้มีอยู่แล้ว' });
  }
  if (await findUserByEmployeeId(employeeId)) {
    return res.status(409).json({ error: 'รหัสพนักงานนี้มีอยู่แล้ว' });
  }

  const user = buildUser({
    username,
    displayName,
    employeeId,
    password,
    role: users.length ? 'user' : 'admin',
  });
  await insertUser(user);
  res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const user = await findUserByUsername(username);

  if (!user || user.active === false || !verifyPassword(password, user)) {
    return res.status(401).json({ error: 'User หรือ Password ไม่ถูกต้อง' });
  }

  const token = createSession(user);
  res.json({ token, user: publicUser(user) });
}));

app.post('/api/auth/forgot-password/check', asyncHandler(async (req, res) => {
  const employeeId = normalizeEmployeeId(req.body?.employeeId);
  const user = await findUserByEmployeeId(employeeId);

  if (!user || user.active === false) {
    return res.status(404).json({ error: 'ไม่พบรหัสพนักงานนี้' });
  }

  res.json({ resetToken: createResetToken(user) });
}));

app.post('/api/auth/reset-password', asyncHandler(async (req, res) => {
  const resetToken = String(req.body?.resetToken || '').trim();
  const password = String(req.body?.password || '');
  const userId = consumeResetToken(resetToken);

  if (!userId) {
    return res.status(400).json({ error: 'ลิงก์ตั้งรหัสผ่านหมดอายุ กรุณาทำรายการใหม่' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }

  const updated = await updateUserPassword(userId, password);
  if (!updated) {
    return res.status(404).json({ error: 'ไม่พบผู้ใช้สำหรับตั้งรหัสผ่านใหม่' });
  }

  res.json({ success: true });
}));

app.post('/api/auth/logout', (req, res) => {
  const token = getBearerToken(req);
  if (token) sessions.delete(token);
  res.json({ success: true });
});

app.get('/api/users', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const users = await listUsers();
  res.json({ users: users.map(publicUser) });
}));

app.post('/api/users', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const displayName = String(req.body?.displayName || '').trim();
  const employeeId = normalizeEmployeeId(req.body?.employeeId);
  const password = String(req.body?.password || '');
  const role = req.body?.role === 'admin' ? 'admin' : 'user';
  const validationError = validateUserInput({ username, password, displayName, employeeId });

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  if (await findUserByUsername(username)) {
    return res.status(409).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
  }
  if (await findUserByEmployeeId(employeeId)) {
    return res.status(409).json({ error: 'รหัสพนักงานนี้มีอยู่แล้ว' });
  }

  const user = buildUser({ username, displayName, employeeId, password, role });
  await insertUser(user);
  res.status(201).json({ user: publicUser(user) });
}));

const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARS_PER_FILE = 12000;
const MAX_EXTRACTED_CHARS_TOTAL = 42000;

function getExtension(name = '') {
  return path.extname(String(name).toLowerCase()).replace('.', '');
}

function truncateText(text, maxChars = MAX_EXTRACTED_CHARS_PER_FILE) {
  const normalized = String(text || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars)}\n\n[ตัดข้อความออกเพราะไฟล์ยาวเกิน ${maxChars} ตัวอักษร]`
    : normalized;
}

function decodeXmlEntities(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function xmlToText(xml = '') {
  return decodeXmlEntities(String(xml).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseZipEntries(buffer) {
  const entries = new Map();
  let eocdOffset = -1;

  for (let index = buffer.length - 22; index >= 0 && index > buffer.length - 66000; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }

  if (eocdOffset < 0) return entries;

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString('utf8');

    if (buffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.slice(dataStart, dataStart + compressedSize);
      let data = Buffer.alloc(0);

      if (method === 0) data = compressed;
      if (method === 8) data = zlib.inflateRawSync(compressed);
      entries.set(name, data);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function extractDocxText(buffer) {
  const entries = parseZipEntries(buffer);
  const documentXml = entries.get('word/document.xml');
  if (!documentXml) return '';

  const xml = documentXml.toString('utf8');
  const paragraphs = [...xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => [...match[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((item) => decodeXmlEntities(item[1])).join(''))
    .filter(Boolean);

  return paragraphs.join('\n');
}

function extractXlsxText(buffer) {
  const entries = parseZipEntries(buffer);
  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  const sharedStrings = [...sharedXml.matchAll(/<si[\s\S]*?<\/si>/g)].map((match) => xmlToText(match[0]));
  const output = [];

  [...entries.entries()]
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .slice(0, 12)
    .forEach(([name, data]) => {
      const rows = [];
      const xml = data.toString('utf8');

      [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 250).forEach((rowMatch) => {
        const cells = [...rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)]
          .map((cellMatch) => {
            const attrs = cellMatch[1];
            const body = cellMatch[2];
            const type = /t="([^"]+)"/.exec(attrs)?.[1] || '';
            const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || xmlToText(body);
            if (!value) return '';
            if (type === 's') return sharedStrings[Number(value)] || value;
            return decodeXmlEntities(value);
          })
          .filter(Boolean);
        if (cells.length) rows.push(cells.join(' | '));
      });

      if (rows.length) output.push(`${name}\n${rows.join('\n')}`);
    });

  return output.join('\n\n');
}

function decodePdfLiteral(value = '') {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function extractPdfTextFromChunk(chunk = '') {
  const text = [];
  const literalPattern = /\((?:\\.|[^\\)])*\)\s*(?:Tj|'|")/g;
  const arrayPattern = /\[((?:.|\n|\r)*?)\]\s*TJ/g;
  const hexPattern = /<([0-9a-fA-F\s]+)>\s*Tj/g;
  let match;

  while ((match = literalPattern.exec(chunk))) {
    text.push(decodePdfLiteral(match[0].replace(/\)\s*(?:Tj|'|")$/, '').slice(1)));
  }
  while ((match = arrayPattern.exec(chunk))) {
    const parts = [...match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)]
      .map((item) => decodePdfLiteral(item[0].slice(1, -1)));
    if (parts.length) text.push(parts.join(''));
  }
  while ((match = hexPattern.exec(chunk))) {
    try {
      const hexBuffer = Buffer.from(match[1].replace(/\s+/g, ''), 'hex');
      text.push(hexBuffer.includes(0) ? hexBuffer.toString('utf16le') : hexBuffer.toString('latin1'));
    } catch (error) {
      // Ignore malformed hex text in PDFs.
    }
  }

  return text.join('\n');
}

function extractPdfText(buffer) {
  const raw = buffer.toString('latin1');
  const chunks = [raw];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;

  while ((match = streamPattern.exec(raw))) {
    const streamBuffer = Buffer.from(match[1], 'latin1');
    try {
      chunks.push(zlib.inflateSync(streamBuffer).toString('latin1'));
    } catch (error) {
      try {
        chunks.push(zlib.inflateRawSync(streamBuffer).toString('latin1'));
      } catch (innerError) {
        // Not every PDF stream is text or Flate-compressed.
      }
    }
  }

  return chunks.map(extractPdfTextFromChunk).filter(Boolean).join('\n');
}

function extractTextAttachment(buffer, attachment) {
  const mime = String(attachment.type || '').toLowerCase();
  const ext = getExtension(attachment.name);

  if (mime.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'sql', 'log'].includes(ext)) {
    return buffer.toString('utf8');
  }
  if (mime === 'application/pdf' || ext === 'pdf') return extractPdfText(buffer);
  if (ext === 'docx') return extractDocxText(buffer);
  if (ext === 'xlsx') return extractXlsxText(buffer);
  if (ext === 'svg') return buffer.toString('utf8');
  return '';
}

function getImageMimeType(attachment) {
  const mime = String(attachment.type || '').toLowerCase();
  if (mime.startsWith('image/')) return mime;

  const ext = getExtension(attachment.name);
  const byExtension = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    heic: 'image/heic',
    heif: 'image/heif',
  };

  return byExtension[ext] || '';
}

function getEditableImageMimeType(attachment) {
  const mime = getImageMimeType(attachment);
  if (['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return mime;
  return '';
}

function normalizeAttachments(rawAttachments) {
  const attachments = Array.isArray(rawAttachments) ? rawAttachments.slice(0, MAX_ATTACHMENTS) : [];

  return attachments.map((item) => {
    const name = String(item?.name || 'ไฟล์แนบ').slice(0, 180);
    const type = String(item?.type || 'application/octet-stream').slice(0, 120);
    const data = String(item?.data || '');
    const buffer = Buffer.from(data, 'base64');

    if (!data || buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${name} ไม่มีข้อมูลไฟล์หรือไฟล์ใหญ่เกิน ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`);
    }

    return {
      name,
      type,
      size: Number(item?.size || buffer.length),
      data,
      buffer,
    };
  });
}

function buildAttachmentContext(attachments) {
  const imageParts = [];
  const fileNotes = [];
  let totalChars = 0;

  attachments.forEach((attachment, index) => {
    const header = `ไฟล์ ${index + 1}: ${attachment.name} (${attachment.type || 'unknown'}, ${attachment.size} bytes)`;

    const imageMimeType = getImageMimeType(attachment);
    if (imageMimeType) {
      imageParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${imageMimeType};base64,${attachment.data}`,
          detail: 'auto',
        },
      });
      fileNotes.push(`${header}\n[ส่งเป็นรูปภาพให้ AI วิเคราะห์แล้ว]`);
      return;
    }

    const extracted = truncateText(extractTextAttachment(attachment.buffer, attachment));
    if (extracted) {
      const available = Math.max(0, MAX_EXTRACTED_CHARS_TOTAL - totalChars);
      const clipped = extracted.slice(0, available);
      totalChars += clipped.length;
      fileNotes.push(`${header}\nเนื้อหาที่ดึงได้:\n${clipped}`);
      return;
    }

    fileNotes.push(`${header}\n[แนบไฟล์ได้แล้ว แต่ยังดึงเนื้อหาจากไฟล์ชนิดนี้ไม่ได้ในระบบปัจจุบัน]`);
  });

  return {
    imageParts,
    text: fileNotes.length ? `\n\nข้อมูลไฟล์แนบ:\n${fileNotes.join('\n\n')}` : '',
  };
}

function normalizeMessages(rawMessages, fallbackMessage) {
  const messages = Array.isArray(rawMessages) ? rawMessages : [];
  const normalized = messages
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim(),
    }))
    .filter((item) => item.content)
    .slice(-24);

  if (!normalized.length && fallbackMessage) {
    normalized.push({ role: 'user', content: fallbackMessage });
  }

  return normalized;
}

const SYSTEM_PROMPT = [
  'คุณเป็นผู้ช่วย AI ส่วนตัวของผู้ใช้ในเว็บแอปนี้',
  'ตอบเป็นภาษาไทยเป็นหลัก ยกเว้นผู้ใช้ขอภาษาอื่น',
  'จำบริบทจากข้อความก่อนหน้าในบทสนทนาเดียวกัน',
  'เมื่อผู้ใช้แนบไฟล์ ให้ใช้เนื้อหาไฟล์หรือรูปภาพที่ได้รับมาตอบคำถามอย่างละเอียด',
  'ตอบให้ชัดเจน ลงมือใช้ได้จริง และจัดรูปแบบให้อ่านง่าย',
].join(' ');

function normalizeAiProvider(provider) {
  if (provider === 'gemini') return 'gemini';
  if (provider === 'openai') return 'openai';
  return process.env.AI_PROVIDER === 'gemini' ? 'gemini' : 'openai';
}

function buildOpenAiMessages(messages, attachments) {
  const attachmentContext = buildAttachmentContext(attachments);
  const openAiMessages = messages.map((item) => ({ ...item }));

  if (attachments.length) {
    const lastUserIndex = Math.max(0, openAiMessages.map((item) => item.role).lastIndexOf('user'));
    const baseText = `${openAiMessages[lastUserIndex].content || ''}${attachmentContext.text}`;
    openAiMessages[lastUserIndex].content = attachmentContext.imageParts.length
      ? [{ type: 'text', text: baseText || 'ช่วยวิเคราะห์รูปภาพ/ไฟล์ที่แนบให้หน่อย' }, ...attachmentContext.imageParts]
      : baseText;
  }

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...openAiMessages,
  ];
}

function buildGeminiImageParts(attachments) {
  return attachments
    .map((attachment) => {
      const mimeType = getImageMimeType(attachment);
      if (!mimeType) return null;
      return {
        inlineData: {
          mimeType,
          data: attachment.data,
        },
      };
    })
    .filter(Boolean);
}

function buildGeminiContents(messages, attachments) {
  const attachmentContext = buildAttachmentContext(attachments);
  const geminiMessages = messages.map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.content }],
  }));

  if (attachments.length) {
    const lastUserIndex = Math.max(0, geminiMessages.map((item) => item.role).lastIndexOf('user'));
    const baseText = `${messages[lastUserIndex]?.content || ''}${attachmentContext.text}`;
    geminiMessages[lastUserIndex] = {
      role: 'user',
      parts: [
        { text: baseText || 'ช่วยวิเคราะห์รูปภาพ/ไฟล์ที่แนบให้หน่อย' },
        ...buildGeminiImageParts(attachments),
      ],
    };
  }

  return geminiMessages;
}

function extractGeminiAnswer(payload) {
  return (payload?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function callOpenAi(messages, attachments, signal) {
  const model = process.env.OPENAI_MODEL || 'gpt-5';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      reasoning_effort: 'minimal',
      messages: buildOpenAiMessages(messages, attachments),
      max_completion_tokens: 2000,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'เรียก OpenAI ไม่สำเร็จ');
    error.status = response.status;
    throw error;
  }

  return {
    answer: payload?.choices?.[0]?.message?.content?.trim() || 'AI ไม่ได้ส่งข้อความกลับมา',
    model: payload.model || model,
    usage: payload.usage || null,
  };
}

async function callGemini(messages, attachments, signal) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: buildGeminiContents(messages, attachments),
      generationConfig: {
        maxOutputTokens: 2000,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'เรียก Gemini ไม่สำเร็จ');
    error.status = response.status;
    throw error;
  }

  return {
    answer: extractGeminiAnswer(payload) || 'Gemini ไม่ได้ส่งข้อความกลับมา',
    model,
    usage: payload.usageMetadata || null,
  };
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function readSsePayloads(body, onPayload) {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary = buffer.indexOf('\n\n');

    while (boundary !== -1) {
      const block = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      if (!block) continue;
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');

      if (data) await onPayload(data);
    }
  }

  buffer += decoder.decode();
  const leftover = buffer.trim();
  if (leftover) {
    const data = leftover
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (data) await onPayload(data);
  }
}

function extractOpenAiDelta(payload) {
  const content = payload?.choices?.[0]?.delta?.content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || part?.text?.value || '').join('');
  }
  return content || '';
}

async function streamOpenAi(messages, attachments, signal, onDelta) {
  const model = process.env.OPENAI_MODEL || 'gpt-5';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      reasoning_effort: 'minimal',
      messages: buildOpenAiMessages(messages, attachments),
      max_completion_tokens: 2000,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.error?.message || 'เรียก OpenAI ไม่สำเร็จ');
    error.status = response.status;
    throw error;
  }

  let streamedModel = model;
  await readSsePayloads(response.body, async (data) => {
    if (data === '[DONE]') return;
    const payload = JSON.parse(data);
    streamedModel = payload.model || streamedModel;
    const delta = extractOpenAiDelta(payload);
    if (delta) onDelta(delta);
  });

  return { model: streamedModel };
}

async function streamGemini(messages, attachments, signal, onDelta) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: buildGeminiContents(messages, attachments),
      generationConfig: {
        maxOutputTokens: 2000,
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.error?.message || 'เรียก Gemini ไม่สำเร็จ');
    error.status = response.status;
    throw error;
  }

  await readSsePayloads(response.body, async (data) => {
    const payload = JSON.parse(data);
    const delta = extractGeminiAnswer(payload);
    if (delta) onDelta(delta);
  });

  return { model };
}

function sanitizeFileName(value = 'image') {
  return String(value)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'image';
}

function getOutputExtension(mimeType = 'image/png') {
  if (mimeType.includes('jpeg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  return 'png';
}

function buildTargetSizeInstruction(targetSize) {
  if (!targetSize?.width || !targetSize?.height) return '';
  return [
    `Target canvas: ${targetSize.width}x${targetSize.height}px.`,
    'Compose the image for this aspect ratio and keep important content inside the visible frame.',
    'The app may export the final download on this exact canvas size.',
  ].join(' ');
}

function normalizeImageTargetSize(value) {
  const width = Number(value?.width || 0);
  const height = Number(value?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 128 || height < 128 || width > 4096 || height > 4096) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

function buildImageEditPrompt(mode, userPrompt, targetSize) {
  const instruction = String(userPrompt || '').trim();
  const presets = {
    '3d-design': [
      'Edit the provided image as a 3D design or 3D render reference.',
      'Prioritize believable geometry, perspective, proportions, materials, textures, lighting, shadows, and camera angle.',
      'Keep the main subject faithful unless the user explicitly asks to redesign it.',
      'Do not force white-background or square-output styling unless the user requests it.',
      'Make the result useful for 3D concept design, presentation, modeling reference, or render review.',
      'Keep the 3D design editable in concept: clear forms, separated visual layers, readable structure, and room for future revision notes.',
    ],
    'white-bg': [
      'Edit the provided image with a clean pure white #FFFFFF background because the user requested a white background.',
      'Keep the exact subject shape, materials, proportions, logos, labels, and real colors.',
      'Add only a subtle natural contact shadow when it helps the subject sit realistically.',
      'Improve exposure, clarity, edge cleanliness, and sharpness without making the subject look fake.',
      'Do not add sales styling unless the user explicitly requests it.',
    ],
    'remove-bg': [
      'Remove the background from the provided image.',
      'Keep the original subject unchanged with clean natural edges.',
      'Place the subject centered on a clean white background unless transparency is requested.',
    ],
    'product-light': [
      'Improve the lighting and clarity of the provided subject.',
      'Keep the subject realistic and unchanged.',
      'Correct brightness, contrast, color balance, sharpness, and visible detail.',
      'Do not change the background style unless the user asks.',
    ],
    'ad-design': [
      'Turn the provided image into a clean advertising-style visual.',
      'Keep the real product/person/subject faithful and do not invent misleading details.',
      'Add readable text only when the user requests it, keeping spelling exactly as provided.',
      'Use a polished commercial layout with good spacing, contrast, and a clean background.',
      'Avoid clutter and keep the output suitable for online selling or social media ads.',
    ],
    'document-enhance': [
      'Enhance the provided document or screen photo so it is clearer and easier to read.',
      'Preserve the original content exactly and do not rewrite, translate, or invent text.',
      'Correct perspective and crop only when it improves readability.',
      'Reduce blur, noise, glare, shadows, and color cast while keeping a natural document look.',
      'Increase contrast and sharpness carefully so letters remain readable and edges do not look artificial.',
      'Return a clean image suitable for reading, printing, or attaching online.',
    ],
    custom: [
      'Edit the provided image according to the user instructions.',
      'Preserve the main subject faithfully unless the user explicitly asks to change it.',
    ],
  };

  return [
    ...(presets[mode] || presets.custom),
    buildTargetSizeInstruction(targetSize),
    instruction ? `User instruction: ${instruction}` : '',
  ].filter(Boolean).join('\n');
}

function normalizeImageSize(size, fallback = 'auto') {
  const value = String(size || '').trim();
  return ['auto', '1024x1024', '1024x1536', '1536x1024'].includes(value) ? value : fallback;
}

function formatExternalAiError(error, fallbackMessage = 'AI ทำงานไม่สำเร็จ') {
  const rawMessage = String(error?.message || fallbackMessage || '').trim();
  const requestId = rawMessage.match(/\breq_[a-z0-9]+\b/i)?.[0] || '';

  if (/safety system|content policy|policy violation|moderation|rejected/i.test(rawMessage)) {
    return [
      'คำขอถูกระบบความปลอดภัยของ AI ปฏิเสธ',
      'ลองแก้คำสั่งให้เป็นงานออกแบบทั่วไปมากขึ้น หรือใช้รูป/ข้อความที่ไม่มีเนื้อหาเสี่ยง ล่อแหลม รุนแรง หรือข้อมูลส่วนบุคคลเกินจำเป็น',
      requestId ? `Request ID: ${requestId}` : '',
    ].filter(Boolean).join('\n');
  }

  return rawMessage || fallbackMessage;
}

async function saveGeneratedImageBuffer(buffer, mimeType, sourceName) {
  fs.mkdirSync(generatedImagesDir, { recursive: true });
  const extension = getOutputExtension(mimeType);
  const fileName = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${sanitizeFileName(sourceName)}.${extension}`;
  const filePath = path.join(generatedImagesDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return {
    fileName,
    url: `${publicBasePath}/generated-images/${fileName}`,
    mimeType,
  };
}

async function saveGeneratedImage(base64, mimeType, sourceName) {
  return saveGeneratedImageBuffer(Buffer.from(base64, 'base64'), mimeType, sourceName);
}

async function saveOpenAiImageItem(item, sourceName, signal) {
  const base64 = item?.b64_json || item?.base64 || item?.image_base64 || item?.image?.b64_json;
  if (base64) {
    return saveGeneratedImage(base64, 'image/png', sourceName);
  }

  const imageUrl = item?.url || item?.image_url || item?.image?.url;
  if (imageUrl) {
    const response = await fetch(imageUrl, { signal });
    if (!response.ok) {
      throw new Error(`โหลดไฟล์รูปจาก OpenAI ไม่สำเร็จ (${response.status})`);
    }

    const mimeType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    return saveGeneratedImageBuffer(buffer, mimeType, sourceName);
  }

  throw new Error('OpenAI ส่งผลลัพธ์รูปกลับมาในรูปแบบที่แอปยังไม่รองรับ');
}

async function callOpenAiImageEdit({ prompt, images, mode, size, targetSize, signal }) {
  const preferredModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  const models = process.env.OPENAI_IMAGE_MODEL ? [preferredModel] : [preferredModel, 'gpt-image-1'];
  let lastError = null;

  for (const model of models) {
    const form = new FormData();
    form.set('model', model);
    form.set('prompt', buildImageEditPrompt(mode, prompt, targetSize));
    form.set('size', normalizeImageSize(size, 'auto'));
    form.set('quality', process.env.OPENAI_IMAGE_QUALITY || 'medium');
    form.set('background', 'opaque');
    form.set('output_format', 'png');

    images.forEach((attachment) => {
      const mimeType = getEditableImageMimeType(attachment);
      const blob = new Blob([attachment.buffer], { type: mimeType });
      form.append('image[]', blob, attachment.name || 'image.png');
    });

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      lastError = new Error(payload?.error?.message || 'แก้ไขรูปไม่สำเร็จ');
      lastError.status = response.status;
      if (!process.env.OPENAI_IMAGE_MODEL && /model|not found|does not exist|unsupported/i.test(lastError.message)) {
        continue;
      }
      throw lastError;
    }

    const item = payload?.data?.[0] || {};
    const saved = await saveOpenAiImageItem(item, images[0]?.name || 'edited-image', signal);
    if (targetSize) saved.targetSize = targetSize;
    return {
      image: saved,
      model,
      revisedPrompt: item.revised_prompt || '',
      usage: payload.usage || null,
    };
  }

  throw lastError || new Error('แก้ไขรูปไม่สำเร็จ');
}

function buildImageCreatePrompt(userPrompt, targetSize) {
  const instruction = String(userPrompt || '').trim();
  return [
    'Create a high-quality image from the user instruction.',
    'If the user asks for 3D design, create a polished 3D concept or render reference with believable geometry, materials, texture, lighting, perspective, scale, and camera framing.',
    'For 3D design work, make the output suitable for later revision: clear silhouette, readable material zones, organized composition, and enough empty space for callouts if requested.',
    'If the user asks for advertising, poster, banner, product, or social media creative, make it clean and presentation-ready.',
    'If the user requests text in the image, render the requested text clearly and do not add extra wording.',
    'Do not force white-background or square-output styling unless the user requests it.',
    'Use realistic lighting, balanced composition, and professional spacing.',
    buildTargetSizeInstruction(targetSize),
    `User instruction: ${instruction}`,
  ].filter(Boolean).join('\n');
}

async function callOpenAiImageCreate({ prompt, size, targetSize, signal }) {
  const preferredModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  const models = process.env.OPENAI_IMAGE_MODEL ? [preferredModel] : [preferredModel, 'gpt-image-1'];
  let lastError = null;

  for (const model of models) {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        prompt: buildImageCreatePrompt(prompt, targetSize),
        size: normalizeImageSize(size, 'auto'),
        quality: process.env.OPENAI_IMAGE_QUALITY || 'medium',
        output_format: 'png',
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      lastError = new Error(payload?.error?.message || 'สร้างรูปไม่สำเร็จ');
      lastError.status = response.status;
      if (!process.env.OPENAI_IMAGE_MODEL && /model|not found|does not exist|unsupported/i.test(lastError.message)) {
        continue;
      }
      throw lastError;
    }

    const item = payload?.data?.[0] || {};
    const saved = await saveOpenAiImageItem(item, prompt || 'generated-image', signal);
    if (targetSize) saved.targetSize = targetSize;
    return {
      image: saved,
      model,
      revisedPrompt: item.revised_prompt || '',
      usage: payload.usage || null,
    };
  }

  throw lastError || new Error('สร้างรูปไม่สำเร็จ');
}

app.post('/api/images/edit', requireAuth, asyncHandler(async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'ยังไม่ได้ใส่ OPENAI_API_KEY ในไฟล์ .env' });
  }

  let attachments = [];
  try {
    attachments = normalizeAttachments(req.body?.attachments);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const images = attachments.filter((attachment) => getEditableImageMimeType(attachment));
  if (!images.length) {
    return res.status(400).json({ error: 'โหมดแก้รูปต้องแนบไฟล์รูป JPG, PNG หรือ WebP อย่างน้อย 1 ไฟล์' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const targetSize = normalizeImageTargetSize(req.body?.targetSize);

  try {
    const result = await callOpenAiImageEdit({
      prompt: String(req.body?.prompt || '').trim(),
      mode: String(req.body?.mode || 'custom'),
      size: normalizeImageSize(req.body?.size, 'auto'),
      targetSize,
      images: images.slice(0, 4),
      signal: controller.signal,
    });

    res.json({
      ...result,
      provider: 'openai',
    });
  } catch (error) {
    res.status(error.status || 502).json({
      error: error.name === 'AbortError' ? 'แก้ไขรูปช้าเกินไป กรุณาลองใหม่' : formatExternalAiError(error, 'แก้ไขรูปไม่สำเร็จ'),
    });
  } finally {
    clearTimeout(timeout);
  }
}));

app.post('/api/images/create', requireAuth, asyncHandler(async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'ยังไม่ได้ใส่ OPENAI_API_KEY ในไฟล์ .env' });
  }

  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) {
    return res.status(400).json({ error: 'กรุณาพิมพ์รายละเอียดรูปที่ต้องการสร้าง' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const targetSize = normalizeImageTargetSize(req.body?.targetSize);

  try {
    const result = await callOpenAiImageCreate({
      prompt,
      size: normalizeImageSize(req.body?.size, 'auto'),
      targetSize,
      signal: controller.signal,
    });

    res.json({
      ...result,
      provider: 'openai',
    });
  } catch (error) {
    res.status(error.status || 502).json({
      error: error.name === 'AbortError' ? 'สร้างรูปช้าเกินไป กรุณาลองใหม่' : formatExternalAiError(error, 'สร้างรูปไม่สำเร็จ'),
    });
  } finally {
    clearTimeout(timeout);
  }
}));

app.post('/api/tms/chat', asyncHandler(async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const context = String(req.body?.context || '').trim();
  let attachments = [];

  try {
    attachments = normalizeAttachments(req.body?.attachments);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const messages = normalizeMessages(
    req.body?.messages,
    context
      ? [
          'You are operating inside TMS Pro. The following JSON/text is a live snapshot of the TMS application, including UI fields, tables, session, company, and available API data.',
          'Use the snapshot as the primary source of truth. Do not invent records that are not present. If data is missing, say what is missing.',
          context,
          `User request:\n${message}`,
        ].join('\n\n')
      : message
  );
  const provider = normalizeAiProvider(req.body?.provider);

  if (!messages.length && !attachments.length) {
    return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
  }

  if (!messages.length) {
    messages.push({ role: 'user', content: 'ช่วยวิเคราะห์ไฟล์แนบนี้ให้หน่อย' });
  }

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'ยังไม่ได้ใส่ OPENAI_API_KEY ในไฟล์ .env' });
  }
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'ยังไม่ได้ใส่ GEMINI_API_KEY ในไฟล์ .env' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const result = provider === 'gemini'
      ? await callGemini(messages, attachments, controller.signal)
      : await callOpenAi(messages, attachments, controller.signal);

    res.json({
      ...result,
      provider,
    });
  } catch (error) {
    res.status(error.status || 502).json({
      error: error.name === 'AbortError'
        ? 'AI ตอบช้าเกินไป กรุณาลองใหม่'
        : formatExternalAiError(error, 'AI ตอบไม่สำเร็จ'),
    });
  } finally {
    clearTimeout(timeout);
  }
}));

app.post('/api/tms/images/create', asyncHandler(async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'ยังไม่ได้ใส่ OPENAI_API_KEY ในไฟล์ .env' });
  }

  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) {
    return res.status(400).json({ error: 'กรุณาพิมพ์รายละเอียดรูปที่ต้องการสร้าง' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const result = await callOpenAiImageCreate({
      prompt,
      size: normalizeImageSize(req.body?.size, 'auto'),
      targetSize: normalizeImageTargetSize(req.body?.targetSize),
      signal: controller.signal,
    });

    res.json({ ...result, provider: 'openai' });
  } catch (error) {
    res.status(error.status || 502).json({
      error: error.name === 'AbortError' ? 'สร้างรูปช้าเกินไป กรุณาลองใหม่' : formatExternalAiError(error, 'สร้างรูปไม่สำเร็จ'),
    });
  } finally {
    clearTimeout(timeout);
  }
}));

app.post('/api/tms/images/edit', asyncHandler(async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'ยังไม่ได้ใส่ OPENAI_API_KEY ในไฟล์ .env' });
  }

  let attachments = [];
  try {
    attachments = normalizeAttachments(req.body?.attachments);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const images = attachments.filter((attachment) => getEditableImageMimeType(attachment));
  if (!images.length) {
    return res.status(400).json({ error: 'โหมดแก้รูปต้องแนบไฟล์ JPG, PNG หรือ WebP อย่างน้อย 1 ไฟล์' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const result = await callOpenAiImageEdit({
      prompt: String(req.body?.prompt || '').trim(),
      mode: String(req.body?.mode || 'custom'),
      size: normalizeImageSize(req.body?.size, 'auto'),
      targetSize: normalizeImageTargetSize(req.body?.targetSize),
      images: images.slice(0, 4),
      signal: controller.signal,
    });

    res.json({ ...result, provider: 'openai' });
  } catch (error) {
    res.status(error.status || 502).json({
      error: error.name === 'AbortError' ? 'แก้ไขรูปช้าเกินไป กรุณาลองใหม่' : formatExternalAiError(error, 'แก้ไขรูปไม่สำเร็จ'),
    });
  } finally {
    clearTimeout(timeout);
  }
}));

app.post('/api/chat/stream', requireAuth, asyncHandler(async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const messages = normalizeMessages(req.body?.messages, message);
  let attachments = [];

  try {
    attachments = normalizeAttachments(req.body?.attachments);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (!messages.length && !attachments.length) {
    return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
  }

  if (!messages.length) {
    messages.push({ role: 'user', content: 'ช่วยวิเคราะห์ไฟล์ที่แนบให้หน่อย' });
  }

  const provider = normalizeAiProvider(req.body?.provider);

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'ยังไม่ได้ใส่ OPENAI_API_KEY ในไฟล์ .env' });
  }
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'ยังไม่ได้ใส่ GEMINI_API_KEY ในไฟล์ .env' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  res.on('close', () => controller.abort());

  try {
    const result = provider === 'gemini'
      ? await streamGemini(messages, attachments, controller.signal, (text) => writeSse(res, 'delta', { text }))
      : await streamOpenAi(messages, attachments, controller.signal, (text) => writeSse(res, 'delta', { text }));

    writeSse(res, 'done', {
      provider,
      model: result.model,
    });
  } catch (error) {
    if (!res.writableEnded) {
      writeSse(res, 'error', {
        error: error.name === 'AbortError' ? 'AI ตอบช้าเกินไป กรุณาลองใหม่' : formatExternalAiError(error, 'AI ตอบไม่สำเร็จ'),
      });
    }
  } finally {
    clearTimeout(timeout);
    if (!res.writableEnded) res.end();
  }
}));

app.post('/api/chat', requireAuth, asyncHandler(async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const messages = normalizeMessages(req.body?.messages, message);
  let attachments = [];

  try {
    attachments = normalizeAttachments(req.body?.attachments);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (!messages.length && !attachments.length) {
    return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
  }

  if (!messages.length) {
    messages.push({ role: 'user', content: 'ช่วยวิเคราะห์ไฟล์ที่แนบให้หน่อย' });
  }

  {
    const provider = normalizeAiProvider(req.body?.provider);

    if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'ยังไม่ได้ใส่ OPENAI_API_KEY ในไฟล์ .env' });
    }
    if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'ยังไม่ได้ใส่ GEMINI_API_KEY ในไฟล์ .env' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const result = provider === 'gemini'
        ? await callGemini(messages, attachments, controller.signal)
        : await callOpenAi(messages, attachments, controller.signal);

      return res.json({
        ...result,
        provider,
      });
    } catch (error) {
      return res.status(error.status || 502).json({
        error: error.name === 'AbortError' ? 'AI ตอบช้าเกินไป กรุณาลองใหม่' : formatExternalAiError(error, 'AI ตอบไม่สำเร็จ'),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

function getLanUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => `http://${item.address}:${port}`);
}

if (require.main === module) {
  app.listen(port, host, () => {
    console.log(`AI GPT App is running at http://localhost:${port}`);
    getLanUrls().forEach((url) => console.log(`LAN URL: ${url}`));
    console.log(`User storage: ${hasMysqlConfig() ? 'MySQL cloud' : 'local JSON fallback'}`);
  });
}

module.exports = app;
