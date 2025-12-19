# Used Car Market Insights Web Application

A Dockerized multi-page web application providing comprehensive sales insights, analytics, and market intelligence for the used car market. Built with React (with routing), Node.js, Express, and PostgreSQL.

## Features

### Core Features
- **Multi-Page Navigation**: Sticky navigation bar with dedicated pages for different functionalities
- **Price Delta Insights**: Compare current listing prices with original entry prices to identify best and worst deals
- **Vehicle Listings**: Browse and filter current car listings with autofill search and sortable columns
- **Vehicle Comparison**: Compare up to 5 vehicles side-by-side with search functionality
- **Sales Trends**: View historical sales data (2001-2020) to identify top-selling models
- **Market Insights**: Historical data analysis including depreciation, price trends, and sold car history
- **Comprehensive Analytics**: Price, mileage, location, sales, time series, and market intelligence analytics

### User Experience
- **Autofill Search**: Smart autofill with cascading logic (select brand → filter models)
- **Image Modal**: Click images to view in popup modal with gallery navigation
- **Sortable Tables**: Click column headers to sort listings by any field
- **Responsive Design**: Modern, user-friendly interface with consistent styling

## Architecture

- **Frontend**: React 18 with Vite, React Router DOM for multi-page navigation, Chart.js for visualizations
- **Backend**: Node.js with Express, RESTful API
- **Database**: PostgreSQL 16 with comprehensive schema for listings, sales, prices, and sold cars
- **ML Service**: Python FastAPI service for advanced analytics (optional)
- **Containerization**: Docker Compose for easy deployment

## Prerequisites

- Docker and Docker Compose installed
- The following CSV files in the correct locations:
  - `dataset_v2/Sales_table.csv` - Historical sales data (2001-2020)
  - `dataset_v2/Price_table_enriched.csv` - Original entry prices
  - `data/versicar_cars.csv` - Current used car listings (updated source)
  - `dataset_v2/Ad_table.csv` - Historical sold cars data (for market insights)

## Quick Start

1. **Clone or navigate to the project directory**

2. **Start all services with Docker Compose:**
   ```bash
   docker compose up
   ```

   This will:
   - Start PostgreSQL database
   - Build and start the backend API server
   - Build and start the frontend React app
   - Automatically seed the database with CSV data

3. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:4000
   - ML Service (optional): http://localhost:8000

4. **Navigate the application:**
   - **Home** (`/`) - Overview dashboard with key metrics and top/worst discounts
   - **Listings** (`/listings`) - Browse and filter vehicle listings with sortable columns
   - **Compare** (`/compare`) - Search and compare up to 5 vehicles side-by-side
   - **Analytics** (`/analytics`) - Comprehensive market analytics and insights
   - **Market Insights** (`/insights`) - Historical data, depreciation analysis, and sold car history

## API Endpoints

### Overview
- `GET /health` - Health check
- `GET /stats/overview` - Overall statistics

### Sales Data
- `GET /sales/trends?maker=&model=&fromYear=2001&toYear=2020` - Sales trends over time
- `GET /sales/top-models?year=&maker=&limit=10` - Top selling models

### Price Data
- `GET /prices/summary?maker=&model=&limit=20` - Price summary by model

### Insights
- `GET /api/insights/price-delta?maker=&model=&minPrice=&maxPrice=&minDiscount=&maxDiscount=&limit=50&offset=0&sortBy=price_delta_percent` - Price delta analysis with discount filtering and sorting
- `GET /api/insights/top-sellers?year=&limit=20` - Top selling models by year with trend data
- `GET /api/insights/listings-summary?maker=&model=&limit=20` - Summary of current listings

### Autofill
- `GET /api/autofill/makers?q=` - Get maker suggestions for autofill
- `GET /api/autofill/models?maker=&q=` - Get model suggestions filtered by maker

### Listings
- `GET /api/listings/:id` - Get detailed listing information
- `GET /api/listings/:id/sales` - Get sales data for listing's model
- `GET /api/listings/:id/prices` - Get price history for listing's model
- `GET /api/listings/search?maker=&model=&q=&limit=20` - Search listings for comparison

### Market Insights (Sold Cars)
- `GET /api/sold-cars/depreciation?maker=&model=&regYearFrom=&regYearTo=` - Depreciation analysis by registration year
- `GET /api/sold-cars/price-trends?maker=&model=&yearFrom=&yearTo=` - Price trends by advertisement year
- `GET /api/sold-cars/market-history?maker=&model=&limit=50&offset=0` - Browse sold cars with full history
- `GET /api/sold-cars/bodytype-analysis?bodytype=&year=` - Body type statistics
- `GET /api/sold-cars/color-trends?maker=&model=&yearFrom=&yearTo=` - Color popularity trends

## Data Sources

The application uses three main data sources:

1. **Sales_table.csv**: Contains yearly sales data (2001-2020) for different car models
   - Columns: Maker, Genmodel, Genmodel_ID, and year columns (2001-2020)

2. **Price_table_enriched.csv**: Contains original entry prices for car models by year
   - Columns: Maker, Genmodel, Genmodel_ID, Year, Entry_price, Entry_price_eur, etc.

3. **versicar_cars.csv**: Current used car listings from the market (located in `data/` directory)
   - Columns: url, title, price_eur, currency, mileage_km, year, location, description, images, specs

