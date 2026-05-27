const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireFields } = require('../middleware/validate');

const DEFAULT_ASSET_DATABASES = ['sge_sitecontroldb', 'aes_sitecontroldb', 'srt_sitecontroldb'];
const ASSET_DATABASE_ALIASES = {
  srental_sitecontroldb: 'srt_sitecontroldb',
};
let lastAssetVehicleSyncAt = 0;
let assetVehicleSyncTimer = null;
const ASSET_VEHICLE_SYNC_INTERVAL_MS = 30 * 60 * 1000;

function assetVehicleDatabases() {
  const configured = String(process.env.PG_ASSET_VEHICLE_DATABASES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const databases = configured.length ? configured : DEFAULT_ASSET_DATABASES;
  return [...new Set(databases.map((name) => ASSET_DATABASE_ALIASES[name] || name))];
}

function extractPlate(text) {
  const value = String(text || '');
  const match = value.match(/((?:\d{1,2}\s*)?[ก-ฮ]{1,3})\s*-?\s*(\d{2,5})/u);
  return match ? `${match[1].replace(/\s+/g, ' ').trim()} ${match[2]}` : '';
}

function inferCarType(row) {
  const text = `${row.assetname || ''} ${row.typename || ''}`.toLowerCase();
  if (/motorcycle|มอเตอร์ไซค์|มอไซต์/.test(text)) return 'motorcycle';
  if (/van|รถตู้/.test(text)) return 'van';
  if (/truck|บรรทุก|6\s*ล้อ|สิบล้อ|10\s*ล้อ/.test(text)) return 'truck';
  if (/pickup|กระบะ|แค็บ|แค๊ป|cab|คอก/.test(text)) return 'pickup';
  if (/sedan|รถเก๋ง|รถยนต์นั่ง/.test(text)) return 'sedan';
  return 'pickup';
}

function inferBrand(row) {
  const text = `${row.assetname || ''} ${row.typename || ''}`;
  if (/ทาทา/i.test(text)) return 'Tata';
  if (/เทสลา|TESLA/i.test(text)) return 'Tesla';
  if (/ยามาฮ่า|YAMAHA/i.test(text)) return 'Yamaha';
  const brands = ['TOYOTA', 'TATA', 'ISUZU', 'HONDA', 'FORD', 'MITSUBISHI', 'NISSAN', 'MAZDA', 'HINO'];
  const found = brands.find((brand) => new RegExp(brand, 'i').test(text));
  return found ? found.charAt(0) + found.slice(1).toLowerCase() : null;
}

function isExcludedVehicleAsset(row) {
  const text = `${row.assetcode || ''} ${row.assetname || ''} ${row.typename || ''}`.toLowerCase();
  return /รถเข็น|wheel\s*barrow|cart|ผ้าคลุม|เครื่องชาร์จ|gps|หลังคารถ|คอกเหล็ก/.test(text);
}

function mapAssetVehicle(row, sourceDatabase) {
  const plate = extractPlate(row.assetname) || extractPlate(row.typename) || row.assetcode;
  return {
    type: inferCarType(row),
    brand: inferBrand(row),
    model: row.assetname || row.typename || row.assetcode,
    color: null,
    licensePlate: plate,
    fuelType: null,
    assetCode: row.assetcode || null,
    sourceDatabase,
    sourceTable: 'asset.assetdt',
    sourceName: row.assetname || row.typename || null,
    assetLocation: row.location || null,
    assetOwner: row.owner || null,
    assetStatus: row.status || null,
  };
}

async function loadAssetVehiclesFromDatabase(pgPool, databaseName) {
  const pool = pgPool.getPoolForDatabase(databaseName);
  const result = await pool.query(
    `SELECT assetcode, assetname, typecode, typename, location, owner, status, last_update
     FROM asset.assetdt
     WHERE COALESCE(typecode,'') ILIKE ANY($1)
        OR COALESCE(assetcode,'') ~* $2
     ORDER BY assetcode ASC
     LIMIT 1000`,
    [
      ['CAR', 'CAR1', 'TRUCK', 'VEH', 'SLN', 'MC', 'MC1'],
      '(^|[-_])(CAR|CAR1|TRUCK|VEH|SLN|MC|MC1)([-_]|$)',
    ]
  );

  return result.rows
    .filter((row) => !isExcludedVehicleAsset(row))
    .map((row) => mapAssetVehicle(row, databaseName))
    .filter((vehicle) => vehicle.licensePlate);
}

async function removeStaleAssetVehicles(mysqlPool, databaseName, vehicles) {
  const plates = vehicles.map((vehicle) => vehicle.licensePlate).filter(Boolean);
  if (!plates.length) {
    await mysqlPool.execute(
      `DELETE FROM editable_cars
       WHERE record_source = 'postgres-asset'
         AND is_edited = 0
         AND source_database = ?`,
      [databaseName]
    );
    return;
  }

  const placeholders = plates.map(() => '?').join(', ');
  await mysqlPool.execute(
    `DELETE FROM editable_cars
     WHERE record_source = 'postgres-asset'
       AND is_edited = 0
       AND source_database = ?
       AND license_plate NOT IN (${placeholders})`,
    [databaseName, ...plates]
  );
}

async function syncAssetVehiclesToMysql({ pgPool, mysqlPool, force = false }) {
  if (!pgPool || typeof pgPool.getPoolForDatabase !== 'function') return { synced: 0, skipped: [] };

  const now = Date.now();
  if (!force && now - lastAssetVehicleSyncAt < ASSET_VEHICLE_SYNC_INTERVAL_MS) {
    return { synced: 0, skipped: [], cached: true };
  }

  let synced = 0;
  const skipped = [];

  for (const databaseName of assetVehicleDatabases()) {
    try {
      const vehicles = await loadAssetVehiclesFromDatabase(pgPool, databaseName);
      for (const vehicle of vehicles) {
        await mysqlPool.execute(
          `INSERT INTO editable_cars
             (type, brand, model, color, license_plate, fuel_type, record_source, is_edited,
              asset_code, source_database, source_table, source_name, asset_location, asset_owner, asset_status)
           VALUES (?, ?, ?, ?, ?, ?, 'postgres-asset', 0, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             type = IF(is_edited = 0, VALUES(type), type),
             brand = IF(is_edited = 0, VALUES(brand), brand),
             model = IF(is_edited = 0, VALUES(model), model),
             color = IF(is_edited = 0, VALUES(color), color),
             fuel_type = IF(is_edited = 0, VALUES(fuel_type), fuel_type),
             record_source = IF(is_edited = 0, 'postgres-asset', record_source),
             asset_code = VALUES(asset_code),
             source_database = VALUES(source_database),
             source_table = VALUES(source_table),
             source_name = VALUES(source_name),
             asset_location = VALUES(asset_location),
             asset_owner = VALUES(asset_owner),
             asset_status = VALUES(asset_status)`,
          [
            vehicle.type,
            vehicle.brand,
            vehicle.model,
            vehicle.color,
            vehicle.licensePlate,
            vehicle.fuelType,
            vehicle.assetCode,
            vehicle.sourceDatabase,
            vehicle.sourceTable,
            vehicle.sourceName,
            vehicle.assetLocation,
            vehicle.assetOwner,
            vehicle.assetStatus,
          ]
        );
        synced += 1;
      }
      await removeStaleAssetVehicles(mysqlPool, databaseName, vehicles);
    } catch (error) {
      skipped.push({ database: databaseName, error: error.message });
      console.warn(`Asset vehicle sync skipped for ${databaseName}:`, error.message);
    }
  }

  lastAssetVehicleSyncAt = now;
  return { synced, skipped };
}

function scheduleAssetVehicleSync({ pgPool, mysqlPool }) {
  if (assetVehicleSyncTimer || !pgPool || !mysqlPool) return;

  assetVehicleSyncTimer = setInterval(() => {
    syncAssetVehiclesToMysql({ pgPool, mysqlPool, force: true })
      .catch((error) => console.warn('Scheduled asset vehicle sync failed:', error.message));
  }, ASSET_VEHICLE_SYNC_INTERVAL_MS);
}

module.exports = function createCarsRouter({ mysqlPool, pgPool }) {
  const router = express.Router();
  scheduleAssetVehicleSync({ pgPool, mysqlPool });

  router.post('/cars', asyncHandler(async (req, res) => {
    requireFields(req.body, ['licensePlate']);

    const { type, brand, model, color, licensePlate, fuelType } = req.body;
    const plate = String(licensePlate).trim();

    await mysqlPool.execute(
      `INSERT INTO editable_cars
         (type, brand, model, color, license_plate, fuel_type, record_source, is_edited)
       VALUES (?, ?, ?, ?, ?, ?, 'mysql-edit', 1)
       ON DUPLICATE KEY UPDATE
         type = VALUES(type),
         brand = VALUES(brand),
         model = VALUES(model),
         color = VALUES(color),
         fuel_type = VALUES(fuel_type),
         record_source = 'mysql-edit',
         is_edited = 1`,
      [
        type || null,
        brand || null,
        model || null,
        color || null,
        plate,
        fuelType || null,
      ]
    );

    const [rows] = await mysqlPool.execute(
      `SELECT type, brand, model, color, license_plate, fuel_type, record_source, is_edited
       FROM editable_cars
       WHERE license_plate = ?
       LIMIT 1`,
      [plate]
    );

    res.status(201).json(rows[0]);
  }));

  router.get('/cars', asyncHandler(async (req, res) => {
    try {
      await syncAssetVehiclesToMysql({ pgPool, mysqlPool, force: req.query.refresh === '1' });
      const [rows] = await mysqlPool.execute(`
        SELECT type, brand, model, color, license_plate, fuel_type, record_source, is_edited,
               asset_code, source_database, source_table, source_name, asset_location, asset_owner, asset_status
        FROM editable_cars
        ORDER BY updated_at DESC
        LIMIT 500
      `);
      res.status(200).json(rows);
    } catch (error) {
      console.warn('Cars list unavailable, returning empty list:', error.message);
      res.status(200).json([]);
    }
  }));

  return router;
};
