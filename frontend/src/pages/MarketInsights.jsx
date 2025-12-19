import React, { useState, useEffect } from 'react';
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
import AutofillInput from '../components/Search/AutofillInput';

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

export default function MarketInsights() {
  const [depreciationData, setDepreciationData] = useState(null);
  const [priceTrends, setPriceTrends] = useState(null);
  const [marketHistory, setMarketHistory] = useState({ data: [], total: 0 });
  const [fullModelHistory, setFullModelHistory] = useState({ data: [], total: 0, model: null });
  const [bodyTypeAnalysis, setBodyTypeAnalysis] = useState(null);
  const [colorTrends, setColorTrends] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    maker: '',
    model: '',
    yearFrom: '',
    yearTo: ''
  });

  useEffect(() => {
    loadDepreciation();
    loadPriceTrends();
    loadMarketHistory();
    loadBodyTypeAnalysis();
    loadColorTrends();
    if (filters.model) {
      loadFullModelHistory();
    } else {
      setFullModelHistory({ data: [], total: 0, model: null });
    }
  }, [filters]);

  const loadFullModelHistory = async () => {
    if (!filters.model) return;
    try {
      const params = new URLSearchParams({ limit: '1000', offset: '0' });
      if (filters.maker) params.append('maker', filters.maker);
      if (filters.model) params.append('model', filters.model);

      const res = await fetch(`${API_BASE}/api/sold-cars/market-history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFullModelHistory({ ...data, model: filters.model });
      }
    } catch (err) {
      console.error('Error loading full model history:', err);
    }
  };

  const loadDepreciation = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.maker) params.append('maker', filters.maker);
      if (filters.model) params.append('model', filters.model);
      if (filters.yearFrom) params.append('regYearFrom', filters.yearFrom);
      if (filters.yearTo) params.append('regYearTo', filters.yearTo);

      const res = await fetch(`${API_BASE}/api/sold-cars/depreciation?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDepreciationData(data);
      }
    } catch (err) {
      console.error('Error loading depreciation:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPriceTrends = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.maker) params.append('maker', filters.maker);
      if (filters.model) params.append('model', filters.model);
      if (filters.yearFrom) params.append('yearFrom', filters.yearFrom);
      if (filters.yearTo) params.append('yearTo', filters.yearTo);

      const res = await fetch(`${API_BASE}/api/sold-cars/price-trends?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPriceTrends(data);
      }
    } catch (err) {
      console.error('Error loading price trends:', err);
    }
  };

  const loadMarketHistory = async () => {
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (filters.maker) params.append('maker', filters.maker);
      if (filters.model) params.append('model', filters.model);

      const res = await fetch(`${API_BASE}/api/sold-cars/market-history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMarketHistory(data);
      }
    } catch (err) {
      console.error('Error loading market history:', err);
    }
  };

  const loadBodyTypeAnalysis = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.yearFrom) params.append('year', filters.yearFrom);

      const res = await fetch(`${API_BASE}/api/sold-cars/bodytype-analysis?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBodyTypeAnalysis(data);
      }
    } catch (err) {
      console.error('Error loading body type analysis:', err);
    }
  };

  const loadColorTrends = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.maker) params.append('maker', filters.maker);
      if (filters.model) params.append('model', filters.model);
      if (filters.yearFrom) params.append('yearFrom', filters.yearFrom);
      if (filters.yearTo) params.append('yearTo', filters.yearTo);

      const res = await fetch(`${API_BASE}/api/sold-cars/color-trends?${params}`);
      if (res.ok) {
        const data = await res.json();
        setColorTrends(data);
      }
    } catch (err) {
      console.error('Error loading color trends:', err);
    }
  };

  return (
    <div className="app-shell">
      <h1>Market Insights</h1>
      <p style={{ color: '#9cb0c9', marginBottom: '24px' }}>
        Historical data and insights from sold cars including depreciation analysis, price trends, and market history.
      </p>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Filters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <AutofillInput
            placeholder="Filter by maker..."
            value={filters.maker}
            onChange={(e) => {
              setFilters({ ...filters, maker: e.target.value, model: '' });
            }}
            type="maker"
          />
          <AutofillInput
            placeholder="Filter by model..."
            value={filters.model}
            onChange={(e) => setFilters({ ...filters, model: e.target.value })}
            type="model"
            maker={filters.maker || null}
          />
          <input
            type="number"
            placeholder="Year from..."
            value={filters.yearFrom}
            onChange={(e) => setFilters({ ...filters, yearFrom: e.target.value })}
            style={{
              padding: '8px',
              background: '#1f2a3b',
              border: '1px solid #2a3441',
              borderRadius: '6px',
              color: '#f6f7fb',
              fontSize: '14px'
            }}
          />
          <input
            type="number"
            placeholder="Year to..."
            value={filters.yearTo}
            onChange={(e) => setFilters({ ...filters, yearTo: e.target.value })}
            style={{
              padding: '8px',
              background: '#1f2a3b',
              border: '1px solid #2a3441',
              borderRadius: '6px',
              color: '#f6f7fb',
              fontSize: '14px'
            }}
          />
        </div>
      </div>

      {((depreciationData && depreciationData.trends && depreciationData.trends.length > 0) || 
        (priceTrends && priceTrends.trends && priceTrends.trends.length > 0)) && (
        <div className="card" style={{ marginBottom: '32px' }}>
          <h2 className="section-title">Price Trends & Depreciation Analysis</h2>
          <p style={{ color: '#9cb0c9', marginBottom: '16px' }}>
            Combined view showing price trends by advertisement year and depreciation by registration year.
          </p>
          <Line
            data={{
              labels: priceTrends && priceTrends.trends && priceTrends.trends.length > 0
                ? priceTrends.trends.map(t => t.year)
                : depreciationData.trends.map(t => t.reg_year),
              datasets: [
                ...(priceTrends && priceTrends.trends && priceTrends.trends.length > 0 ? [{
                  label: 'Price by Ad Year (€)',
                  data: priceTrends.trends.map(t => t.avg_price),
                  borderColor: '#6ea8fe',
                  backgroundColor: 'rgba(110, 168, 254, 0.1)',
                  tension: 0.2,
                  fill: false,
                  yAxisID: 'y'
                }] : []),
                ...(depreciationData && depreciationData.trends && depreciationData.trends.length > 0 ? [{
                  label: 'Depreciation by Reg Year (€)',
                  data: depreciationData.trends.map(t => t.avg_price),
                  borderColor: '#5ad8a6',
                  backgroundColor: 'rgba(90, 216, 166, 0.1)',
                  tension: 0.2,
                  fill: false,
                  yAxisID: 'y'
                }] : [])
              ]
            }}
            options={{
              plugins: { legend: { display: true, labels: { color: '#9cb0c9' } } },
              scales: {
                y: { 
                  ticks: { color: '#9cb0c9' }, 
                  beginAtZero: false,
                  title: {
                    display: true,
                    text: 'Price (€)',
                    color: '#9cb0c9'
                  }
                },
                x: { 
                  ticks: { color: '#9cb0c9' },
                  title: {
                    display: true,
                    text: 'Year',
                    color: '#9cb0c9'
                  }
                }
              }
            }}
          />
        </div>
      )}

      {bodyTypeAnalysis && bodyTypeAnalysis.length > 0 && (
        <div className="card" style={{ marginBottom: '32px' }}>
          <h2 className="section-title">Body Type Analysis</h2>
          <p style={{ color: '#9cb0c9', marginBottom: '16px' }}>
            Popularity and pricing by body type.
          </p>
          <Bar
            data={{
              labels: bodyTypeAnalysis.map(b => b.bodytype),
              datasets: [{
                label: 'Average Price (€)',
                data: bodyTypeAnalysis.map(b => b.avg_price),
                backgroundColor: '#5ad8a6'
              }, {
                label: 'Count',
                data: bodyTypeAnalysis.map(b => b.count),
                backgroundColor: '#6ea8fe'
              }]
            }}
            options={{
              plugins: { legend: { display: true, labels: { color: '#9cb0c9' } } },
              scales: {
                y: { ticks: { color: '#9cb0c9' }, beginAtZero: true },
                x: { ticks: { color: '#9cb0c9' } }
              }
            }}
          />
        </div>
      )}

      {colorTrends && colorTrends.trends && colorTrends.trends.length > 0 && (
        <div className="card" style={{ marginBottom: '32px' }}>
          <h2 className="section-title">Color Trends</h2>
          <p style={{ color: '#9cb0c9', marginBottom: '16px' }}>
            Most popular colors over time.
          </p>
          <Bar
            data={{
              labels: colorTrends.trends.map(c => c.color),
              datasets: [{
                label: 'Count',
                data: colorTrends.trends.map(c => c.count),
                backgroundColor: '#5ad8a6'
              }]
            }}
            options={{
              indexAxis: 'y',
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: '#9cb0c9' }, beginAtZero: true },
                y: { ticks: { color: '#9cb0c9' } }
              }
            }}
          />
        </div>
      )}

      {marketHistory.data.length > 0 && (
        <div className="card" style={{ marginBottom: '32px' }}>
          <h2 className="section-title">Market History</h2>
          <p style={{ color: '#9cb0c9', marginBottom: '16px' }}>
            Browse sold cars from historical data.
            {filters.model && (
              <span style={{ marginLeft: '8px', color: '#5ad8a6' }}>
                Showing full history for {filters.maker} {filters.model} ({fullModelHistory.total} records)
              </span>
            )}
          </p>
          <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
            <table className="table">
              <thead style={{ position: 'sticky', top: 0, background: '#121a26', zIndex: 10 }}>
                <tr>
                  <th>Maker</th>
                  <th>Model</th>
                  <th>Reg Year</th>
                  <th>Ad Year</th>
                  <th>Price</th>
                  <th>Mileage</th>
                  <th>Body Type</th>
                  <th>Color</th>
                  <th>Fuel Type</th>
                  <th>Gearbox</th>
                </tr>
              </thead>
              <tbody>
                {(filters.model && fullModelHistory.data.length > 0 ? fullModelHistory.data : marketHistory.data).map((car, idx) => (
                  <tr key={idx}>
                    <td>{car.maker}</td>
                    <td>{car.genmodel}</td>
                    <td>{car.reg_year || '—'}</td>
                    <td>{car.adv_year || '—'}</td>
                    <td>{formatCurrency(car.price)}</td>
                    <td>{car.runned_miles ? formatNumber(car.runned_miles) + ' miles' : '—'}</td>
                    <td>{car.bodytype || '—'}</td>
                    <td>{car.color || '—'}</td>
                    <td>{car.fuel_type || '—'}</td>
                    <td>{car.gearbox || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filters.model && fullModelHistory.total > fullModelHistory.data.length && (
            <div style={{ marginTop: '16px', textAlign: 'center', color: '#9cb0c9' }}>
              Showing {fullModelHistory.data.length} of {formatNumber(fullModelHistory.total)} records. 
              Filter by specific model to see complete history.
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="loading" style={{ textAlign: 'center', padding: '20px' }}>
          Loading insights...
        </div>
      )}
    </div>
  );
}