4. **Ad_table.csv**: Historical sold cars data (for market insights)
   - Columns: Maker, Genmodel, Genmodel_ID, Adv_ID, Adv_year, Adv_month, Color, Reg_year, Bodytype, Runned_Miles, Engin_size, Gearbox, Fuel_type, Price, Seat_num, Door_num

## Database Schema

- `makers` - Car manufacturers
- `models` - Car models (linked to makers)
- `sales` - Historical sales data (model_id, year, units)
- `prices` - Original entry prices (model_id, year, entry_price_eur)
- `listings` - Current used car listings with extracted make/model information
- `sold_cars` - Historical sold cars from Ad_table.csv (maker, genmodel, adv_year, reg_year, price, etc.)
- `price_predictions` - ML model predictions (optional)
- `market_insights` - Generated market insights (optional)

## Development

### Backend Development

```bash
cd backend
npm install
npm run dev  # Uses nodemon for auto-reload
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

### Database Seeding

The database is automatically seeded on backend startup. To manually seed:

```bash
cd backend
npm run seed
```

## Environment Variables

### Backend
- `POSTGRES_HOST` - Database host (default: `db`)
- `POSTGRES_PORT` - Database port (default: `5432`)
- `POSTGRES_DB` - Database name (default: `car_market`)
- `POSTGRES_USER` - Database user (default: `postgres`)
- `POSTGRES_PASSWORD` - Database password (default: `postgres`)
- `DATASET_PATH` - Path to dataset_v2 directory (default: `/app/dataset_v2`)
- `LISTINGS_FILE` - Path to versicar_cars.csv (auto-detected)
- `PORT` - Backend server port (default: `4000`)

### Frontend
- `VITE_API_BASE_URL` - Backend API URL (default: `http://localhost:4000`)

## Features in Detail

### Home Page
- **Overview Metrics**: Total listings, makers, sales units, and average price discount
- **Top Price Discounts**: Shows best deals (positive discounts only)
- **Worst Price Discounts**: Highlights overpriced cars to avoid
- **Top Models**: Most listed models with average prices
- **Sales Trends**: Visual charts of sales over time

### Vehicle Listings Page
- **Comprehensive Filtering**: Autofill search for make/model with cascading logic
- **Sortable Columns**: Click any column header to sort (ascending/descending)
- **Detailed Views**: Expand listings to see full specifications, images, sales history, and price trends
- **Image Gallery**: Click images to view in modal popup with navigation
- **Price Comparison**: Compare listing prices vs original entry prices

### Comparison Page
- **Search Functionality**: Autofill search to find vehicles
- **Side-by-Side Comparison**: Compare up to 5 vehicles simultaneously
- **Add to Compare**: Easy addition from listings page

### Analytics Page
- **Price Analytics**: FMV, anomalies, distribution with autofill filters
- **Mileage Analytics**: Distribution, depreciation curves, anomalies
- **Location Analytics**: Heatmaps and location-based price premiums
- **Sales Trends**: Forecasting and market share analysis
- **Time Series**: Price evolution and seasonal patterns
- **Market Intelligence**: Summary and automated insights

### Market Insights Page
- **Combined Price Trends & Depreciation**: Single chart showing both metrics
- **Market History**: Browse sold cars with full model history when filtered
- **Body Type Analysis**: Popularity and pricing by body type
- **Color Trends**: Most popular colors over time
- **Full Model History**: View complete historical records for specific models

## Troubleshooting

### "Failed to fetch" Error

If you see "Failed to fetch" in the frontend:

1. **Check if backend is running:**
   ```bash
   docker compose ps
   ```
   All services should show "Up" status.

2. **Check backend logs:**
   ```bash
   docker compose logs backend
   ```
   Look for errors or connection issues.

3. **Test backend health endpoint:**
   ```bash
   curl http://localhost:4000/health
   ```
   Should return `{"status":"ok"}`

4. **Check browser console:**
   - Open browser DevTools (F12)
   - Check Console tab for detailed error messages
   - Check Network tab to see which requests are failing

5. **Verify API URL:**
   - Frontend uses `VITE_API_BASE_URL` environment variable
   - Default is `http://localhost:4000`
   - In Docker, this should work since frontend runs in browser (not container)

6. **Restart services:**
   ```bash
   docker compose down
   docker compose up --build
   ```

### Database connection issues
- Ensure PostgreSQL container is running: `docker compose ps`
- Check database logs: `docker compose logs db`
- Backend now waits for database with retry logic (up to 30 attempts)

### CSV file not found
- Verify file paths in `docker-compose.yml` volumes
- Check that `versicar_cars.csv` exists in `data/` directory (updated location)
- Verify `dataset_v2` directory contains the required CSV files (Sales_table.csv, Price_table_enriched.csv, Ad_table.csv)

### Backend not starting
- Check backend logs: `docker compose logs backend`
- Verify CSV files are accessible
- Database healthcheck ensures backend waits for database to be ready
- Backend will retry database connection up to 30 times with 1 second delays

### CORS Issues
- CORS is configured to allow `localhost:5173` and `localhost:3000`
- If using a different port, update `backend/src/index.js` CORS configuration
- Vite proxy is configured for development to avoid CORS issues

## License

This project is provided as-is for educational and analytical purposes.

#
