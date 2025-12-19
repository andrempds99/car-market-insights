-- Price predictions cache
CREATE TABLE IF NOT EXISTS price_predictions (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES listings(id),
    predicted_price NUMERIC,
    confidence_score NUMERIC,
    model_version TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Market insights cache
CREATE TABLE IF NOT EXISTS market_insights (
    id SERIAL PRIMARY KEY,
    insight_type TEXT,
    insight_data JSONB,
    generated_at TIMESTAMP DEFAULT NOW()
);

-- User saved searches (for UX enhancements)
CREATE TABLE IF NOT EXISTS saved_searches (
    id SERIAL PRIMARY KEY,
    user_id TEXT, -- or implement user auth
    search_criteria JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_price_predictions_listing ON price_predictions(listing_id);
CREATE INDEX IF NOT EXISTS idx_market_insights_type ON market_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);

