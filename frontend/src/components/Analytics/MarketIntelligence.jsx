import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const formatCurrency = (n) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString(undefined, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0
      });

const formatNumber = (n) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function MarketIntelligence() {
  const [summary, setSummary] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, insightsRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/market/summary`).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/api/analytics/market/insights`).catch(() => ({ ok: false }))
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }
      if (insightsRes.ok) {
        const data = await insightsRes.json();
        setInsights(data);
      }
    } catch (err) {
      console.error('Error loading market intelligence:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Market Intelligence & Insights</h2>

      {loading && <div className="loading">Loading market intelligence...</div>}

      {summary && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <h3>Market Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div style={{ padding: '12px', background: '#121a26', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Total Listings</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {formatNumber(summary.overview?.total_listings)}
              </div>
            </div>
            <div style={{ padding: '12px', background: '#121a26', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Average Price</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {formatCurrency(summary.overview?.avg_price)}
              </div>
            </div>
            <div style={{ padding: '12px', background: '#121a26', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Price Range</div>
              <div style={{ fontSize: '16px' }}>
                {formatCurrency(summary.overview?.min_price)} - {formatCurrency(summary.overview?.max_price)}
              </div>
            </div>
            <div style={{ padding: '12px', background: '#121a26', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Unique Locations</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {formatNumber(summary.location_stats?.unique_locations)}
              </div>
            </div>
          </div>

          {summary.price_stats && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#121a26', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Price Statistics</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#9cb0c9' }}>Q1 (25th percentile)</div>
                  <div>{formatCurrency(summary.price_stats.q1)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#9cb0c9' }}>Median (50th percentile)</div>
                  <div>{formatCurrency(summary.price_stats.median)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#9cb0c9' }}>Q3 (75th percentile)</div>
                  <div>{formatCurrency(summary.price_stats.q3)}</div>
                </div>
              </div>
            </div>
          )}

          {summary.top_makers && summary.top_makers.length > 0 && (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Top Makers by Listings</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                {summary.top_makers.map((maker, idx) => (
                  <div key={idx} style={{ padding: '8px', background: '#0f1724', borderRadius: '6px' }}>
                    <div style={{ fontSize: '12px', color: '#9cb0c9' }}>{maker.maker}</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatNumber(maker.listing_count)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {insights && insights.insights && insights.insights.length > 0 && (
        <div className="card">
          <h3>Key Insights</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {insights.insights.map((insight, idx) => (
              <div key={idx} style={{ padding: '16px', background: '#121a26', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>{insight.title}</div>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>{insight.message}</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#5ad8a6' }}>{insight.value}</div>
              </div>
            ))}
          </div>
          {insights.generated_at && (
            <div style={{ marginTop: '16px', fontSize: '11px', color: '#9cb0c9', fontStyle: 'italic' }}>
              Generated: {new Date(insights.generated_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

