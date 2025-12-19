import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Layout/Navbar';
import Home from './pages/Home';
import Listings from './pages/Listings';
import Comparison from './pages/Comparison';
import MarketInsights from './pages/MarketInsights';

function App() {
  return (
    <div>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/listings" element={<Listings />} />
        <Route path="/compare" element={<Comparison />} />
        <Route path="/insights" element={<MarketInsights />} />
      </Routes>
    </div>
  );
}

export default App;
