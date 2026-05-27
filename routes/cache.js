const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');

module.exports = function createCacheRouter({ pgPool, redisClient }) {
  const router = express.Router();

  router.get('/cache-data', asyncHandler(async (req, res) => {
    const cacheKey = 'app:cache_data:users';

    if (redisClient.isOpen) {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        return res.status(200).json({
          source: 'redis',
          data: JSON.parse(cachedData),
        });
      }
    }

    const { rows } = await pgPool.query(`
      SELECT employeecode AS id,
             fullname AS name
      FROM security.employee
      WHERE employeecode IS NOT NULL
      ORDER BY fullname ASC
      LIMIT 50
    `);

    if (redisClient.isOpen) {
      await redisClient.setEx(cacheKey, 3600, JSON.stringify(rows));
    }

    return res.status(200).json({
      source: redisClient.isOpen ? 'postgres-readonly' : 'postgres-readonly-no-cache',
      data: rows,
    });
  }));

  return router;
};
