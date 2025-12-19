const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { pool } = require('./db');

const defaultDataset = path.join(process.cwd(), 'dataset_v2');
const siblingDataset = path.join(process.cwd(), '..', 'dataset_v2');
const DATASET_DIR = process.env.DATASET_PATH || (fs.existsSync(defaultDataset) ? defaultDataset : siblingDataset);

const SALES_FILE = process.env.SALES_FILE || csvPath('Sales_table.csv');
const PRICE_FILE = process.env.PRICE_FILE || csvPath('Price_table_enriched.csv');
const LISTINGS_FILE = process.env.LISTINGS_FILE || 
  (fs.existsSync(path.join(process.cwd(), 'data', 'versicar_cars.csv')) 
    ? path.join(process.cwd(), 'data', 'versicar_cars.csv')
    : (fs.existsSync(path.join(process.cwd(), 'listings', 'versicar_cars.csv'))
      ? path.join(process.cwd(), 'listings', 'versicar_cars.csv')
      : path.join(process.cwd(), '..', 'scrapping_versicar', 'data', 'versicar_cars.csv')));

const AD_TABLE_FILE = process.env.AD_TABLE_FILE || csvPath('Ad_table.csv');

function csvPath(fileName) {
  return path.join(DATASET_DIR, fileName);
}

const makerCache = new Map();
const modelCache = new Map();

const parseIntOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isNaN(n) ? null : n;
};

