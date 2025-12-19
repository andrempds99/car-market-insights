import React, { useState, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import AutofillInput from '../Search/AutofillInput';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const formatCurrency = (n) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString(undefined, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0
      });

export default function PriceAnalytics() {
  const [fmvData, setFmvData] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [distribution, setDistribution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ make: '', model: '', year: '', mileage: '' });

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.make) params.append('make', filters.make);
      if (filters.model) params.append('model', filters.model);
      if (filters.year) params.append('year', filters.year);
      if (filters.mileage) params.append('mileage_km', filters.mileage);

      const [fmvRes, anomaliesRes, distRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/price/fmv?${params}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/api/analytics/price/anomalies?limit=20`).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/api/analytics/price/distribution?${params}`).catch(() => ({ ok: false }))
      ]);

      if (fmvRes.ok) {
        const data = await fmvRes.json();
        setFmvData(data);
      }
      if (anomaliesRes.ok) {
        const data = await anomaliesRes.json();
        setAnomalies(data.anomalies || []);
      }
      if (distRes.ok) {
        const data = await distRes.json();
        setDistribution(data);
      }
    } catch (err) {
      console.error('Error loading price analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const distributionChart = distribution ? {
    labels: ['Min', 'Q1', 'Median', 'Q3', 'Max'],
    datasets: [{
      label: 'Price Distribution',
      data: [
        distribution.min,
        distribution.q1,
        distribution.median,
        distribution.q3,
        distribution.max
      ],
      backgroundColor: '#6ea8fe'
    }]
  } : null;

  return (
    <div>
      <h2>Price Analytics & Predictions</h2>
      
      <div className="card" style={{ marginBottom: '16px' }}>
        <h3>Filters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <AutofillInput
            placeholder="Make..."
            value={filters.make}
            onChange={(e) => setFilters({ ...filters, make: e.target.value, model: '' })}
            type="maker"
          />
          <AutofillInput
            placeholder="Model..."
            value={filters.model}
            onChange={(e) => setFilters({ ...filters, model: e.target.value })}
            type="model"
            maker={filters.make || null}
          />
          <input
            type="number"
            placeholder="Year..."
            value={filters.year}
            onChange={(e) => setFilters({ ...filters, year: e.target.value })}
            style={{ padding: '8px', background: '#1f2a3b', border: '1px solid #2a3441', borderRadius: '6px', color: '#f6f7fb' }}
          />
          <input
            type="number"
            placeholder="Mileage (km)..."
            value={filters.mileage}
            onChange={(e) => setFilters({ ...filters, mileage: e.target.value })}
            style={{ padding: '8px', background: '#1f2a3b', border: '1px solid #2a3441', borderRadius: '6px', color: '#f6f7fb' }}
          />
        </div>
      </div>

      {loading && <div className="loading">Loading analytics...</div>}

      {fmvData && !fmvData.error && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <h3>Fair Market Value</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>FMV</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#5ad8a6' }}>
                {formatCurrency(fmvData.fair_market_value)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Average</div>
              <div>{formatCurrency(fmvData.average_price)}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Median</div>
              <div>{formatCurrency(fmvData.median_price)}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Range</div>
              <div>{formatCurrency(fmvData.min_price)} - {formatCurrency(fmvData.max_price)}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Sample Size</div>
              <div>{fmvData.sample_size} listings</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Confidence</div>
              <div style={{ color: fmvData.confidence === 'high' ? '#5ad8a6' : fmvData.confidence === 'medium' ? '#f0ad4e' : '#f06272' }}>
                {fmvData.confidence}
              </div>
            </div>
          </div>
        </div>
      )}

      {distribution && distributionChart && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <h3>Price Distribution</h3>
          <Bar
            data={distributionChart}
            options={{
              plugins: { legend: { display: false } },
              scales: {
                y: { ticks: { color: '#9cb0c9', callback: (value) => formatCurrency(value) } },
                x: { ticks: { color: '#9cb0c9' } }
              }
            }}
          />
        </div>
      )}

      {anomalies.length > 0 && (
        <div className="card">
          <h3>Price Anomalies</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Car</th>
                <th>Price</th>
                <th>Year</th>
                <th>Mileage</th>
                <th>Z-Score</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((item) => (
                <tr key={item.id}>
                  <td>{item.make} {item.model}</td>
                  <td>{formatCurrency(item.price_eur)}</td>
                  <td>{item.year || '—'}</td>
                  <td>{item.mileage_km ? item.mileage_km.toLocaleString() + ' km' : '—'}</td>
                  <td>{item.z_score}</td>
                  <td style={{ color: item.anomaly_type === 'overpriced' ? '#f06272' : '#5ad8a6' }}>
                    {item.anomaly_type}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

