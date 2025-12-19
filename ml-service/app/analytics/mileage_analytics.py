"""Mileage analytics module."""
from typing import Optional, Dict, Any, List
from app.utils.database import execute_query
import numpy as np


class MileageAnalytics:
    """Mileage analytics and calculations."""
    
    def get_distribution(
        self,
        make: Optional[str] = None,
        model: Optional[str] = None,
        year: Optional[int] = None
    ) -> Dict[str, Any]:
        """Get mileage distribution statistics."""
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
                COUNT(*) AS count,
                AVG(l.mileage_km) AS mean,
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY l.mileage_km) AS q1,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.mileage_km) AS median,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY l.mileage_km) AS q3,
                MIN(l.mileage_km) AS min,
                MAX(l.mileage_km) AS max,
                STDDEV(l.mileage_km) AS stddev,
                AVG(CASE WHEN l.year IS NOT NULL THEN l.mileage_km / (EXTRACT(YEAR FROM NOW()) - l.year) ELSE NULL END) AS avg_mileage_per_year
            FROM listings l
            LEFT JOIN models m ON m.id = l.model_id
            LEFT JOIN makers mk ON mk.id = m.maker_id
            {where_clause}
            AND l.mileage_km IS NOT NULL
            AND l.mileage_km > 0
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
            "stddev": float(row['stddev'] or 0),
            "avg_mileage_per_year": float(row['avg_mileage_per_year'] or 0) if row['avg_mileage_per_year'] else None
        }
    
    def detect_anomalies(self, limit: int = 50) -> Dict[str, Any]:
        """Detect mileage anomalies (suspiciously low or high mileage)."""
        query = """
            SELECT 
                l.id,
                l.url,
                l.title,
                l.price_eur,
                l.year,
                l.mileage_km,
                EXTRACT(YEAR FROM NOW()) - l.year AS age_years,
                CASE 
                    WHEN l.year IS NOT NULL AND l.mileage_km IS NOT NULL 
                    THEN l.mileage_km / (EXTRACT(YEAR FROM NOW()) - l.year)
                    ELSE NULL
                END AS mileage_per_year,
                COALESCE(mk.name, l.extracted_make) AS make,
                COALESCE(m.name, l.extracted_model) AS model
            FROM listings l
            LEFT JOIN models m ON m.id = l.model_id
            LEFT JOIN makers mk ON mk.id = m.maker_id
            WHERE l.mileage_km IS NOT NULL
            AND l.mileage_km > 0
            AND l.year IS NOT NULL
            AND l.year > 1900
            ORDER BY l.mileage_km
            LIMIT 2000
        """
        
        results = execute_query(query)
        if not results:
            return {"anomalies": []}
        
        # Calculate expected mileage per year (average)
        mileage_per_year_values = [
            float(row['mileage_per_year']) 
            for row in results 
            if row['mileage_per_year'] and row['mileage_per_year'] > 0
        ]
        
        if len(mileage_per_year_values) < 10:
            return {"anomalies": []}
        
        mean_mpy = np.mean(mileage_per_year_values)
        std_mpy = np.std(mileage_per_year_values)
        
        anomalies = []
        for row in results:
            mpy = row['mileage_per_year']
            if mpy and std_mpy > 0:
                z_score = abs((float(mpy) - mean_mpy) / std_mpy)
                # Flag if more than 2 standard deviations from mean
                if z_score >= 2.0:
                    anomalies.append({
                        "id": row['id'],
                        "url": row['url'],
                        "title": row['title'],
                        "price_eur": row['price_eur'],
                        "year": row['year'],
                        "mileage_km": float(row['mileage_km']),
                        "age_years": float(row['age_years'] or 0),
                        "mileage_per_year": float(mpy),
                        "make": row['make'],
                        "model": row['model'],
                        "z_score": round(z_score, 2),
                        "anomaly_type": "high_mileage" if float(mpy) > mean_mpy else "low_mileage"
                    })
        
        anomalies.sort(key=lambda x: x['z_score'], reverse=True)
        return {"anomalies": anomalies[:limit]}

