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

export default function ComparisonList() {
  const [comparisonList, setComparisonList] = useState([]);
  const [listingIds, setListingIds] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load comparison list from localStorage
    const saved = localStorage.getItem('comparisonList');
    if (saved) {
      try {
        const ids = JSON.parse(saved);
        setListingIds(ids);
        if (ids.length > 0) {
          loadListings(ids);
        }
      } catch (e) {
        console.error('Error loading comparison list:', e);
      }
    }
  }, []);

  const loadListings = async (ids) => {
    setLoading(true);
    try {
      const promises = ids.map(id =>
        fetch(`${API_BASE}/api/listings/${id}`).then(r => r.ok ? r.json() : null)
      );
      const results = await Promise.all(promises);
      setComparisonList(results.filter(r => r !== null));
    } catch (err) {
      console.error('Error loading listings:', err);
    } finally {
      setLoading(false);
    }
  };

  const addToList = (listingId) => {
    if (!listingIds.includes(listingId) && listingIds.length < 5) {
      const newIds = [...listingIds, listingId];
      setListingIds(newIds);
      localStorage.setItem('comparisonList', JSON.stringify(newIds));
      loadListings(newIds);
    }
  };

  const removeFromList = (listingId) => {
    const newIds = listingIds.filter(id => id !== listingId);
    setListingIds(newIds);
    localStorage.setItem('comparisonList', JSON.stringify(newIds));
    setComparisonList(comparisonList.filter(l => l.id !== listingId));
  };

  const clearList = () => {
    setListingIds([]);
    setComparisonList([]);
    localStorage.removeItem('comparisonList');
  };

  if (comparisonList.length === 0) {
    return (
      <div className="card">
        <h3>Comparison List</h3>
        <div style={{ padding: '20px', textAlign: 'center', color: '#9cb0c9' }}>
          No listings in comparison. Click "Add to Comparison" on any listing to compare them side-by-side.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Comparison List ({comparisonList.length}/5)</h3>
        <button
          onClick={clearList}
          style={{
            padding: '6px 12px',
            background: '#1f2a3b',
            border: '1px solid #f06272',
            borderRadius: '6px',
            color: '#f06272',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Clear All
        </button>
      </div>

      {loading && <div className="loading">Loading listings...</div>}

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: '800px' }}>
          <thead>
            <tr>
              <th>Car</th>
              <th>Price</th>
              <th>Year</th>
              <th>Mileage</th>
              <th>Location</th>
              <th>Fuel</th>
              <th>Transmission</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {comparisonList.map((listing) => (
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
                <td>{listing.mileage_km ? formatNumber(listing.mileage_km) + ' km' : '—'}</td>
                <td>{listing.location || '—'}</td>
                <td>
                  {listing.specs?.fuel === 1 ? 'Petrol' :
                   listing.specs?.fuel === 2 ? 'Diesel' :
                   listing.specs?.fuel === 3 ? 'Electric' :
                   listing.specs?.fuel === 5 ? 'Hybrid' : '—'}
                </td>
                <td>
                  {listing.specs?.transmission === 1 ? 'Manual' :
                   listing.specs?.transmission === 2 ? 'Automatic' : '—'}
                </td>
                <td>
                  <button
                    onClick={() => removeFromList(listing.id)}
                    style={{
                      padding: '4px 8px',
                      background: '#1f2a3b',
                      border: '1px solid #f06272',
                      borderRadius: '4px',
                      color: '#f06272',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Export function to add listings to comparison from other components
export const addToComparison = (listingId) => {
  const saved = localStorage.getItem('comparisonList');
  let ids = saved ? JSON.parse(saved) : [];
  if (!ids.includes(listingId) && ids.length < 5) {
    ids.push(listingId);
    localStorage.setItem('comparisonList', JSON.stringify(ids));
    return true;
  }
  return false;
};

