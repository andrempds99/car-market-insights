# ML Service

Python FastAPI service for machine learning models and analytics.

## Features

- Price prediction using XGBoost/Random Forest
- Sales forecasting using Prophet
- Depreciation curve analysis
- Price, mileage, and location analytics
- Time series analysis

## Endpoints

See `app/main.py` for all available endpoints.

## Running

```bash
# Install dependencies
pip install -r requirements.txt

# Run service
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Docker

The service is included in docker-compose.yml and runs automatically with the other services.

