const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireFields, requireNumber } = require('../middleware/validate');

module.exports = function createGpsRouter() {
  const router = express.Router();
  const activeGPS = {};

  router.post('/gps', asyncHandler(async (req, res) => {
    requireFields(req.body, ['vid', 'lat', 'lng']);
    const lat = requireNumber(req.body.lat, 'lat');
    const lng = requireNumber(req.body.lng, 'lng');

    activeGPS[req.body.vid] = {
      lat,
      lng,
      updatedAt: new Date().toISOString(),
    };

    res.status(200).json({ success: true, data: activeGPS[req.body.vid] });
  }));

  router.get('/gps', (req, res) => {
    res.status(200).json(activeGPS);
  });

  return router;
};
