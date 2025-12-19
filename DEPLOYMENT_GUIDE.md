# Deployment Guide

## Quick Start

1. **Start all services:**
   ```bash
   docker compose up --build
   ```

2. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:4000
   - ML Service: http://localhost:8000
   - ML Service Docs: http://localhost:8000/docs

## Services

### Database (PostgreSQL)
- Port: 5432
- Database: car_market
- User: postgres
- Password: postgres

### Backend (Node.js/Express)
- Port: 4000
- Health: http://localhost:4000/health
- Analytics: http://localhost:4000/api/analytics/*

### ML Service (Python/FastAPI)
- Port: 8000
- Health: http://localhost:8000/health
- API Docs: http://localhost:8000/docs
- Endpoints: http://localhost:8000/ml/*

### Frontend (React/Vite)
- Port: 5173
- URL: http://localhost:5173

## Features Available

### Pages
1. **Home** (`/`) - Dashboard with overview metrics, top/worst discounts, and quick insights
2. **Listings** (`/listings`) - Browse vehicles with autofill filters and sortable columns
3. **Compare** (`/compare`) - Search and compare up to 5 vehicles side-by-side
4. **Analytics** (`/analytics`) - Comprehensive market analytics
5. **Market Insights** (`/insights`) - Historical data and depreciation analysis

### Analytics Features
1. **Price Analytics** - FMV, anomalies, distribution (with autofill)
2. **Mileage Analytics** - Distribution, depreciation curves (with autofill)
3. **Location Analytics** - Heatmaps, price premiums
4. **Sales Trends** - Forecasting, market share (with autofill)
5. **Time Series** - Price evolution, seasonal patterns (with autofill)
6. **Market Intelligence** - Summary, insights

### UX Features
1. **Sticky Navigation** - Always-visible navigation bar
2. **Autofill Search** - Smart autofill with cascading logic (maker → model)
3. **Image Modal** - Click images to view in popup with gallery navigation
4. **Sortable Tables** - Click column headers to sort listings
5. **Comparison Lists** - Compare up to 5 listings side-by-side
6. **Interactive Charts** - Chart.js visualizations
7. **Map Visualization** - Leaflet maps for location data

## Troubleshooting

### ML Service Not Starting
- Check Python dependencies: `pip install -r ml-service/requirements.txt`
- Verify database connection in ML service logs
- Check if port 8000 is available

### Models Not Training
- Ensure sufficient data in database (at least 50 listings)
- Check ML service logs for errors
- Models train on first use (may take time)

### Frontend Not Loading
- Verify backend is running on port 4000
- Check browser console for errors
- Ensure ML service is accessible from backend

## Development

### Backend Development
```bash
cd backend
npm install
npm run dev
```

### ML Service Development
```bash
cd ml-service
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

### Analytics Endpoints (via Backend)
- `GET /api/analytics/price/fmv` - Fair market value
- `GET /api/analytics/price/anomalies` - Price anomalies
- `GET /api/analytics/mileage/distribution` - Mileage stats
- `GET /api/analytics/mileage/depreciation` - Depreciation curves
- `GET /api/analytics/location/heatmap` - Location heatmap
- `GET /api/analytics/sales/forecast` - Sales forecast
- `GET /api/analytics/market/summary` - Market summary
- `GET /api/analytics/market/insights` - Market insights

### Autofill
- `GET /api/autofill/makers?q=` - Get maker suggestions
- `GET /api/autofill/models?maker=&q=` - Get model suggestions (filtered by maker)

### Market Insights (Sold Cars)
- `GET /api/sold-cars/depreciation?maker=&model=&regYearFrom=&regYearTo=` - Depreciation analysis
- `GET /api/sold-cars/price-trends?maker=&model=&yearFrom=&yearTo=` - Price trends
- `GET /api/sold-cars/market-history?maker=&model=&limit=&offset=` - Browse sold cars
- `GET /api/sold-cars/bodytype-analysis?bodytype=&year=` - Body type stats
- `GET /api/sold-cars/color-trends?maker=&model=&yearFrom=&yearTo=` - Color trends

## Notes

- ML models are trained on first use (optional service)
- Models are cached after training
- Some features require minimum data thresholds
- Frontend uses React Router for multi-page navigation
- Autofill search works with cascading logic (select maker → filter models)
- Image modals support keyboard navigation (arrow keys, ESC)
- Sortable columns work across all listing tables
- Market Insights page combines depreciation and price trends in single chart
- Full model history available when filtering by specific model in Market Insights

