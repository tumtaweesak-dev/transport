const pgPool = require('./postgres');
const mysqlPool = require('./mysql');

async function ensurePostgresSchema() {
  await pgPool.query('SELECT 1');
}

async function ensureMysqlColumn(tableName, columnName, definition) {
  const [rows] = await mysqlPool.execute(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );

  if (Number(rows[0].total) === 0) {
    await mysqlPool.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function ensureMysqlSchema() {
  await mysqlPool.execute('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS editable_employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      branch VARCHAR(100),
      department VARCHAR(100),
      position VARCHAR(100),
      password_hash VARCHAR(255),
      password_updated_at TIMESTAMP NULL,
      record_source VARCHAR(30) DEFAULT 'postgres',
      is_edited TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await ensureMysqlColumn('editable_employees', 'password_hash', 'VARCHAR(255)');
  await ensureMysqlColumn('editable_employees', 'password_updated_at', 'TIMESTAMP NULL');

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS editable_cars (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(50),
      brand VARCHAR(100),
      model VARCHAR(100),
      color VARCHAR(50),
      license_plate VARCHAR(80) UNIQUE NOT NULL,
      fuel_type VARCHAR(50),
      record_source VARCHAR(30) DEFAULT 'mysql-edit',
      is_edited TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await ensureMysqlColumn('editable_cars', 'asset_code', 'VARCHAR(100)');
  await ensureMysqlColumn('editable_cars', 'source_database', 'VARCHAR(100)');
  await ensureMysqlColumn('editable_cars', 'source_table', 'VARCHAR(100)');
  await ensureMysqlColumn('editable_cars', 'source_name', 'TEXT');
  await ensureMysqlColumn('editable_cars', 'asset_location', 'VARCHAR(200)');
  await ensureMysqlColumn('editable_cars', 'asset_owner', 'VARCHAR(200)');
  await ensureMysqlColumn('editable_cars', 'asset_status', 'VARCHAR(100)');

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS travel_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      origin_project_code VARCHAR(50),
      origin_name VARCHAR(100),
      origin_gps_link TEXT,
      travel_date DATE,
      travel_time TIME,
      fuel_type VARCHAR(50),
      fuel_qty NUMERIC(10,2),
      fuel_price NUMERIC(10,2),
      fuel_total NUMERIC(10,2),
      acc_type VARCHAR(50),
      acc_qty NUMERIC(10,2),
      acc_price NUMERIC(10,2),
      acc_total NUMERIC(10,2),
      grand_total NUMERIC(12,2),
      status VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await ensureMysqlColumn('travel_requests', 'manager_approved_by', 'VARCHAR(200)');
  await ensureMysqlColumn('travel_requests', 'manager_approved_at', 'DATETIME');
  await ensureMysqlColumn('travel_requests', 'hr_checked_by', 'VARCHAR(200)');
  await ensureMysqlColumn('travel_requests', 'hr_checked_at', 'DATETIME');
  await ensureMysqlColumn('travel_requests', 'md_approved_by', 'VARCHAR(200)');
  await ensureMysqlColumn('travel_requests', 'md_approved_at', 'DATETIME');
  await ensureMysqlColumn('travel_requests', 'accounting_paid_by', 'VARCHAR(200)');
  await ensureMysqlColumn('travel_requests', 'accounting_paid_at', 'DATETIME');
  await ensureMysqlColumn('travel_requests', 'rejected_by', 'VARCHAR(200)');
  await ensureMysqlColumn('travel_requests', 'rejected_at', 'DATETIME');
  await ensureMysqlColumn('travel_requests', 'job_description', 'TEXT');

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS travelers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT,
      employee_id VARCHAR(50),
      name VARCHAR(100),
      department VARCHAR(100),
      position VARCHAR(100),
      phone VARCHAR(30),
      comment TEXT,
      FOREIGN KEY (request_id) REFERENCES travel_requests(id) ON DELETE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS travel_destinations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT,
      project_code VARCHAR(50),
      name VARCHAR(100),
      gps_link TEXT,
      distance NUMERIC(10,2),
      FOREIGN KEY (request_id) REFERENCES travel_requests(id) ON DELETE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS travel_request_attachments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_type VARCHAR(120),
      file_size INT DEFAULT 0,
      file_data LONGTEXT NOT NULL,
      uploaded_by VARCHAR(200),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES travel_requests(id) ON DELETE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS delivery_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      note_no VARCHAR(80) UNIQUE NOT NULL,
      customer_name VARCHAR(200),
      origin_name VARCHAR(200),
      destination_name VARCHAR(200),
      total_weight_kg NUMERIC(12,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'created',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS delivery_note_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      delivery_note_id INT NOT NULL,
      product_id VARCHAR(80),
      sku VARCHAR(80),
      product_name VARCHAR(200) NOT NULL,
      qty NUMERIC(12,2) NOT NULL,
      unit VARCHAR(30),
      weight_kg NUMERIC(10,2) DEFAULT 0,
      total_weight_kg NUMERIC(12,2) DEFAULT 0,
      dimensions VARCHAR(80),
      FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes(id) ON DELETE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS menu_permissions (
      employee_id VARCHAR(80) PRIMARY KEY,
      employee_name VARCHAR(200),
      menus JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await mysqlPool.execute('ALTER TABLE travel_requests CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await mysqlPool.execute('ALTER TABLE travelers CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await mysqlPool.execute('ALTER TABLE travel_destinations CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await mysqlPool.execute('ALTER TABLE travel_request_attachments CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await mysqlPool.execute('ALTER TABLE delivery_notes CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await mysqlPool.execute('ALTER TABLE delivery_note_items CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await mysqlPool.execute('ALTER TABLE menu_permissions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await mysqlPool.execute('ALTER TABLE editable_employees CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await mysqlPool.execute('ALTER TABLE editable_cars CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
}

module.exports = {
  ensurePostgresSchema,
  ensureMysqlSchema,
};
