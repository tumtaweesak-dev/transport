const express = require('express');

module.exports = function createGpsDashboardRouter() {
  const router = express.Router();

  router.get('/gps-dashboard', (req, res) => {
    res.json({
      'CB-001': { lat: 13.736717 + (Math.random() - 0.5) * 0.1, lng: 100.523186 + (Math.random() - 0.5) * 0.1 },
      'CB-002': { lat: 13.84 + (Math.random() - 0.5) * 0.1, lng: 100.62 + (Math.random() - 0.5) * 0.1 },
    });
  });

  return router;
};
