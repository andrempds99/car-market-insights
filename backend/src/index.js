const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { pool, waitForDatabase } = require('./db');
const { seedAll } = require('./seed');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Test endpoint for price-delta
app.get('/api/insights/price-delta/test', asyncHandler(async (_req, res) => {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total_listings,
      COUNT(DISTINCT l.model_id) as matched_models,
      COUNT(CASE WHEN p.entry_price_eur IS NOT NULL AND l.price_eur IS NOT NULL THEN 1 END) as with_price_comparison
    FROM listings l
    LEFT JOIN models m ON m.id = l.model_id
    LEFT JOIN LATERAL (
      SELECT entry_price_eur, year
      FROM prices p2
      WHERE p2.model_id = m.id
      ORDER BY ABS(p2.year - COALESCE(l.year, 0)) ASC
      LIMIT 1
    ) p ON true
  `);
  res.json(result.rows[0]);
}));

app.get(
  '/stats/overview',
  asyncHandler(async (_req, res) => {
    const [makers, models, ads, sales] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM makers'),
      pool.query('SELECT COUNT(*) AS count FROM models'),
      pool.query('SELECT COUNT(*) AS count FROM listings'),
      pool.query('SELECT COALESCE(SUM(units), 0) AS count FROM sales')
    ]);

    res.json({
      makers: Number(makers.rows[0].count),
      models: Number(models.rows[0].count),
      ads: Number(ads.rows[0].count),
      sales_units: Number(sales.rows[0].count)
    });
  })
);

app.get(
  '/sales/trends',
  asyncHandler(async (req, res) => {
    const { maker, model, genmodel_id: genmodelId, fromYear = 2001, toYear = 2020 } = req.query;
    const params = [];
    const filters = ['s.year >= $1', 's.year <= $2'];
    params.push(Number(fromYear), Number(toYear));
    let idx = params.length + 1;

    if (maker) {
      filters.push(`mk.name ILIKE $${idx++}`);
      params.push(`%${maker}%`);
    }
    if (model) {
      filters.push(`m.name ILIKE $${idx++}`);
      params.push(`%${model}%`);
    }
    if (genmodelId) {
      filters.push(`m.genmodel_id = $${idx++}`);
      params.push(genmodelId);
    }

    const query = `
      SELECT s.year, SUM(s.units) AS units
      FROM sales s
      JOIN models m ON m.id = s.model_id
      JOIN makers mk ON mk.id = m.maker_id
      WHERE ${filters.join(' AND ')}
      GROUP BY s.year
      ORDER BY s.year;
    `;

    const result = await pool.query(query, params);
    res.json(result.rows.map((r) => ({ year: Number(r.year), units: Number(r.units) })));
  })
);

app.get(
  '/sales/top-models',
  asyncHandler(async (req, res) => {
    const { year, maker, limit = 10 } = req.query;
    const params = [];
    const filters = [];
    let idx = 1;

    if (year) {
      filters.push(`s.year = $${idx++}`);
      params.push(Number(year));
    }
    if (maker) {
      filters.push(`mk.name ILIKE $${idx++}`);
      params.push(`%${maker}%`);
    }

    const query = `
      SELECT mk.name AS maker, m.name AS model, SUM(s.units) AS total_units
      FROM sales s
      JOIN models m ON m.id = s.model_id
      JOIN makers mk ON mk.id = m.maker_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      GROUP BY mk.name, m.name
      ORDER BY total_units DESC
      LIMIT $${idx};
    `;
    params.push(Number(limit));

    const result = await pool.query(query, params);
    res.json(
      result.rows.map((r) => ({
        maker: r.maker,
        model: r.model,
        total_units: Number(r.total_units)
      }))
    );
  })
);

app.get(
  '/prices/summary',
  asyncHandler(async (req, res) => {
    const { maker, model, limit = 20 } = req.query;
    const params = [];
    const filters = [];
    let idx = 1;

    if (maker) {
      filters.push(`mk.name ILIKE $${idx++}`);
      params.push(`%${maker}%`);
    }
    if (model) {
      filters.push(`m.name ILIKE $${idx++}`);
      params.push(`%${model}%`);
    }

    const query = `
      SELECT
        mk.name AS maker,
        m.name AS model,
        AVG(p.entry_price_eur) AS avg_entry_price_eur,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY p.entry_price_eur) AS median_entry_price_eur,
        MIN(p.year) AS first_year,
        MAX(p.year) AS last_year
      FROM prices p
      JOIN models m ON m.id = p.model_id
      JOIN makers mk ON mk.id = m.maker_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      GROUP BY mk.name, m.name
      ORDER BY avg_entry_price_eur DESC
      LIMIT $${idx};
    `;
    params.push(Number(limit));

    const result = await pool.query(query, params);
    res.json(
      result.rows.map((r) => ({
        maker: r.maker,
        model: r.model,
        avg_entry_price_eur: r.avg_entry_price_eur ? Number(r.avg_entry_price_eur) : null,
        median_entry_price_eur: r.median_entry_price_eur ? Number(r.median_entry_price_eur) : null,
        first_year: r.first_year ? Number(r.first_year) : null,
        last_year: r.last_year ? Number(r.last_year) : null
      }))
    );
  })
);

// Price delta insights endpoint
app.get(
  '/api/insights/price-delta',
  asyncHandler(async (req, res) => {
    try {
      const { maker, model, minPrice, maxPrice, minDiscount, maxDiscount, limit = 50, offset = 0, sortBy = 'price_delta_percent' } = req.query;
      const params = [];
      const filters = [];
      let idx = 1;

      // Build filters
      if (maker) {
        filters.push(`(l.extracted_make ILIKE $${idx} OR mk.name ILIKE $${idx})`);
        params.push(`%${maker}%`);
        idx++;
      }
      if (model) {
        filters.push(`(l.extracted_model ILIKE $${idx} OR m.name ILIKE $${idx})`);
        params.push(`%${model}%`);
        idx++;
      }
      if (minPrice) {
        filters.push(`l.price_eur >= $${idx}`);
        params.push(Number(minPrice));
        idx++;
      }
      if (maxPrice) {
        filters.push(`l.price_eur <= $${idx}`);
        params.push(Number(maxPrice));
        idx++;
      }
      if (minDiscount !== undefined) {
        filters.push(`((p.entry_price_eur - l.price_eur) / p.entry_price_eur * 100) >= $${idx}`);
        params.push(Number(minDiscount));
        idx++;
      }
      if (maxDiscount !== undefined) {
        filters.push(`((p.entry_price_eur - l.price_eur) / p.entry_price_eur * 100) <= $${idx}`);
        params.push(Number(maxDiscount));
        idx++;
      }

      // Only show listings where we have both listing price and original price
      filters.push(`p.entry_price_eur IS NOT NULL`);
      filters.push(`l.price_eur IS NOT NULL`);

      // Determine sort order
      const sortOrder = sortBy.startsWith('-') ? 'DESC' : 'ASC';
      const sortColumn = sortBy.replace(/^-/, '');
      const validSortColumns = {
        'price_delta_percent': 'price_delta_percent',
        'price_delta': 'price_delta',
        'price_eur': 'listing_price',
        'entry_price_eur': 'original_price',
        'listing_price': 'listing_price',
        'original_price': 'original_price',
        'listing_year': 'listing_year',
        'mileage_km': 'mileage_km',
        'title': 'title'
      };
      const orderBy = validSortColumns[sortColumn] || 'price_delta_percent';

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      const limitParam = idx;
      const offsetParam = idx + 1;
      params.push(Number(limit), Number(offset));

      const query = `
        WITH price_matches AS (
          SELECT DISTINCT ON (l.id)
            l.id,
            l.url,
            l.title,
            l.price_eur AS listing_price,
            l.year AS listing_year,
            l.mileage_km,
            p.entry_price_eur AS original_price,
            p.year AS original_year,
            l.extracted_make AS make,
            l.extracted_model AS model,
            mk.name AS matched_maker,
            m.name AS matched_model,
            (p.entry_price_eur - l.price_eur) AS price_delta,
            ROUND(((p.entry_price_eur - l.price_eur) / p.entry_price_eur * 100)::numeric, 2) AS price_delta_percent
          FROM listings l
          LEFT JOIN models m ON m.id = l.model_id
          LEFT JOIN makers mk ON mk.id = m.maker_id
          LEFT JOIN LATERAL (
            SELECT entry_price_eur, year
            FROM prices p2
            WHERE p2.model_id = m.id AND m.id IS NOT NULL
            ORDER BY ABS(p2.year - COALESCE(l.year, 0)) ASC
            LIMIT 1
          ) p ON m.id IS NOT NULL
          ${whereClause}
        )
        SELECT * FROM price_matches
        WHERE price_delta_percent IS NOT NULL
        ORDER BY ${orderBy} ${sortOrder} NULLS LAST
        LIMIT $${limitParam} OFFSET $${offsetParam};
      `;

      const countQuery = `
        WITH price_matches AS (
          SELECT DISTINCT ON (l.id)
            l.id,
            p.entry_price_eur,
            l.price_eur
          FROM listings l
          LEFT JOIN models m ON m.id = l.model_id
          LEFT JOIN makers mk ON mk.id = m.maker_id
          LEFT JOIN LATERAL (
            SELECT entry_price_eur, year
            FROM prices p2
            WHERE p2.model_id = m.id AND m.id IS NOT NULL
            ORDER BY ABS(p2.year - COALESCE(l.year, 0)) ASC
            LIMIT 1
          ) p ON m.id IS NOT NULL
          ${whereClause}
        )
        SELECT COUNT(*) AS total
        FROM price_matches
        WHERE entry_price_eur IS NOT NULL AND price_eur IS NOT NULL;
      `;

      const [result, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
      ]);

      res.json({
        data: result.rows.map((r) => ({
          id: r.id,
          url: r.url,
          title: r.title,
          listing_price: r.listing_price ? Number(r.listing_price) : null,
          listing_year: r.listing_year ? Number(r.listing_year) : null,
          mileage_km: r.mileage_km ? Number(r.mileage_km) : null,
          original_price: r.original_price ? Number(r.original_price) : null,
          original_year: r.original_year ? Number(r.original_year) : null,
          make: r.make || r.matched_maker,
          model: r.model || r.matched_model,
          price_delta: r.price_delta ? Number(r.price_delta) : null,
          price_delta_percent: r.price_delta_percent ? Number(r.price_delta_percent) : null
        })),
        total: Number(countResult.rows[0].total),
        limit: Number(limit),
        offset: Number(offset)
      });
    } catch (err) {
      console.error('Error in price-delta endpoint:', err);
      res.status(500).json({ 
        error: 'Failed to fetch price deltas', 
        message: err.message,
        details: err.stack 
      });
    }
  })
);

// Top sellers endpoint
app.get(
  '/api/insights/top-sellers',
  asyncHandler(async (req, res) => {
    const { year, limit = 20 } = req.query;
    const params = [];
    const filters = [];
    let idx = 1;

    if (year) {
      filters.push(`s.year = $${idx++}`);
      params.push(Number(year));
    }

    const query = `
      SELECT 
        mk.name AS maker,
        m.name AS model,
        s.year,
        s.units,
        SUM(s.units) OVER (PARTITION BY m.id ORDER BY s.year) AS cumulative_units
      FROM sales s
      JOIN models m ON m.id = s.model_id
      JOIN makers mk ON mk.id = m.maker_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY s.year, s.units DESC
      LIMIT $${idx};
    `;
    params.push(Number(limit));

    const result = await pool.query(query, params);
    
    // Group by year for trend data
    const byYear = {};
    result.rows.forEach((r) => {
      const yr = Number(r.year);
      if (!byYear[yr]) {
        byYear[yr] = [];
      }
      byYear[yr].push({
        maker: r.maker,
        model: r.model,
        units: Number(r.units),
        cumulative_units: Number(r.cumulative_units)
      });
    });

    // Get top models per year
    const topByYear = Object.keys(byYear)
      .sort((a, b) => Number(b) - Number(a))
      .map((yr) => ({
        year: Number(yr),
        models: byYear[yr].slice(0, 10) // Top 10 per year
      }));

    res.json({
      top_by_year: topByYear,
      trends: result.rows.map((r) => ({
        year: Number(r.year),
        maker: r.maker,
        model: r.model,
        units: Number(r.units)
      }))
    });
  })
);

// Listings summary endpoint
app.get(
  '/api/insights/listings-summary',
  asyncHandler(async (req, res) => {
    const { maker, model, limit = 20 } = req.query;
    const params = [];
    const filters = [];
    let idx = 1;

    if (maker) {
      filters.push(`(l.extracted_make ILIKE $${idx++} OR mk.name ILIKE $${idx - 1})`);
      params.push(`%${maker}%`);
    }
    if (model) {
      filters.push(`(l.extracted_model ILIKE $${idx++} OR m.name ILIKE $${idx - 1})`);
      params.push(`%${model}%`);
    }

    const query = `
      SELECT 
        COALESCE(mk.name, l.extracted_make) AS maker,
        COALESCE(m.name, l.extracted_model) AS model,
        COUNT(*) AS total_listings,
        AVG(l.price_eur) AS avg_price,
        MIN(l.price_eur) AS min_price,
        MAX(l.price_eur) AS max_price,
        AVG(l.mileage_km) AS avg_mileage,
        COUNT(DISTINCT l.year) AS year_count
      FROM listings l
      LEFT JOIN models m ON m.id = l.model_id
      LEFT JOIN makers mk ON mk.id = m.maker_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      GROUP BY COALESCE(mk.name, l.extracted_make), COALESCE(m.name, l.extracted_model)
      ORDER BY total_listings DESC
      LIMIT $${idx};
    `;
    params.push(Number(limit));

    const result = await pool.query(query, params);
    res.json(
      result.rows.map((r) => ({
        maker: r.maker,
        model: r.model,
        total_listings: Number(r.total_listings),
        avg_price: r.avg_price ? Number(r.avg_price) : null,
        min_price: r.min_price ? Number(r.min_price) : null,
        max_price: r.max_price ? Number(r.max_price) : null,
        avg_mileage: r.avg_mileage ? Number(r.avg_mileage) : null,
        year_count: Number(r.year_count)
      }))
    );
  })
);

// Get single listing with full details
app.get(
  '/api/listings/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT 
        l.id,
        l.url,
        l.title,
        l.price_eur,
        l.currency,
        l.mileage_km,
        l.year,
        l.location,
        l.description,
        l.images,
        l.specs,
        l.extracted_make AS make,
        l.extracted_model AS model,
        mk.name AS matched_maker,
        m.name AS matched_model
      FROM listings l
      LEFT JOIN models m ON m.id = l.model_id
      LEFT JOIN makers mk ON mk.id = m.maker_id
      WHERE l.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = result.rows[0];
    
    // Parse images (pipe-separated string) into array
    let imagesArray = [];
    if (listing.images) {
      imagesArray = listing.images.split('|').filter(img => img.trim() !== '');
    }

    // Parse specs JSONB
    let specsObj = null;
    if (listing.specs) {
      try {
        specsObj = typeof listing.specs === 'string' ? JSON.parse(listing.specs) : listing.specs;
      } catch (e) {
        // Invalid JSON, leave as null
      }
    }

    res.json({
      id: listing.id,
      url: listing.url,
      title: listing.title,
      price_eur: listing.price_eur ? Number(listing.price_eur) : null,
      currency: listing.currency,
      mileage_km: listing.mileage_km ? Number(listing.mileage_km) : null,
      year: listing.year ? Number(listing.year) : null,
      location: listing.location,
      description: listing.description,
      images: imagesArray,
      specs: specsObj,
      make: listing.make || listing.matched_maker,
      model: listing.model || listing.matched_model
    });
  })
);

// Get sales data for listing's model
app.get(
  '/api/listings/:id/sales',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // First get the listing to find its model
    const listingResult = await pool.query(
      `SELECT l.model_id, l.extracted_make, l.extracted_model, m.id AS matched_model_id, mk.name AS matched_maker, m.name AS matched_model
       FROM listings l
       LEFT JOIN models m ON m.id = l.model_id
       LEFT JOIN makers mk ON mk.id = m.maker_id
       WHERE l.id = $1`,
      [id]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = listingResult.rows[0];
    let query;
    let params = [];

    // If we have a matched model_id, use it directly
    if (listing.model_id && listing.matched_model_id) {
      query = `
        SELECT s.year, s.units
        FROM sales s
        WHERE s.model_id = $1
        ORDER BY s.year;
      `;
      params = [listing.model_id];
    } else {
      // Fallback to extracted_make/extracted_model with fuzzy matching
      const make = listing.extracted_make || listing.matched_maker;
      const model = listing.extracted_model || listing.matched_model;
      
      if (!make || !model) {
        return res.json([]);
      }

      query = `
        SELECT s.year, SUM(s.units) AS units
        FROM sales s
        JOIN models m ON m.id = s.model_id
        JOIN makers mk ON mk.id = m.maker_id
        WHERE mk.name ILIKE $1 AND m.name ILIKE $2
        GROUP BY s.year
        ORDER BY s.year;
      `;
      params = [`%${make}%`, `%${model}%`];
    }

    const result = await pool.query(query, params);
    res.json(
      result.rows.map((r) => ({
        year: Number(r.year),
        units: Number(r.units)
      }))
    );
  })
);

// Get original entry prices for listing's model
app.get(
  '/api/listings/:id/prices',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // First get the listing to find its model
    const listingResult = await pool.query(
      `SELECT l.model_id, l.extracted_make, l.extracted_model, m.id AS matched_model_id, mk.name AS matched_maker, m.name AS matched_model
       FROM listings l
       LEFT JOIN models m ON m.id = l.model_id
       LEFT JOIN makers mk ON mk.id = m.maker_id
       WHERE l.id = $1`,
      [id]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = listingResult.rows[0];
    let query;
    let params = [];

    // If we have a matched model_id, use it directly
    if (listing.model_id && listing.matched_model_id) {
      query = `
        SELECT p.year, p.entry_price_eur
        FROM prices p
        WHERE p.model_id = $1
        ORDER BY p.year;
      `;
      params = [listing.model_id];
    } else {
      // Fallback to extracted_make/extracted_model with fuzzy matching
      const make = listing.extracted_make || listing.matched_maker;
      const model = listing.extracted_model || listing.matched_model;
      
      if (!make || !model) {
        return res.json([]);
      }

      query = `
        SELECT p.year, AVG(p.entry_price_eur) AS entry_price_eur
        FROM prices p
        JOIN models m ON m.id = p.model_id
        JOIN makers mk ON mk.id = m.maker_id
        WHERE mk.name ILIKE $1 AND m.name ILIKE $2
        GROUP BY p.year
        ORDER BY p.year;
      `;
      params = [`%${make}%`, `%${model}%`];
    }

    const result = await pool.query(query, params);
    res.json(
      result.rows.map((r) => ({
        year: Number(r.year),
        entry_price_eur: r.entry_price_eur ? Number(r.entry_price_eur) : null
      }))
    );
  })
);

// Analytics routes (proxy to ML service)
const analyticsRoutes = require('./routes/analytics');
app.use('/api/analytics', analyticsRoutes);

// Sold cars endpoints (from Ad_table.csv)
app.get('/api/sold-cars/depreciation', asyncHandler(async (req, res) => {
  const { maker, model, regYearFrom, regYearTo } = req.query;
  const params = [];
  const filters = [];
  let idx = 1;

  if (maker) {
    filters.push(`maker ILIKE $${idx++}`);
    params.push(`%${maker}%`);
  }
  if (model) {
    filters.push(`genmodel ILIKE $${idx++}`);
    params.push(`%${model}%`);
  }
  if (regYearFrom) {
    filters.push(`reg_year >= $${idx++}`);
    params.push(Number(regYearFrom));
  }
  if (regYearTo) {
    filters.push(`reg_year <= $${idx++}`);
    params.push(Number(regYearTo));
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      reg_year,
      AVG(price) AS avg_price,
      COUNT(*) AS count
    FROM sold_cars
    ${whereClause}
    GROUP BY reg_year
    HAVING COUNT(*) > 0
    ORDER BY reg_year
  `;

  const result = await pool.query(query, params);
  res.json({
    trends: result.rows.map(r => ({
      reg_year: Number(r.reg_year),
      avg_price: r.avg_price ? Number(r.avg_price) : null,
      count: Number(r.count)
    }))
  });
}));

