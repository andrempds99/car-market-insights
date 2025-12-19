"""Price analytics module."""
from typing import Optional, Dict, Any, List
from app.utils.database import execute_query
from app.utils.data_processing import calculate_price_per_mileage
import numpy as np
from scipy import stats


class PriceAnalytics:
    """Price analytics and calculations."""
    
    def calculate_fmv(
        self,
        make: Optional[str] = None,
        model: Optional[str] = None,
        year: Optional[int] = None,
        mileage_km: Optional[float] = None,
        fuel_type: Optional[int] = None,
        transmission: Optional[int] = None
    ) -> Dict[str, Any]:
        """Calculate fair market value based on similar listings."""
        filters = []
        params = []
        param_idx = 1
        
        if make:
            filters.append(f"(l.extracted_make ILIKE ${param_idx} OR mk.name ILIKE ${param_idx})")
            params.append(f"%{make}%")
            param_idx += 1
        
        if model:
            filters.append(f"(l.extracted_model ILIKE ${param_idx} OR m.name ILIKE ${param_idx})")
            params.append(f"%{model}%")
            param_idx += 1
        
        if year:
            filters.append(f"l.year = ${param_idx}")
            params.append(year)
            param_idx += 1
        
        where_clause = "WHERE " + " AND ".join(filters) if filters else ""
        
        query = f"""
            SELECT 
                AVG(l.price_eur) AS avg_price,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.price_eur) AS median_price,
                MIN(l.price_eur) AS min_price,
                MAX(l.price_eur) AS max_price,
                COUNT(*) AS sample_size,
                AVG(l.mileage_km) AS avg_mileage
            FROM listings l
            LEFT JOIN models m ON m.id = l.model_id
            LEFT JOIN makers mk ON mk.id = m.maker_id
            {where_clause}
            AND l.price_eur IS NOT NULL
            AND l.price_eur > 0
        """
        
        results = execute_query(query, tuple(params))
        if not results:
            return {"error": "No data found"}
        
        row = results[0]
        
        # Adjust for mileage if provided
        fmv = float(row['median_price'] or row['avg_price'] or 0)
        if mileage_km and row['avg_mileage']:
            avg_mileage = float(row['avg_mileage'])
            if avg_mileage > 0:
                # Simple mileage adjustment: -0.5 EUR per km difference
                mileage_diff = mileage_km - avg_mileage
                fmv = fmv - (mileage_diff * 0.5)
                fmv = max(fmv, 0)  # Ensure non-negative
        
        return {
            "fair_market_value": round(fmv, 2),
            "average_price": float(row['avg_price'] or 0),
            "median_price": float(row['median_price'] or 0),
            "min_price": float(row['min_price'] or 0),
            "max_price": float(row['max_price'] or 0),
            "sample_size": int(row['sample_size'] or 0),
            "confidence": "high" if int(row['sample_size'] or 0) >= 10 else "medium" if int(row['sample_size'] or 0) >= 5 else "low"
        }
    
    def detect_anomalies(
        self,
        limit: int = 50,
        threshold: float = 2.0,
        make: Optional[str] = None,
        model: Optional[str] = None,
        year: Optional[int] = None
    ) -> Dict[str, Any]:
        """Detect price anomalies using Z-score method."""
        filters = []
        params = []
        param_idx = 1
        
        # Base filters
        filters.append("l.price_eur IS NOT NULL")
        filters.append("l.price_eur > 0")
        
        if make:
            filters.append(f"(l.extracted_make ILIKE ${param_idx} OR mk.name ILIKE ${param_idx})")
            params.append(f"%{make}%")
            param_idx += 1
        
        if model:
            filters.append(f"(l.extracted_model ILIKE ${param_idx} OR m.name ILIKE ${param_idx})")
            params.append(f"%{model}%")
            param_idx += 1
        
        if year:
            filters.append(f"l.year = ${param_idx}")
            params.append(year)
            param_idx += 1
        
        where_clause = "WHERE " + " AND ".join(filters)
        
        query = f"""
            SELECT 
                l.id,
                l.url,
                l.title,
                l.price_eur,
                l.year,
                l.mileage_km,
                COALESCE(mk.name, l.extracted_make) AS make,
                COALESCE(m.name, l.extracted_model) AS model
            FROM listings l
            LEFT JOIN models m ON m.id = l.model_id
            LEFT JOIN makers mk ON mk.id = m.maker_id
            {where_clause}
            ORDER BY l.price_eur DESC
            LIMIT 1000
        """
        
        results = execute_query(query, tuple(params))
        if not results:
            return {"anomalies": []}
        
        prices = [float(row['price_eur']) for row in results if row['price_eur']]
        if len(prices) < 10:
            return {"anomalies": []}
        
        mean_price = np.mean(prices)
        std_price = np.std(prices)
        
        anomalies = []
        for row in results:
            price = float(row['price_eur'] or 0)
            if std_price > 0:
                z_score = abs((price - mean_price) / std_price)
                if z_score >= threshold:
                    anomalies.append({
                        "id": row['id'],
                        "url": row['url'],
                        "title": row['title'],
                        "price_eur": price,
                        "year": row['year'],
                        "mileage_km": row['mileage_km'],
                        "make": row['make'],
                        "model": row['model'],
                        "z_score": round(z_score, 2),
                        "anomaly_type": "overpriced" if price > mean_price else "underpriced"
                    })
        
        # Sort by z-score descending and limit
        anomalies.sort(key=lambda x: x['z_score'], reverse=True)
        return {"anomalies": anomalies[:limit]}
    
    def get_distribution(
        self,
        make: Optional[str] = None,
        model: Optional[str] = None,
        year: Optional[int] = None,
        mileage_km: Optional[float] = None
    ) -> Dict[str, Any]:
        """Get price distribution statistics."""
        filters = []
        params = []
        param_idx = 1
        
        if make:
            filters.append(f"(l.extracted_make ILIKE ${param_idx} OR mk.name ILIKE ${param_idx})")
            params.append(f"%{make}%")
            param_idx += 1
        
        if model:
            filters.append(f"(l.extracted_model ILIKE ${param_idx} OR m.name ILIKE ${param_idx})")
            params.append(f"%{model}%")
            param_idx += 1
        
        if year:
            filters.append(f"l.year = ${param_idx}")
            params.append(year)
            param_idx += 1
        
        if mileage_km:
            # Filter by mileage range (within 20% of specified mileage)
            filters.append(f"l.mileage_km BETWEEN ${param_idx} AND ${param_idx + 1}")
            params.append(mileage_km * 0.8)
            params.append(mileage_km * 1.2)
            param_idx += 2
        
        # Always include price filters
        filters.append("l.price_eur IS NOT NULL")
        filters.append("l.price_eur > 0")
        
        where_clause = "WHERE " + " AND ".join(filters) if filters else ""
        
        query = f"""
            SELECT 
                COUNT(*) AS count,
                AVG(l.price_eur) AS mean,
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY l.price_eur) AS q1,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.price_eur) AS median,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY l.price_eur) AS q3,
                MIN(l.price_eur) AS min,
                MAX(l.price_eur) AS max,
                STDDEV(l.price_eur) AS stddev
            FROM listings l
            LEFT JOIN models m ON m.id = l.model_id
            LEFT JOIN makers mk ON mk.id = m.maker_id
            {where_clause}
        """
        
        results = execute_query(query, tuple(params))
        if not results:
            return {"error": "No data found"}
        
        row = results[0]
        return {
            "count": int(row['count'] or 0),
            "mean": float(row['mean'] or 0),
            "median": float(row['median'] or 0),
            "q1": float(row['q1'] or 0),
            "q3": float(row['q3'] or 0),
            "min": float(row['min'] or 0),
            "max": float(row['max'] or 0),
            "stddev": float(row['stddev'] or 0)
        }

