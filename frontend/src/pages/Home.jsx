import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js';
import PriceAnalytics from '../components/Analytics/PriceAnalytics';
import MarketIntelligence from '../components/Analytics/MarketIntelligence';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const formatNumber = (n) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString(undefined, {
        maximumFractionDigits: 0
      });

const formatCurrency = (n) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString(undefined, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0
      });

const formatPercent = (n) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString(undefined, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      });

export default function Home() {
  const [overview, setOverview] = useState(null);
  const [trend, setTrend] = useState([]);
  const [topModels, setTopModels] = useState([]);
  const [topSellers, setTopSellers] = useState({ top_by_year: [], trends: [] });
  const [listingsSummary, setListingsSummary] = useState([]);
  const [bestPriceDeltas, setBestPriceDeltas] = useState({ data: [], total: 0 });
  const [worstPriceDeltas, setWorstPriceDeltas] = useState({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        
        const healthRes = await fetch(`${API_BASE}/health`);
        if (!healthRes.ok) {
          throw new Error(`Backend not responding. Status: ${healthRes.status}`);
        }

        const [overviewRes, trendRes, topRes, sellersRes, listingsRes, bestDeltaRes, worstDeltaRes] = await Promise.all([
          fetch(`${API_BASE}/stats/overview`).catch(err => ({ ok: false, error: err })),
          fetch(`${API_BASE}/sales/trends`).catch(err => ({ ok: false, error: err })),
          fetch(`${API_BASE}/sales/top-models?limit=8`).catch(err => ({ ok: false, error: err })),
          fetch(`${API_BASE}/api/insights/top-sellers?limit=100`).catch(err => ({ ok: false, error: err })),
          fetch(`${API_BASE}/api/insights/listings-summary?limit=20`).catch(err => ({ ok: false, error: err })),
          fetch(`${API_BASE}/api/insights/price-delta?limit=5&sortBy=-price_delta_percent&minDiscount=0`).catch(err => ({ ok: false, error: err })),
          fetch(`${API_BASE}/api/insights/price-delta?limit=5&sortBy=price_delta_percent&maxDiscount=0`).catch(err => ({ ok: false, error: err }))
        ]);

        const [overviewData, trendData, topData, sellersData, listingsData, bestDeltaData, worstDeltaData] = await Promise.all([
          overviewRes.ok ? overviewRes.json() : Promise.resolve(null),
          trendRes.ok ? trendRes.json() : Promise.resolve([]),
          topRes.ok ? topRes.json() : Promise.resolve([]),
          sellersRes.ok ? sellersRes.json() : Promise.resolve({ top_by_year: [], trends: [] }),
          listingsRes.ok ? listingsRes.json() : Promise.resolve([]),
          bestDeltaRes.ok ? bestDeltaRes.json() : Promise.resolve({ data: [], total: 0 }),
          worstDeltaRes.ok ? worstDeltaRes.json() : Promise.resolve({ data: [], total: 0 })
        ]);

        setOverview(overviewData);
        setTrend(trendData);
        setTopModels(topData);
        setTopSellers(sellersData);
        setListingsSummary(listingsData);
        setBestPriceDeltas(bestDeltaData);
        setWorstPriceDeltas(worstDeltaData);
        setError(null);
      } catch (err) {
        console.error('Error loading data:', err);
        setError(`Failed to connect to API at ${API_BASE}. Make sure the backend is running. Error: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const trendChart = {
    labels: trend.map((t) => t.year),
    datasets: [
      {
        label: 'Units sold',
        data: trend.map((t) => t.units),
        borderColor: '#5ad8a6',
        backgroundColor: 'rgba(90, 216, 166, 0.1)',
        tension: 0.2,
        fill: true
      }
    ]
  };

  const topModelsChart = {
    labels: topModels.map((t) => `${t.maker} ${t.model}`),
    datasets: [
      {
        label: 'Units sold',
        data: topModels.map((t) => t.total_units),
        backgroundColor: '#6ea8fe'
      }
    ]
  };

  const avgPriceDelta = bestPriceDeltas.data.length > 0
    ? bestPriceDeltas.data
        .map((d) => d.price_delta_percent)
        .filter((p) => p !== null && p !== undefined && p > 0)
        .reduce((a, b) => a + b, 0) / bestPriceDeltas.data.filter((p) => p.price_delta_percent !== null && p.price_delta_percent !== undefined && p.price_delta_percent > 0).length
    : null;

  const top5Listings = listingsSummary.slice(0, 5);

  return (
    <div className="app-shell">
      <h1>Used Car Market Insights</h1>
      <p>Sales, price, and listing insights from the used car market dataset.</p>

      {error && (
        <div className="error" style={{ 
          padding: '16px', 
          background: '#1a2332', 
          border: '1px solid #f06272', 
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {loading && <div className="loading">Loading data...</div>}

      {overview && (
        <div className="grid cards">
          <div className="card">
            <h3>Total Listings</h3>
            <div className="metric">{formatNumber(overview.ads)}</div>
          </div>
          <div className="card">
            <h3>Makers</h3>
            <div className="metric">{formatNumber(overview.makers)}</div>
          </div>
          <div className="card">
            <h3>Total Sales Units</h3>
            <div className="metric">{formatNumber(overview.sales_units)}</div>
          </div>
          {avgPriceDelta !== null && (
            <div className="card">
              <h3>Avg. Price Discount</h3>
              <div className="metric">{formatPercent(avgPriceDelta / 100)}</div>
            </div>
          )}
        </div>
      )}

      {bestPriceDeltas.data.length > 0 && (
        <>
          <h2 className="section-title">Top Price Discounts</h2>
          <p style={{ color: '#9cb0c9', marginBottom: '16px', fontSize: '14px' }}>
            Best deals: Cars with the highest discounts compared to their original price.
          </p>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Listing Price</th>
                  <th>Original Price</th>
                  <th>Discount %</th>
                </tr>
              </thead>
              <tbody>
                {bestPriceDeltas.data.filter(item => item.price_delta_percent > 0).slice(0, 5).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.make} {item.model}</strong>
                      <br />
                      <small style={{ color: '#9cb0c9', fontSize: '11px' }}>{item.title}</small>
                    </td>
                    <td>{formatCurrency(item.listing_price)}</td>
                    <td>{formatCurrency(item.original_price)}</td>
                    <td style={{ color: '#5ad8a6' }}>
                      {item.price_delta_percent !== null ? `${item.price_delta_percent.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <Link to="/listings" style={{ color: '#6ea8fe', textDecoration: 'none', fontSize: '14px' }}>
                View All Listings →
              </Link>
            </div>
          </div>
        </>
      )}

      {worstPriceDeltas.data.length > 0 && (
        <>
          <h2 className="section-title">Worst Price Discounts</h2>
          <p style={{ color: '#9cb0c9', marginBottom: '16px', fontSize: '14px' }}>
            Overpriced cars: These vehicles are more expensive than their original price - avoid these deals.
          </p>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Listing Price</th>
                  <th>Original Price</th>
                  <th>Price Difference %</th>
                </tr>
              </thead>
              <tbody>
                {worstPriceDeltas.data.filter(item => item.price_delta_percent < 0).slice(0, 5).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.make} {item.model}</strong>
                      <br />
                      <small style={{ color: '#9cb0c9', fontSize: '11px' }}>{item.title}</small>
                    </td>
                    <td>{formatCurrency(item.listing_price)}</td>
                    <td>{formatCurrency(item.original_price)}</td>
                    <td style={{ color: '#f06272' }}>
                      {item.price_delta_percent !== null ? `${item.price_delta_percent.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <Link to="/listings" style={{ color: '#6ea8fe', textDecoration: 'none', fontSize: '14px' }}>
                View All Listings →
              </Link>
            </div>
          </div>
        </>
      )}

      {top5Listings.length > 0 && (
        <>
          <h2 className="section-title">Top 5 Models by Listings Count</h2>
          <div className="grid cards">
            {top5Listings.map((item, idx) => (
              <div key={idx} className="card">
                <h3>{item.maker} {item.model}</h3>
                <div className="metric">{formatNumber(item.total_listings)}</div>
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#9cb0c9' }}>
                  Avg: {formatCurrency(item.avg_price)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {trend.length > 0 && (
        <>
          <h2 className="section-title">Sales Trends</h2>
          <div className="charts">
            <div className="card">
              <h3 style={{ marginBottom: '16px' }}>Sales Trends Over Time</h3>
              <Line
                data={trendChart}
                options={{
                  plugins: { legend: { display: false } },
                  scales: { y: { ticks: { color: '#9cb0c9' } }, x: { ticks: { color: '#9cb0c9' } } }
                }}
              />
            </div>

            {topModels.length > 0 && (
              <div className="card">
                <h3 style={{ marginBottom: '16px' }}>Top Models by Total Sales</h3>
                <Bar
                  data={topModelsChart}
                  options={{
                    indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: { x: { ticks: { color: '#9cb0c9' } }, y: { ticks: { color: '#9cb0c9' } } }
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: '48px', borderTop: '2px solid #2a3441', paddingTop: '32px' }}>
        <PriceAnalytics />
      </div>

      <div style={{ marginTop: '48px', borderTop: '2px solid #2a3441', paddingTop: '32px' }}>
        <MarketIntelligence />
      </div>
    </div>
  );
}