app.get('/api/sold-cars/price-trends', asyncHandler(async (req, res) => {
  const { maker, model, yearFrom, yearTo } = req.query;
  const params = [];
  const filters = [];
  let idx = 1;

  if (maker) {
    filters.push(`maker ILIKE $${idx++}`);
    params.push(`%${maker}%`);
  }
  if (model) {
    filters.push(`genmodel ILIKE $${idx++}`);
    params.push(`%${model}%`);
  }
  if (yearFrom) {
    filters.push(`adv_year >= $${idx++}`);
    params.push(Number(yearFrom));
  }
  if (yearTo) {
    filters.push(`adv_year <= $${idx++}`);
    params.push(Number(yearTo));
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      adv_year AS year,
      AVG(price) AS avg_price,
      COUNT(*) AS count
    FROM sold_cars
    ${whereClause}
    GROUP BY adv_year
    HAVING COUNT(*) > 0
    ORDER BY adv_year
  `;

  const result = await pool.query(query, params);
  res.json({
    trends: result.rows.map(r => ({
      year: Number(r.year),
      avg_price: r.avg_price ? Number(r.avg_price) : null,
      count: Number(r.count)
    }))
  });
}));

app.get('/api/sold-cars/market-history', asyncHandler(async (req, res) => {
  const { maker, model, limit = 50, offset = 0 } = req.query;
  const params = [];
  const filters = [];
  let idx = 1;

  if (maker) {
    filters.push(`maker ILIKE $${idx++}`);
    params.push(`%${maker}%`);
  }
  if (model) {
    filters.push(`genmodel ILIKE $${idx++}`);
    params.push(`%${model}%`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(Number(limit), Number(offset));

  const query = `
    SELECT 
      maker,
      genmodel,
      reg_year,
      adv_year,
      price,
      runned_miles,
      bodytype,
      color,
      fuel_type,
      gearbox
    FROM sold_cars
    ${whereClause}
    ORDER BY adv_year DESC, price DESC
    LIMIT $${idx++} OFFSET $${idx}
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM sold_cars
    ${whereClause}
  `;

  const [result, countResult] = await Promise.all([
    pool.query(query, params),
    pool.query(countQuery, params.slice(0, -2))
  ]);

  res.json({
    data: result.rows.map(r => ({
      maker: r.maker,
      genmodel: r.genmodel,
      reg_year: r.reg_year ? Number(r.reg_year) : null,
      adv_year: r.adv_year ? Number(r.adv_year) : null,
      price: r.price ? Number(r.price) : null,
      runned_miles: r.runned_miles ? Number(r.runned_miles) : null,
      bodytype: r.bodytype,
      color: r.color,
      fuel_type: r.fuel_type,
      gearbox: r.gearbox
    })),
    total: Number(countResult.rows[0].total)
  });
}));

app.get('/api/sold-cars/bodytype-analysis', asyncHandler(async (req, res) => {
  const { bodytype, year } = req.query;
  const params = [];
  const filters = [];
  let idx = 1;

  if (bodytype) {
    filters.push(`bodytype ILIKE $${idx++}`);
    params.push(`%${bodytype}%`);
  }
  if (year) {
    filters.push(`adv_year = $${idx++}`);
    params.push(Number(year));
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      bodytype,
      AVG(price) AS avg_price,
      COUNT(*) AS count
    FROM sold_cars
    ${whereClause}
    GROUP BY bodytype
    HAVING COUNT(*) > 0
    ORDER BY count DESC
    LIMIT 20
  `;

  const result = await pool.query(query, params);
  res.json(result.rows.map(r => ({
    bodytype: r.bodytype,
    avg_price: r.avg_price ? Number(r.avg_price) : null,
    count: Number(r.count)
  })));
}));

app.get('/api/sold-cars/color-trends', asyncHandler(async (req, res) => {
  const { maker, model, yearFrom, yearTo } = req.query;
  const params = [];
  const filters = [];
  let idx = 1;

  if (maker) {
    filters.push(`maker ILIKE $${idx++}`);
    params.push(`%${maker}%`);
  }
  if (model) {
    filters.push(`genmodel ILIKE $${idx++}`);
    params.push(`%${model}%`);
  }
  if (yearFrom) {
    filters.push(`adv_year >= $${idx++}`);
    params.push(Number(yearFrom));
  }
  if (yearTo) {
    filters.push(`adv_year <= $${idx++}`);
    params.push(Number(yearTo));
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      color,
      COUNT(*) AS count
    FROM sold_cars
    ${whereClause}
    GROUP BY color
    HAVING COUNT(*) > 0 AND color IS NOT NULL AND color != ''
    ORDER BY count DESC
    LIMIT 20
  `;

  const result = await pool.query(query, params);
  res.json({
    trends: result.rows.map(r => ({
      color: r.color,
      count: Number(r.count)
    }))
  });
}));

// Autofill endpoints
app.get('/api/autofill/makers', asyncHandler(async (req, res) => {
  const { q = '' } = req.query;
  const query = `
    SELECT DISTINCT name
    FROM makers
    WHERE name ILIKE $1
    ORDER BY name
    LIMIT 20
  `;
  const result = await pool.query(query, [`%${q}%`]);
  res.json({ suggestions: result.rows.map(r => r.name) });
}));

app.get('/api/autofill/models', asyncHandler(async (req, res) => {
  const { maker, q = '' } = req.query;
  if (!maker) {
    return res.json({ suggestions: [] });
  }
  
  const query = `
    SELECT DISTINCT m.name
    FROM models m
    JOIN makers mk ON mk.id = m.maker_id
    WHERE mk.name ILIKE $1 AND m.name ILIKE $2
    ORDER BY m.name
    LIMIT 20
  `;
  const result = await pool.query(query, [`%${maker}%`, `%${q}%`]);
  res.json({ suggestions: result.rows.map(r => r.name) });
}));

// Listings search endpoint for comparison page
app.get('/api/listings/search', asyncHandler(async (req, res) => {
  const { maker, model, q, limit = 20 } = req.query;
  const params = [];
  const filters = [];
  let idx = 1;

  if (maker) {
    filters.push(`(l.extracted_make ILIKE $${idx} OR mk.name ILIKE $${idx})`);
    params.push(`%${maker}%`);
    idx++;
  }
  if (model) {
    filters.push(`(l.extracted_model ILIKE $${idx} OR m.name ILIKE $${idx})`);
    params.push(`%${model}%`);
    idx++;
  }
  if (q) {
    filters.push(`(l.title ILIKE $${idx} OR l.description ILIKE $${idx})`);
    params.push(`%${q}%`);
    idx++;
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(Number(limit));

  const query = `
    SELECT DISTINCT
      l.id,
      l.title,
      l.price_eur,
      l.year,
      l.mileage_km,
      COALESCE(mk.name, l.extracted_make) AS make,
      COALESCE(m.name, l.extracted_model) AS model
    FROM listings l
    LEFT JOIN models m ON m.id = l.model_id
    LEFT JOIN makers mk ON mk.id = m.maker_id
    ${whereClause}
    ORDER BY l.price_eur DESC
    LIMIT $${idx}
  `;

  const result = await pool.query(query, params);
  res.json({
    results: result.rows.map(r => ({
      id: r.id,
      title: r.title,
      price_eur: r.price_eur ? Number(r.price_eur) : null,
      year: r.year ? Number(r.year) : null,
      mileage_km: r.mileage_km ? Number(r.mileage_km) : null,
      make: r.make,
      model: r.model
    }))
  });
}));

app.use((err, _req, res, _next) => {
  console.error('Error handler:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ 
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

async function start() {
  try {
    console.log('Waiting for database connection...');
    await waitForDatabase();
    
    console.log('Seeding database (idempotent)...');
    await seedAll();
    
    app.listen(PORT, () => {
      console.log(`API running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();

