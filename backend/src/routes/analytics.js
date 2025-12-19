const express = require('express');
const router = express.Router();
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://ml-service:8000';

// Helper function to proxy requests to ML service
const proxyToML = async (req, res, mlEndpoint, method = 'GET') => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const url = `${ML_SERVICE_URL}${mlEndpoint}${params ? `?${params}` : ''}`;
    
    let response;
    if (method === 'POST') {
      response = await axios.post(url, req.body);
    } else {
      response = await axios.get(url);
    }
    
    res.json(response.data);
  } catch (error) {
    console.error(`Error proxying to ML service (${mlEndpoint}):`, error.message);
    res.status(error.response?.status || 500).json({
      error: 'ML service unavailable',
      message: error.message
    });
  }
};

// Price Analytics Endpoints
router.get('/price/predict', async (req, res) => {
  // For price prediction, we need listing data
  const { listingId } = req.query;
  if (!listingId) {
    return res.status(400).json({ error: 'listingId is required' });
  }
  
  // Get listing data from database
  const { pool } = require('../db');
  const listingResult = await pool.query(
    `SELECT * FROM listings WHERE id = $1`,
    [listingId]
  );
  
  if (listingResult.rows.length === 0) {
    return res.status(404).json({ error: 'Listing not found' });
  }
  
  const listing = listingResult.rows[0];
  // Parse specs if it's a string
  if (typeof listing.specs === 'string') {
    try {
      listing.specs = JSON.parse(listing.specs);
    } catch (e) {
      listing.specs = {};
    }
  }
  
  await proxyToML({ ...req, body: listing }, res, '/ml/predict/price', 'POST');
});

router.get('/price/fmv', (req, res) => proxyToML(req, res, '/ml/analytics/price/fmv'));
router.get('/price/anomalies', (req, res) => proxyToML(req, res, '/ml/analytics/price/anomalies'));
router.get('/price/distribution', (req, res) => proxyToML(req, res, '/ml/analytics/price/distribution'));

// Mileage Analytics Endpoints
router.get('/mileage/distribution', (req, res) => proxyToML(req, res, '/ml/analytics/mileage/distribution'));
router.get('/mileage/depreciation', (req, res) => proxyToML(req, res, '/ml/analytics/mileage/depreciation'));
router.get('/mileage/anomalies', (req, res) => proxyToML(req, res, '/ml/analytics/mileage/anomalies'));

// Location Analytics Endpoints
router.get('/location/heatmap', (req, res) => proxyToML(req, res, '/ml/analytics/location/heatmap'));
router.get('/location/premiums', (req, res) => proxyToML(req, res, '/ml/analytics/location/premiums'));

// Sales Forecasting Endpoints
router.get('/sales/forecast', (req, res) => proxyToML(req, res, '/ml/predict/sales', 'GET'));
router.get('/sales/market-share', (req, res) => proxyToML(req, res, '/ml/analytics/sales/market-share'));

// Time Series Endpoints
router.get('/time-series/price-evolution', (req, res) => proxyToML(req, res, '/ml/analytics/time-series/price-evolution'));
router.get('/time-series/seasonal', (req, res) => proxyToML(req, res, '/ml/analytics/time-series/seasonal'));

