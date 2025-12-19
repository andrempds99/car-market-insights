import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const navLinkStyle = (active) => ({
    padding: '8px 16px',
    textDecoration: 'none',
    color: active ? '#5ad8a6' : '#9cb0c9',
    borderBottom: active ? '2px solid #5ad8a6' : '2px solid transparent',
    transition: 'all 0.2s',
    fontSize: '14px',
    fontWeight: active ? '600' : '400'
  });

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      background: '#121a26',
      borderBottom: '1px solid #1f2a3b',
      padding: '0 24px',
      marginBottom: '24px'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: '32px',
        height: '60px'
      }}>
        <Link to="/" style={{
          textDecoration: 'none',
          color: '#f6f7fb',
          fontSize: '20px',
          fontWeight: '700'
        }}>
          Car Market Insights
        </Link>
        <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
          <Link to="/" style={navLinkStyle(isActive('/'))}>
            Home
          </Link>
          <Link to="/listings" style={navLinkStyle(isActive('/listings'))}>
            Listings
          </Link>
          <Link to="/compare" style={navLinkStyle(isActive('/compare'))}>
            Compare
          </Link>
          <Link to="/insights" style={navLinkStyle(isActive('/insights'))}>
            Market Insights
          </Link>
        </div>
      </div>
    </nav>
  );
}

