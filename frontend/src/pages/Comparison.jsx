import React, { useState, useEffect } from 'react';
import AutofillInput from '../components/Search/AutofillInput';
import ComparisonList, { addToComparison } from '../components/ComparisonList';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export default function Comparison() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMaker, setSelectedMaker] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  const searchListings = async () => {
    if (!searchQuery.trim() && !selectedMaker && !selectedModel) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (selectedMaker) params.append('maker', selectedMaker);
      if (selectedModel) params.append('model', selectedModel);
      if (searchQuery.trim()) params.append('q', searchQuery.trim());

      const res = await fetch(`${API_BASE}/api/listings/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error('Error searching listings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchListings();
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, selectedMaker, selectedModel]);

  const formatCurrency = (n) =>
    n === null || n === undefined
      ? '—'
      : n.toLocaleString(undefined, {
          style: 'currency',
          currency: 'EUR',
          maximumFractionDigits: 0
        });

  return (
    <div className="app-shell">
      <h1>Compare Vehicles</h1>
      <p style={{ color: '#9cb0c9', marginBottom: '24px' }}>
        Search for vehicles and add them to your comparison list. You can compare up to 5 vehicles side-by-side.
      </p>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Search Vehicles</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
          <AutofillInput
            placeholder="Search by maker..."
            value={selectedMaker}
            onChange={(e) => {
              setSelectedMaker(e.target.value);
              setSelectedModel('');
            }}
            type="maker"
          />
          <AutofillInput
            placeholder="Search by model..."
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            type="model"
            maker={selectedMaker || null}
          />
          <input
            type="text"
            placeholder="Or search by keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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

      {loading && (
        <div className="loading" style={{ textAlign: 'center', padding: '20px' }}>
          Searching...
        </div>
      )}

      {searchResults.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>Search Results</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Price</th>
                  <th>Year</th>
                  <th>Mileage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((listing) => (
                  <tr key={listing.id}>
                    <td>
                      <div>
                        <strong>{listing.make} {listing.model}</strong>
                        <br />
                        <small style={{ color: '#9cb0c9', fontSize: '11px' }}>{listing.title}</small>
                      </div>
                    </td>
                    <td>{formatCurrency(listing.price_eur)}</td>
                    <td>{listing.year || '—'}</td>
                    <td>{listing.mileage_km ? listing.mileage_km.toLocaleString() + ' km' : '—'}</td>
                    <td>
                      <button
                        onClick={() => {
                          if (addToComparison(listing.id)) {
                            alert('Added to comparison list!');
                            window.location.reload();
                          } else {
                            alert('Comparison list is full (max 5) or already added.');
                          }
                        }}
                        style={{
                          padding: '4px 8px',
                          background: '#2a3441',
                          border: '1px solid #5ad8a6',
                          borderRadius: '4px',
                          color: '#5ad8a6',
                          cursor: 'pointer',
                          fontSize: '11px'
                        }}
                      >
                        Add to Compare
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ComparisonList />
    </div>
  );
}