// Market Intelligence Endpoints
router.get('/market/summary', async (req, res) => {
  try {
    const { pool } = require('../db');
    
    // Get comprehensive market summary
    const [overview, priceStats, locationStats, topMakers] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) as total_listings,
          AVG(price_eur) as avg_price,
          MIN(price_eur) as min_price,
          MAX(price_eur) as max_price
        FROM listings
        WHERE price_eur IS NOT NULL AND price_eur > 0
      `),
      pool.query(`
        SELECT 
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_eur) as q1,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_eur) as median,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_eur) as q3
        FROM listings
        WHERE price_eur IS NOT NULL AND price_eur > 0
      `),
      pool.query(`
        SELECT COUNT(DISTINCT location) as unique_locations
        FROM listings
        WHERE location IS NOT NULL AND location != ''
      `),
      pool.query(`
        SELECT 
          COALESCE(mk.name, l.extracted_make) AS maker,
          COUNT(*) as listing_count
        FROM listings l
        LEFT JOIN models m ON m.id = l.model_id
        LEFT JOIN makers mk ON mk.id = m.maker_id
        WHERE COALESCE(mk.name, l.extracted_make) IS NOT NULL
        GROUP BY COALESCE(mk.name, l.extracted_make)
        ORDER BY listing_count DESC
        LIMIT 10
      `)
    ]);
    
    res.json({
      overview: overview.rows[0],
      price_stats: priceStats.rows[0],
      location_stats: locationStats.rows[0],
      top_makers: topMakers.rows
    });
  } catch (error) {
    console.error('Error generating market summary:', error);
    res.status(500).json({ error: 'Failed to generate market summary' });
  }
});

router.get('/market/insights', async (req, res) => {
  try {
    // Try to get cached insights first
    const { pool } = require('../db');
    const cached = await pool.query(
      `SELECT insight_data FROM market_insights 
       WHERE insight_type = 'general' 
       ORDER BY generated_at DESC LIMIT 1`
    );
    
    if (cached.rows.length > 0) {
      const data = cached.rows[0].insight_data;
      // Check if cache is less than 1 hour old
      const cacheAge = Date.now() - new Date(cached.rows[0].generated_at).getTime();
      if (cacheAge < 3600000) { // 1 hour
        return res.json(data);
      }
    }
    
    // Generate new insights
    const insights = await generateMarketInsights();
    
    // Cache insights
    await pool.query(
      `INSERT INTO market_insights (insight_type, insight_data) 
       VALUES ('general', $1)`,
      [JSON.stringify(insights)]
    );
    
    res.json(insights);
  } catch (error) {
    console.error('Error generating market insights:', error);
    res.status(500).json({ error: 'Failed to generate market insights' });
  }
});

async function generateMarketInsights() {
  const { pool } = require('../db');
  
  const [priceTrend, topModels, locationPremium, avgMileage] = await Promise.all([
    pool.query(`
      SELECT 
        AVG(CASE WHEN year >= EXTRACT(YEAR FROM NOW()) - 2 THEN price_eur ELSE NULL END) as recent_avg,
        AVG(CASE WHEN year < EXTRACT(YEAR FROM NOW()) - 2 THEN price_eur ELSE NULL END) as older_avg
      FROM listings
      WHERE price_eur IS NOT NULL AND price_eur > 0 AND year IS NOT NULL
    `),
    pool.query(`
      SELECT 
        COALESCE(mk.name, l.extracted_make) AS maker,
        COALESCE(m.name, l.extracted_model) AS model,
        COUNT(*) as count
      FROM listings l
      LEFT JOIN models m ON m.id = l.model_id
      LEFT JOIN makers mk ON mk.id = m.maker_id
      GROUP BY COALESCE(mk.name, l.extracted_make), COALESCE(m.name, l.extracted_model)
      ORDER BY count DESC
      LIMIT 5
    `),
    pool.query(`
      SELECT 
        location,
        AVG(price_eur) as avg_price
      FROM listings
      WHERE location IS NOT NULL AND location != '' AND price_eur IS NOT NULL
      GROUP BY location
      HAVING COUNT(*) >= 5
      ORDER BY avg_price DESC
      LIMIT 1
    `),
    pool.query(`
      SELECT AVG(mileage_km) as avg_mileage
      FROM listings
      WHERE mileage_km IS NOT NULL AND mileage_km > 0
    `)
  ]);
  
  const insights = [];
  
  // Price trend insight
  if (priceTrend.rows[0].recent_avg && priceTrend.rows[0].older_avg) {
    const change = ((priceTrend.rows[0].recent_avg - priceTrend.rows[0].older_avg) / priceTrend.rows[0].older_avg * 100);
    insights.push({
      type: 'price_trend',
      title: 'Price Trend',
      message: `Recent listings (last 2 years) are ${change > 0 ? 'higher' : 'lower'} by ${Math.abs(change).toFixed(1)}% compared to older listings.`,
      value: change.toFixed(1) + '%'
    });
  }
  
  // Top models insight
  if (topModels.rows.length > 0) {
    insights.push({
      type: 'top_models',
      title: 'Most Listed Models',
      message: `${topModels.rows[0].maker} ${topModels.rows[0].model} has the most listings with ${topModels.rows[0].count} listings.`,
      value: `${topModels.rows[0].count} listings`
    });
  }
  
  // Location premium insight
  if (locationPremium.rows.length > 0) {
    insights.push({
      type: 'location_premium',
      title: 'Highest Price Location',
      message: `${locationPremium.rows[0].location} has the highest average price at €${Math.round(locationPremium.rows[0].avg_price).toLocaleString()}.`,
      value: `€${Math.round(locationPremium.rows[0].avg_price).toLocaleString()}`
    });
  }
  
  // Average mileage insight
  if (avgMileage.rows[0].avg_mileage) {
    insights.push({
      type: 'avg_mileage',
      title: 'Average Mileage',
      message: `The average mileage across all listings is ${Math.round(avgMileage.rows[0].avg_mileage).toLocaleString()} km.`,
      value: `${Math.round(avgMileage.rows[0].avg_mileage).toLocaleString()} km`
    });
  }
  
  return { insights, generated_at: new Date().toISOString() };
}


module.exports = router;

