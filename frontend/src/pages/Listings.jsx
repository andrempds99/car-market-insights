import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from 'chart.js';
import AutofillInput from '../components/Search/AutofillInput';
import ImageModal from '../components/Layout/ImageModal';
import { addToComparison } from '../components/ComparisonList';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

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

export default function Listings() {
  const navigate = useNavigate();
  const [priceDeltas, setPriceDeltas] = useState({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [expandedListingId, setExpandedListingId] = useState(null);
  const [listingDetails, setListingDetails] = useState({});
  const [salesData, setSalesData] = useState({});
  const [priceData, setPriceData] = useState({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  const [priceDeltaFilters, setPriceDeltaFilters] = useState({
    maker: '',
    model: '',
    minPrice: '',
    maxPrice: '',
    limit: 50
  });
  const [priceDeltaPage, setPriceDeltaPage] = useState(0);
  const [sortConfig, setSortConfig] = useState({ column: 'price_delta_percent', direction: 'desc' });

  const [imageModal, setImageModal] = useState({ open: false, images: [], currentIndex: 0 });

  const loadPriceDeltas = async () => {
    try {
      setError(null);
      const params = new URLSearchParams({
        limit: priceDeltaFilters.limit.toString(),
        offset: (priceDeltaPage * priceDeltaFilters.limit).toString()
      });
      if (priceDeltaFilters.maker) params.append('maker', priceDeltaFilters.maker);
      if (priceDeltaFilters.model) params.append('model', priceDeltaFilters.model);
      if (priceDeltaFilters.minPrice) params.append('minPrice', priceDeltaFilters.minPrice);
      if (priceDeltaFilters.maxPrice) params.append('maxPrice', priceDeltaFilters.maxPrice);
      const sortPrefix = sortConfig.direction === 'desc' ? '-' : '';
      params.append('sortBy', `${sortPrefix}${sortConfig.column}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const res = await fetch(`${API_BASE}/api/insights/price-delta?${params}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          let errorText = 'Unknown error';
          try {
            const errorData = await res.json();
            errorText = errorData.message || errorData.error || `HTTP ${res.status}`;
          } catch (e) {
            errorText = await res.text() || `HTTP ${res.status}`;
          }
          throw new Error(`Failed to load price deltas: ${errorText}`);
        }
        const data = await res.json();
        setPriceDeltas(data);
        setError(null);
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          throw new Error('Request timed out. The query may be taking too long.');
        }
        throw fetchErr;
      }
    } catch (err) {
      console.error('Error loading price deltas:', err);
      const errorMsg = err.message || 'Unknown error occurred';
      setError(`Failed to load price deltas: ${errorMsg}`);
    }
  };

  useEffect(() => {
    loadPriceDeltas();
  }, [priceDeltaFilters, priceDeltaPage, sortConfig]);

  const handleSort = (column) => {
    setSortConfig(prev => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: 'asc' };
    });
    setPriceDeltaPage(0);
  };

  const getSortIndicator = (column) => {
    if (sortConfig.column !== column) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const fetchListingDetails = async (listingId) => {
    setLoadingDetails(true);
    try {
      const [detailsRes, salesRes, pricesRes] = await Promise.all([
        fetch(`${API_BASE}/api/listings/${listingId}`),
        fetch(`${API_BASE}/api/listings/${listingId}/sales`),
        fetch(`${API_BASE}/api/listings/${listingId}/prices`)
      ]);

      const details = detailsRes.ok ? await detailsRes.json() : null;
      const sales = salesRes.ok ? await salesRes.json() : [];
      const prices = pricesRes.ok ? await pricesRes.json() : [];

      setListingDetails(prev => ({ ...prev, [listingId]: details }));
      setSalesData(prev => ({ ...prev, [listingId]: sales }));
      setPriceData(prev => ({ ...prev, [listingId]: prices }));
    } catch (err) {
      console.error('Error fetching listing details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleListingClick = (listingId) => {
    if (expandedListingId === listingId) {
      setExpandedListingId(null);
    } else {
      setExpandedListingId(listingId);
      if (!listingDetails[listingId]) {
        fetchListingDetails(listingId);
      }
    }
  };

  const openImageModal = (images, index) => {
    setImageModal({ open: true, images, currentIndex: index });
  };

  const closeImageModal = () => {
    setImageModal({ open: false, images: [], currentIndex: 0 });
  };

  const nextImage = () => {
    if (imageModal.currentIndex < imageModal.images.length - 1) {
      setImageModal({ ...imageModal, currentIndex: imageModal.currentIndex + 1 });
    }
  };

  const prevImage = () => {
    if (imageModal.currentIndex > 0) {
      setImageModal({ ...imageModal, currentIndex: imageModal.currentIndex - 1 });
    }
  };

  const getFuelType = (code) => {
    const fuelTypes = {
      1: 'Petrol/Gasoline',
      2: 'Diesel',
      3: 'Electric',
      4: 'LPG',
      5: 'Hybrid/Plug-in Hybrid',
      6: 'CNG',
      7: 'Hydrogen'
    };
    return fuelTypes[code] || `Unknown (${code})`;
  };

  const getTransmission = (code) => {
    const transmissions = {
      1: 'Manual',
      2: 'Automatic'
    };
    return transmissions[code] || `Unknown (${code})`;
  };

  return (
    <div className="app-shell">
      <h1>Vehicle Listings</h1>
      <p style={{ color: '#9cb0c9', marginBottom: '16px' }}>
        Compare current listing prices with original entry prices. Shows how much cheaper used cars are compared to their original selling price.
      </p>
      
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

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <AutofillInput
            placeholder="Filter by maker..."
            value={priceDeltaFilters.maker}
            onChange={(e) => {
              setPriceDeltaFilters({ ...priceDeltaFilters, maker: e.target.value, model: '' });
              setPriceDeltaPage(0);
            }}
            type="maker"
          />
          <AutofillInput
            placeholder="Filter by model..."
            value={priceDeltaFilters.model}
            onChange={(e) => {
              setPriceDeltaFilters({ ...priceDeltaFilters, model: e.target.value });
              setPriceDeltaPage(0);
            }}
            type="model"
            maker={priceDeltaFilters.maker || null}
          />
          <input
            type="number"
            placeholder="Min price (€)..."
            value={priceDeltaFilters.minPrice}
            onChange={(e) => {
              setPriceDeltaFilters({ ...priceDeltaFilters, minPrice: e.target.value });
              setPriceDeltaPage(0);
            }}
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
            placeholder="Max price (€)..."
            value={priceDeltaFilters.maxPrice}
            onChange={(e) => {
              setPriceDeltaFilters({ ...priceDeltaFilters, maxPrice: e.target.value });
              setPriceDeltaPage(0);
            }}
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

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th 
                onClick={() => handleSort('title')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Car{getSortIndicator('title')}
              </th>
              <th 
                onClick={() => handleSort('price_eur')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Listing Price{getSortIndicator('price_eur')}
              </th>
              <th 
                onClick={() => handleSort('entry_price_eur')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Original Price{getSortIndicator('entry_price_eur')}
              </th>
              <th 
                onClick={() => handleSort('price_delta')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Discount{getSortIndicator('price_delta')}
              </th>
              <th 
                onClick={() => handleSort('price_delta_percent')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Discount %{getSortIndicator('price_delta_percent')}
              </th>
              <th 
                onClick={() => handleSort('listing_year')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Year{getSortIndicator('listing_year')}
              </th>
              <th 
                onClick={() => handleSort('mileage_km')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Mileage{getSortIndicator('mileage_km')}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {priceDeltas.data.map((item) => {
              const isExpanded = expandedListingId === item.id;
              const details = listingDetails[item.id];
              const sales = salesData[item.id] || [];
              const prices = priceData[item.id] || [];
              const isLoading = loadingDetails && expandedListingId === item.id;

              const salesChartData = sales.length > 0 ? {
                labels: sales.map(s => s.year),
                datasets: [{
                  label: 'Units sold',
                  data: sales.map(s => s.units),
                  borderColor: '#5ad8a6',
                  backgroundColor: 'rgba(90, 216, 166, 0.1)',
                  tension: 0.2,
                  fill: true
                }]
              } : null;

              const priceChartData = prices.length > 0 ? {
                labels: prices.map(p => p.year),
                datasets: [{
                  label: 'Original Entry Price (€)',
                  data: prices.map(p => p.entry_price_eur),
                  borderColor: '#6ea8fe',
                  backgroundColor: 'rgba(110, 168, 254, 0.1)',
                  tension: 0.2,
                  fill: true
                }]
              } : null;

              return (
                <React.Fragment key={item.id}>
                  <tr 
                    onClick={() => handleListingClick(item.id)}
                    style={{ 
                      cursor: 'pointer',
                      backgroundColor: isExpanded ? '#1a2332' : 'transparent',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.backgroundColor = '#1a2332';
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td>
                      <div>
                        <strong>{item.make} {item.model}</strong>
                        <br />
                        <small style={{ color: '#9cb0c9', fontSize: '11px' }}>{item.title}</small>
                        {isExpanded && <div style={{ marginTop: '4px', fontSize: '11px', color: '#5ad8a6' }}>▼ Expanded</div>}
                        {!isExpanded && <div style={{ marginTop: '4px', fontSize: '11px', color: '#9cb0c9' }}>▶ Click to expand</div>}
                      </div>
                    </td>
                    <td>{formatCurrency(item.listing_price)}</td>
                    <td>{formatCurrency(item.original_price)}</td>
                    <td style={{ color: item.price_delta > 0 ? '#5ad8a6' : '#f06272' }}>
                      {formatCurrency(item.price_delta)}
                    </td>
                    <td style={{ color: item.price_delta_percent > 0 ? '#5ad8a6' : '#f06272' }}>
                      {item.price_delta_percent !== null ? `${item.price_delta_percent.toFixed(1)}%` : '—'}
                    </td>
                    <td>{item.listing_year || '—'}</td>
                    <td>{item.mileage_km ? formatNumber(item.mileage_km) + ' km' : '—'}</td>
                    <td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (addToComparison(item.id)) {
                            alert('Added to comparison list! Navigate to Compare page to view.');
                            navigate('/compare');
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
                  {isExpanded && (
                    <tr>
                      <td colSpan="8" style={{ padding: 0, borderBottom: 'none' }}>
                        <div style={{ 
                          padding: '24px',
                          background: '#0f1724',
                          borderTop: '2px solid #2a3441',
                          borderBottom: '2px solid #2a3441'
                        }}>
                          {isLoading && (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#9cb0c9' }}>
                              Loading details...
                            </div>
                          )}
                          {!isLoading && details && (
                            <div>
                              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#5ad8a6', fontSize: '18px' }}>
                                Vehicle Specifications
                              </h3>
                              <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                                gap: '16px',
                                marginBottom: '32px'
                              }}>
                                <div style={{ background: '#121a26', padding: '12px', borderRadius: '8px' }}>
                                  <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Make & Model</div>
                                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{details.make} {details.model}</div>
                                </div>
                                {details.price_eur && (
                                  <div style={{ background: '#121a26', padding: '12px', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Price</div>
                                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatCurrency(details.price_eur)} {details.currency || ''}</div>
                                  </div>
                                )}
                                {details.year && (
                                  <div style={{ background: '#121a26', padding: '12px', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Year</div>
                                    <div>{details.year}</div>
                                  </div>
                                )}
                                {details.mileage_km && (
                                  <div style={{ background: '#121a26', padding: '12px', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Mileage</div>
                                    <div>{formatNumber(details.mileage_km)} km</div>
                                  </div>
                                )}
                              </div>

                              {details.specs && (
                                <div style={{ marginBottom: '32px' }}>
                                  <h4 style={{ marginBottom: '12px', color: '#9cb0c9', fontSize: '14px' }}>Technical Specifications</h4>
                                  <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                                    gap: '12px'
                                  }}>
                                    {details.specs.fuel !== undefined && details.specs.fuel !== null && (
                                      <div style={{ background: '#121a26', padding: '12px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Fuel Type</div>
                                        <div>{getFuelType(details.specs.fuel)}</div>
                                      </div>
                                    )}
                                    {details.specs.transmission !== undefined && details.specs.transmission !== null && (
                                      <div style={{ background: '#121a26', padding: '12px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Transmission</div>
                                        <div>{getTransmission(details.specs.transmission)}</div>
                                      </div>
                                    )}
                                    {details.specs.power !== undefined && details.specs.power !== null && (
                                      <div style={{ background: '#121a26', padding: '12px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '12px', color: '#9cb0c9', marginBottom: '4px' }}>Power</div>
                                        <div>{details.specs.power} HP</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {details.images && details.images.length > 0 && (
                                <div style={{ marginBottom: '32px' }}>
                                  <h4 style={{ marginBottom: '12px', color: '#9cb0c9', fontSize: '14px' }}>Images ({details.images.length})</h4>
                                  <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', 
                                    gap: '12px',
                                    maxHeight: '400px',
                                    overflowY: 'auto'
                                  }}>
                                    {details.images.slice(0, 20).map((img, idx) => (
                                      <img
                                        key={idx}
                                        src={img}
                                        alt={`${details.title} - Image ${idx + 1}`}
                                        style={{
                                          width: '100%',
                                          height: '150px',
                                          objectFit: 'cover',
                                          borderRadius: '8px',
                                          border: '1px solid #2a3441',
                                          cursor: 'pointer'
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openImageModal(details.images, idx);
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}

                              {sales.length > 0 && (
                                <div style={{ marginBottom: '32px' }}>
                                  <h3 style={{ marginTop: '32px', marginBottom: '16px', color: '#5ad8a6', fontSize: '18px', borderTop: '2px solid #2a3441', paddingTop: '16px' }}>
                                    Sales Insights
                                  </h3>
                                  <Line
                                    data={salesChartData}
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

                              {prices.length > 0 && (
                                <div style={{ marginBottom: '32px' }}>
                                  <h3 style={{ marginTop: '32px', marginBottom: '16px', color: '#5ad8a6', fontSize: '18px', borderTop: '2px solid #2a3441', paddingTop: '16px' }}>
                                    Original Entry Price History
                                  </h3>
                                  <Line
                                    data={priceChartData}
                                    options={{
                                      plugins: { legend: { display: true, labels: { color: '#9cb0c9' } } },
                                      scales: { 
                                        y: { 
                                          ticks: { 
                                            color: '#9cb0c9',
                                            callback: function(value) {
                                              return formatCurrency(value);
                                            }
                                          },
                                          beginAtZero: false
                                        },
                                        x: { ticks: { color: '#9cb0c9' } }
                                      }
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #1f2a3b' }}>
          <div style={{ color: '#9cb0c9', fontSize: '13px' }}>
            Showing {priceDeltas.data.length} of {formatNumber(priceDeltas.total)} listings
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setPriceDeltaPage(Math.max(0, priceDeltaPage - 1))}
              disabled={priceDeltaPage === 0}
              style={{
                padding: '6px 12px',
                background: priceDeltaPage === 0 ? '#1f2a3b' : '#2a3441',
                border: '1px solid #2a3441',
                borderRadius: '6px',
                color: '#f6f7fb',
                cursor: priceDeltaPage === 0 ? 'not-allowed' : 'pointer',
                fontSize: '13px'
              }}
            >
              Previous
            </button>
            <button
              onClick={() => setPriceDeltaPage(priceDeltaPage + 1)}
              disabled={(priceDeltaPage + 1) * priceDeltaFilters.limit >= priceDeltas.total}
              style={{
                padding: '6px 12px',
                background: (priceDeltaPage + 1) * priceDeltaFilters.limit >= priceDeltas.total ? '#1f2a3b' : '#2a3441',
                border: '1px solid #2a3441',
                borderRadius: '6px',
                color: '#f6f7fb',
                cursor: (priceDeltaPage + 1) * priceDeltaFilters.limit >= priceDeltas.total ? 'not-allowed' : 'pointer',
                fontSize: '13px'
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {imageModal.open && (
        <ImageModal
          images={imageModal.images}
          currentIndex={imageModal.currentIndex}
          onClose={closeImageModal}
          onNext={nextImage}
          onPrev={prevImage}
        />
      )}
    </div>
  );
}