async function initSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS makers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS models (
      id SERIAL PRIMARY KEY,
      maker_id INTEGER NOT NULL REFERENCES makers(id),
      name TEXT NOT NULL,
      genmodel_id TEXT NOT NULL,
      UNIQUE (maker_id, genmodel_id)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS sales (
      model_id INTEGER NOT NULL REFERENCES models(id),
      year INTEGER NOT NULL,
      units INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (model_id, year)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS prices (
      model_id INTEGER NOT NULL REFERENCES models(id),
      year INTEGER NOT NULL,
      entry_price NUMERIC,
      entry_price_eur NUMERIC,
      PRIMARY KEY (model_id, year)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS listings (
      id SERIAL PRIMARY KEY,
      url TEXT UNIQUE,
      title TEXT,
      price_eur NUMERIC,
      currency TEXT,
      mileage_km NUMERIC,
      year INTEGER,
      location TEXT,
      description TEXT,
      images TEXT,
      specs JSONB,
      model_id INTEGER REFERENCES models(id),
      extracted_make TEXT,
      extracted_model TEXT
    );
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_models_maker ON models(maker_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_year ON sales(year);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_model ON listings(model_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price_eur);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_year ON listings(year);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_make_model ON listings(extracted_make, extracted_model);`);

  // Analytics tables
  await client.query(`
    CREATE TABLE IF NOT EXISTS price_predictions (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER REFERENCES listings(id),
      predicted_price NUMERIC,
      confidence_score NUMERIC,
      model_version TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS market_insights (
      id SERIAL PRIMARY KEY,
      insight_type TEXT,
      insight_data JSONB,
      generated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      search_criteria JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_price_predictions_listing ON price_predictions(listing_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_market_insights_type ON market_insights(insight_type);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);`);

  // Sold cars table (from Ad_table.csv)
  await client.query(`
    CREATE TABLE IF NOT EXISTS sold_cars (
      id SERIAL PRIMARY KEY,
      maker VARCHAR(255),
      genmodel VARCHAR(255),
      genmodel_id VARCHAR(50),
      adv_id VARCHAR(255),
      adv_year INTEGER,
      adv_month INTEGER,
      color VARCHAR(100),
      reg_year INTEGER,
      bodytype VARCHAR(100),
      runned_miles INTEGER,
      engine_size VARCHAR(50),
      gearbox VARCHAR(50),
      fuel_type VARCHAR(50),
      price DECIMAL(12,2),
      seat_num INTEGER,
      door_num INTEGER
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sold_cars_maker ON sold_cars(maker);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sold_cars_genmodel ON sold_cars(genmodel);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sold_cars_adv_year ON sold_cars(adv_year);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sold_cars_reg_year ON sold_cars(reg_year);`);
}

async function getMakerId(client, makerName) {
  const key = makerName.trim().toUpperCase();
  if (makerCache.has(key)) return makerCache.get(key);
  const result = await client.query(
    `INSERT INTO makers (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [makerName.trim()]
  );
  const id = result.rows[0].id;
  makerCache.set(key, id);
  return id;
}

async function getModelId(client, makerId, modelName, genmodelId) {
  const cacheKey = `${makerId}::${genmodelId}`;
  if (modelCache.has(cacheKey)) return modelCache.get(cacheKey);
  const result = await client.query(
    `INSERT INTO models (maker_id, name, genmodel_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (maker_id, genmodel_id) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [makerId, modelName.trim(), genmodelId.trim()]
  );
  const id = result.rows[0].id;
  modelCache.set(cacheKey, id);
  return id;
}

async function seedSales(client) {
  const parser = fs.createReadStream(SALES_FILE).pipe(
    parse({
      columns: true,
      trim: true
    })
  );

  let rows = 0;
  for await (const record of parser) {
    const makerId = await getMakerId(client, record.Maker);
    const modelId = await getModelId(client, makerId, record.Genmodel, record.Genmodel_ID);

    for (let year = 2001; year <= 2020; year += 1) {
      const value = parseIntOrNull(record[String(year)]) || 0;
      await client.query(
        `INSERT INTO sales (model_id, year, units)
         VALUES ($1, $2, $3)
         ON CONFLICT (model_id, year) DO UPDATE SET units = EXCLUDED.units`,
        [modelId, year, value]
      );
    }
    rows += 1;
  }
  return rows;
}

async function seedPrices(client) {
  const parser = fs.createReadStream(PRICE_FILE).pipe(
    parse({
      columns: true,
      trim: true
    })
  );

  let rows = 0;
  for await (const record of parser) {
    const makerName = record.maker_canonical || record.Maker;
    const modelName = record.Genmodel || record.model_norm || record.Model;
    const genmodelId = record.Genmodel_ID || record.genmodel_id || record.key || record.Genmodel_ID;

    if (!makerName || !modelName || !genmodelId) continue;

    const makerId = await getMakerId(client, makerName);
    const modelId = await getModelId(client, makerId, modelName, genmodelId);

    const year = parseIntOrNull(record.Year);
    const entryPrice = record.Entry_price ? Number(record.Entry_price) : null;
    const entryPriceEur = record.Entry_price_eur ? Number(record.Entry_price_eur) : null;

    if (!year) continue;

    await client.query(
      `INSERT INTO prices (model_id, year, entry_price, entry_price_eur)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (model_id, year) DO UPDATE
       SET entry_price = EXCLUDED.entry_price,
           entry_price_eur = EXCLUDED.entry_price_eur`,
      [modelId, year, entryPrice, entryPriceEur]
    );
    rows += 1;
  }
  return rows;
}

// Helper function to extract make and model from title
function extractMakeModel(title) {
  if (!title) return { make: null, model: null };
  
  // Common patterns: "Mercedes-Benz C 300 AMG", "Skoda Octavia Octavia Combi 2.0 TSI"
  // Try to split on first space or dash
  const parts = title.trim().split(/\s+/);
  if (parts.length < 2) return { make: parts[0] || null, model: null };
  
  // Handle hyphenated makes like "Mercedes-Benz"
  let make = parts[0];
  if (parts.length > 1 && parts[1] === 'Benz') {
    make = `${parts[0]}-${parts[1]}`;
    parts.shift();
  }
  parts.shift();
  
  // Model is the rest, but remove common suffixes like engine codes
  let model = parts.join(' ').replace(/\s+\d+\.\d+\s*[A-Z]+.*$/i, '').trim();
  
  return { make, model };
}

async function seedListings(client) {
  if (!fs.existsSync(LISTINGS_FILE)) {
    console.log(`Listings file not found: ${LISTINGS_FILE}, skipping...`);
    return 0;
  }

  const parser = fs.createReadStream(LISTINGS_FILE).pipe(
    parse({
      columns: true,
      trim: true,
      skip_empty_lines: true
    })
  );

  let rows = 0;
  let matched = 0;
  
  for await (const record of parser) {
    const { make, model } = extractMakeModel(record.title);
    
    let modelId = null;
    if (make && model) {
      // Try to find matching maker and model
      try {
        const makerResult = await client.query(
          `SELECT id FROM makers WHERE name ILIKE $1 LIMIT 1`,
          [make]
        );
        
        if (makerResult.rows.length > 0) {
          const makerId = makerResult.rows[0].id;
          // Try to find model by name (fuzzy match)
          const modelResult = await client.query(
            `SELECT id FROM models WHERE maker_id = $1 AND name ILIKE $2 LIMIT 1`,
            [makerId, `%${model.split(' ')[0]}%`]
          );
          
          if (modelResult.rows.length > 0) {
            modelId = modelResult.rows[0].id;
            matched++;
          }
        }
      } catch (err) {
        // Ignore matching errors, just store the listing without model_id
      }
    }

    const priceEur = record.price_eur ? parseFloat(record.price_eur) : null;
    const mileageKm = record.mileage_km ? parseFloat(record.mileage_km) : null;
    const year = parseIntOrNull(record.year);
    
    let specs = null;
    if (record.specs) {
      try {
        specs = JSON.parse(record.specs);
      } catch (e) {
        // Invalid JSON, ignore
      }
    }

    await client.query(
      `INSERT INTO listings (
         url, title, price_eur, currency, mileage_km, year, location,
         description, images, specs, model_id, extracted_make, extracted_model
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (url) DO UPDATE SET
         title = EXCLUDED.title,
         price_eur = EXCLUDED.price_eur,
         mileage_km = EXCLUDED.mileage_km,
         year = EXCLUDED.year,
         model_id = EXCLUDED.model_id`,
      [
        record.url || null,
        record.title || null,
        priceEur,
        record.currency || null,
        mileageKm,
        year,
        record.location || null,
        record.description || null,
        record.images || null,
        specs ? JSON.stringify(specs) : null,
        modelId,
        make,
        model
      ]
    );

    rows += 1;
    if (rows % 1000 === 0) {
      console.log(`  Processed ${rows} listings (${matched} matched to models)...`);
    }
  }
  
  console.log(`  Total listings: ${rows}, matched to models: ${matched}`);
  return rows;
}

async function seedSoldCars(client) {
  if (!fs.existsSync(AD_TABLE_FILE)) {
    console.log(`Ad_table file not found: ${AD_TABLE_FILE}, skipping...`);
    return 0;
  }

  const parser = fs.createReadStream(AD_TABLE_FILE).pipe(
    parse({
      columns: true,
      trim: true,
      skip_empty_lines: true
    })
  );

  let rows = 0;
  
  for await (const record of parser) {
    const maker = record.Maker || null;
    const genmodel = record.Genmodel || null;
    const genmodelId = record.Genmodel_ID || null;
    const advId = record.Adv_ID || null;
    const advYear = parseIntOrNull(record.Adv_year);
    const advMonth = parseIntOrNull(record.Adv_month);
    const color = record.Color || null;
    const regYear = parseIntOrNull(record.Reg_year);
    const bodytype = record.Bodytype || null;
    const runnedMiles = parseIntOrNull(record.Runned_Miles);
    const engineSize = record.Engin_size || null;
    const gearbox = record.Gearbox || null;
    const fuelType = record.Fuel_type || null;
    const price = record.Price ? parseFloat(record.Price) : null;
    const seatNum = parseIntOrNull(record.Seat_num);
    const doorNum = parseIntOrNull(record.Door_num);

    await client.query(
      `INSERT INTO sold_cars (
         maker, genmodel, genmodel_id, adv_id, adv_year, adv_month, color,
         reg_year, bodytype, runned_miles, engine_size, gearbox, fuel_type,
         price, seat_num, door_num
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        maker, genmodel, genmodelId, advId, advYear, advMonth, color,
        regYear, bodytype, runnedMiles, engineSize, gearbox, fuelType,
        price, seatNum, doorNum
      ]
    );
    rows += 1;
    
    if (rows % 10000 === 0) {
      console.log(`  Processed ${rows} sold car records...`);
    }
  }
  return rows;
}

async function seedAll() {
  const client = await pool.connect();
  try {
    console.log('Initializing schema...');
    await initSchema(client);

    console.log('Seeding sales data...');
    const salesCount = await seedSales(client);
    console.log(`Sales rows processed: ${salesCount}`);

    console.log('Seeding price data...');
    const priceCount = await seedPrices(client);
    console.log(`Price rows processed: ${priceCount}`);

    console.log('Seeding listings data (this may take a moment)...');
    const listingCount = await seedListings(client);
    console.log(`Listings rows processed: ${listingCount}`);

    console.log('Seeding sold cars data (this may take a moment)...');
    const soldCarsCount = await seedSoldCars(client);
    console.log(`Sold cars rows processed: ${soldCarsCount}`);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedAll()
    .then(() => {
      console.log('Seeding finished');
      return pool.end();
    })
    .catch((err) => {
      console.error('Seeding failed', err);
      process.exit(1);
    });
}

module.exports = {
  seedAll
};

