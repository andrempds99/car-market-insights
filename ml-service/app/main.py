"""FastAPI main application for ML service."""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, List
import uvicorn
from app.utils.database import test_connection, execute_query
from app.analytics.price_analytics import PriceAnalytics
from app.analytics.mileage_analytics import MileageAnalytics
from app.analytics.location_analytics import LocationAnalytics
from app.analytics.time_series import TimeSeriesAnalytics
from app.models.price_predictor import PricePredictor
from app.models.sales_forecaster import SalesForecaster
from app.models.depreciation_model import DepreciationModel

# Initialize ML models (lazy loading)
price_predictor = None
sales_forecaster = None
depreciation_model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    # Startup
    global price_predictor, sales_forecaster, depreciation_model
    
    # Test database connection
    if not test_connection():
        print("Warning: Database connection failed. Some features may not work.")
    
    # Initialize models (will be loaded on first use)
    try:
        price_predictor = PricePredictor()
        sales_forecaster = SalesForecaster()
        depreciation_model = DepreciationModel()
    except Exception as e:
        print(f"Warning: Could not initialize ML models: {e}")
    
    yield
    
    # Shutdown (if needed)
    pass

app = FastAPI(title="Car Market ML Service", version="1.0.0", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize analytics modules
price_analytics = PriceAnalytics()
mileage_analytics = MileageAnalytics()
location_analytics = LocationAnalytics()
time_series_analytics = TimeSeriesAnalytics()


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    db_status = test_connection()
    return {
        "status": "ok" if db_status else "degraded",
        "database": "connected" if db_status else "disconnected"
    }


# Price Analytics Endpoints
@app.post("/ml/predict/price")
async def predict_price(listing: Dict[str, Any]):
    """Predict price for a listing."""
    try:
        if price_predictor is None:
            price_predictor = PricePredictor()
        prediction = price_predictor.predict(listing)
        return prediction
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ml/analytics/price/fmv")
async def get_fair_market_value(
    make: Optional[str] = None,
    model: Optional[str] = None,
    year: Optional[int] = None,
    mileage_km: Optional[float] = None,
    fuel_type: Optional[int] = None,
    transmission: Optional[int] = None
):
    """Calculate fair market value."""
    try:
        result = price_analytics.calculate_fmv(
            make=make,
            model=model,
            year=year,
            mileage_km=mileage_km,
            fuel_type=fuel_type,
            transmission=transmission
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ml/analytics/price/anomalies")
async def get_price_anomalies(
    limit: int = Query(50, ge=1, le=500),
    threshold: float = Query(2.0, ge=1.0, le=5.0),
    make: Optional[str] = None,
    model: Optional[str] = None,
    year: Optional[int] = None
):
    """Get price anomalies."""
    try:
        result = price_analytics.detect_anomalies(
            limit=limit,
            threshold=threshold,
            make=make,
            model=model,
            year=year
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ml/analytics/price/distribution")
async def get_price_distribution(
    make: Optional[str] = None,
    model: Optional[str] = None,
    year: Optional[int] = None,
    mileage_km: Optional[float] = None
):
    """Get price distribution statistics."""
    try:
        result = price_analytics.get_distribution(
            make=make,
            model=model,
            year=year,
            mileage_km=mileage_km
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Mileage Analytics Endpoints
@app.get("/ml/analytics/mileage/distribution")
async def get_mileage_distribution(
    make: Optional[str] = None,
    model: Optional[str] = None,
    year: Optional[int] = None
):
    """Get mileage distribution."""
    try:
        result = mileage_analytics.get_distribution(make=make, model=model, year=year)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ml/analytics/mileage/depreciation")
async def get_depreciation_curves(
    make: Optional[str] = None,
    model: Optional[str] = None
):
    """Get depreciation curves."""
    try:
        global depreciation_model
        if depreciation_model is None:
            depreciation_model = DepreciationModel()
        result = depreciation_model.get_curves(make=make, model=model)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ml/analytics/mileage/anomalies")
async def get_mileage_anomalies(limit: int = Query(50, ge=1, le=500)):
    """Get mileage anomalies."""
    try:
        result = mileage_analytics.detect_anomalies(limit=limit)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Location Analytics Endpoints
@app.get("/ml/analytics/location/heatmap")
async def get_location_heatmap():
    """Get price heatmap data by location."""
    try:
        result = location_analytics.get_heatmap_data()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ml/analytics/location/premiums")
async def get_location_premiums():
    """Get location-based price premiums."""
    try:
        result = location_analytics.calculate_premiums()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Sales Forecasting Endpoints
@app.get("/ml/predict/sales")
async def predict_sales(
    make: Optional[str] = None,
    model: Optional[str] = None,
    periods: int = Query(12, ge=1, le=60)
):
    """Predict future sales volumes."""
    try:
        global sales_forecaster
        if sales_forecaster is None:
            sales_forecaster = SalesForecaster()
        result = await sales_forecaster.forecast(make=make, model=model, periods=periods)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ml/analytics/sales/market-share")
async def get_market_share(
    year: Optional[int] = None
):
    """Get market share analysis."""
    try:
        query = """
            SELECT 
                mk.name AS maker,
                COUNT(DISTINCT m.id) AS model_count,
                SUM(s.units) AS total_units,
                ROUND(100.0 * SUM(s.units) / SUM(SUM(s.units)) OVER (), 2) AS market_share_percent
            FROM sales s
            JOIN models m ON m.id = s.model_id
            JOIN makers mk ON mk.id = m.maker_id
            WHERE ($1::int IS NULL OR s.year = $1)
            GROUP BY mk.name
            ORDER BY total_units DESC
            LIMIT 20
        """
        results = execute_query(query, (year,))
        return {"market_share": [dict(row) for row in results]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Time Series Endpoints
@app.get("/ml/analytics/time-series/price-evolution")
async def get_price_evolution(
    make: Optional[str] = None,
    model: Optional[str] = None
):
    """Get price evolution over time."""
    try:
        result = time_series_analytics.get_price_evolution(make=make, model=model)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ml/analytics/time-series/seasonal")
async def get_seasonal_patterns(
    make: Optional[str] = None,
    model: Optional[str] = None
):
    """Get seasonal price patterns."""
    try:
        result = time_series_analytics.get_seasonal_patterns(make=make, model=model)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Model Management Endpoints
@app.get("/ml/models/status")
async def get_models_status():
    """Get status of ML models."""
    return {
        "price_predictor": price_predictor is not None,
        "sales_forecaster": sales_forecaster is not None,
        "depreciation_model": depreciation_model is not None
    }


@app.post("/ml/models/retrain")
async def retrain_models():
    """Retrain all ML models."""
    try:
        global price_predictor, sales_forecaster, depreciation_model
        
        price_predictor = PricePredictor()
        price_predictor.train()
        
        sales_forecaster = SalesForecaster()
        sales_forecaster.train()
        
        depreciation_model = DepreciationModel()
        depreciation_model.train()
        
        return {"status": "success", "message": "All models retrained"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

