const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireFields } = require('../middleware/validate');

module.exports = function createPlacesRouter() {
  const router = express.Router();

  async function runPlaceProvider(providerName, searchFn, query) {
    try {
      return await searchFn(query);
    } catch (err) {
      console.warn(`${providerName} place search skipped: ${err.message}`);
      return {
        configured: true,
        failed: true,
        error: err.message,
        results: [],
      };
    }
  }

  async function searchLocationIq(query) {
    const token = process.env.LOCATIONIQ_TOKEN;
    if (!token) {
      return { configured: false, results: [] };
    }

    const url = new URL('https://us1.locationiq.com/v1/search');
    url.searchParams.set('key', token);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '10');
    url.searchParams.set('countrycodes', 'th');
    url.searchParams.set('accept-language', 'th,en');

    const response = await fetch(url);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'LocationIQ request failed');
    }

    const results = (Array.isArray(payload) ? payload : []).map((place) => ({
      name: place.namedetails?.name || place.name || place.display_name,
      display_name: place.display_name,
      lat: place.lat,
      lon: place.lon,
      place_id: place.place_id,
      source: 'locationiq',
    })).filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon)));

    return { configured: true, results };
  }

  async function searchGooglePlaces(query) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return { configured: false, results: [] };
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('region', 'th');
    url.searchParams.set('language', 'th');
    url.searchParams.set('key', apiKey);

    const response = await fetch(url);
    const payload = await response.json();

    if (!response.ok || !['OK', 'ZERO_RESULTS'].includes(payload.status)) {
      throw new Error(payload.error_message || payload.status || 'Google Places request failed');
    }

    const results = (payload.results || []).map((place) => ({
      name: place.name,
      display_name: place.formatted_address || place.name,
      lat: place.geometry?.location?.lat,
      lon: place.geometry?.location?.lng,
      place_id: place.place_id,
      source: 'google-places',
    })).filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon)));

    return { configured: true, status: payload.status, results };
  }

  router.get('/places/search', asyncHandler(async (req, res) => {
    requireFields(req.query, ['query']);

    const query = String(req.query.query).trim();
    const locationIq = await runPlaceProvider('LocationIQ', searchLocationIq, query);
    if (locationIq.configured && locationIq.results.length > 0) {
      return res.status(200).json({
        source: 'locationiq',
        configured: true,
        results: locationIq.results,
      });
    }

    const google = await runPlaceProvider('Google Places', searchGooglePlaces, query);
    if (google.configured && google.results.length > 0) {
      return res.status(200).json({
        source: 'google-places',
        configured: true,
        status: google.status,
        results: google.results,
      });
    }

    if (locationIq.configured || google.configured) {
      return res.status(200).json({
        source: 'none',
        configured: true,
        results: [],
        errors: [locationIq, google]
          .filter((provider) => provider.failed)
          .map((provider) => provider.error),
      });
    }

    res.status(200).json({
      source: 'none',
      configured: false,
      results: [],
    });
  }));

  return router;
};
