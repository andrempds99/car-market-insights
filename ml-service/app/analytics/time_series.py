"""Time series analytics module."""
from typing import Optional, Dict, Any, List
from app.utils.database import execute_query
import pandas as pd
from datetime import datetime


class TimeSeriesAnalytics:
    """Time series and temporal analytics."""
    
    def get_price_evolution(
        self,
        make: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get price evolution over time (by year)."""
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
        
        where_clause = "WHERE " + " AND ".join(filters) if filters else ""
        
        query = f"""
            SELECT 
                l.year,
                COUNT(*) AS listing_count,
                AVG(l.price_eur) AS avg_price,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.price_eur) AS median_price,
                MIN(l.price_eur) AS min_price,
                MAX(l.price_eur) AS max_price
            FROM listings l
            LEFT JOIN models m ON m.id = l.model_id
            LEFT JOIN makers mk ON mk.id = m.maker_id
            {where_clause}
            AND l.year IS NOT NULL
            AND l.price_eur IS NOT NULL
            AND l.price_eur > 0
            GROUP BY l.year
            HAVING COUNT(*) >= 3
            ORDER BY l.year DESC
        """
        
        results = execute_query(query, tuple(params))
        if not results:
            return {"evolution": []}
        
        evolution = []
        for row in results:
            evolution.append({
                "year": int(row['year']),
                "listing_count": int(row['listing_count'] or 0),
                "avg_price": float(row['avg_price'] or 0),
                "median_price": float(row['median_price'] or 0),
                "min_price": float(row['min_price'] or 0),
                "max_price": float(row['max_price'] or 0)
            })
        
        return {"evolution": evolution}
    
    def get_seasonal_patterns(
        self,
        make: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get seasonal price patterns (if we had listing dates, would use month/quarter).
        For now, we'll analyze by year and show trends."""
        # Since we don't have listing dates, we'll analyze by year
        # In a real scenario, we'd group by month/quarter
        evolution = self.get_price_evolution(make=make, model=model)
        
        if not evolution.get('evolution'):
            return {"patterns": [], "trend": "insufficient_data"}
        
        prices = [e['avg_price'] for e in evolution['evolution']]
        if len(prices) < 2:
            return {"patterns": evolution['evolution'], "trend": "insufficient_data"}
        
        # Simple trend detection
        recent_prices = prices[:3] if len(prices) >= 3 else prices
        older_prices = prices[-3:] if len(prices) >= 3 else []
        
        if older_prices:
            recent_avg = sum(recent_prices) / len(recent_prices)
            older_avg = sum(older_prices) / len(older_prices)
            trend_direction = "increasing" if recent_avg > older_avg else "decreasing" if recent_avg < older_avg else "stable"
            trend_percent = ((recent_avg - older_avg) / older_avg * 100) if older_avg > 0 else 0
        else:
            trend_direction = "insufficient_data"
            trend_percent = 0
        
        return {
            "patterns": evolution['evolution'],
            "trend": trend_direction,
            "trend_percent": round(trend_percent, 2),
            "note": "Seasonal analysis requires listing dates. Showing yearly trends instead."
        }

