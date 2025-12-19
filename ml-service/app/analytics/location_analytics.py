"""Location analytics module."""
from typing import Dict, Any, List
from app.utils.database import execute_query
from collections import defaultdict
import json


class LocationAnalytics:
    """Location-based analytics."""
    
    def get_heatmap_data(self) -> Dict[str, Any]:
        """Get price heatmap data by location."""
        query = """
            SELECT 
                l.location,
                COUNT(*) AS listing_count,
                AVG(l.price_eur) AS avg_price,
                MIN(l.price_eur) AS min_price,
                MAX(l.price_eur) AS max_price,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.price_eur) AS median_price
            FROM listings l
            WHERE l.location IS NOT NULL
            AND l.location != ''
            AND l.price_eur IS NOT NULL
            AND l.price_eur > 0
            GROUP BY l.location
            HAVING COUNT(*) >= 3
            ORDER BY avg_price DESC
        """
        
        results = execute_query(query)
        if not results:
            return {"heatmap_data": []}
        
        heatmap_data = []
        for row in results:
            heatmap_data.append({
                "location": row['location'],
                "listing_count": int(row['listing_count'] or 0),
                "avg_price": float(row['avg_price'] or 0),
                "min_price": float(row['min_price'] or 0),
                "max_price": float(row['max_price'] or 0),
                "median_price": float(row['median_price'] or 0)
            })
        
        return {"heatmap_data": heatmap_data}
    
    def calculate_premiums(self) -> Dict[str, Any]:
        """Calculate location-based price premiums."""
        # Get overall average price
        overall_query = """
            SELECT AVG(price_eur) AS overall_avg
            FROM listings
            WHERE price_eur IS NOT NULL AND price_eur > 0
        """
        overall_result = execute_query(overall_query)
        overall_avg = float(overall_result[0]['overall_avg'] or 0) if overall_result else 0
        
        if overall_avg == 0:
            return {"premiums": []}
        
        # Get location averages
        location_query = """
            SELECT 
                l.location,
                COUNT(*) AS listing_count,
                AVG(l.price_eur) AS avg_price
            FROM listings l
            WHERE l.location IS NOT NULL
            AND l.location != ''
            AND l.price_eur IS NOT NULL
            AND l.price_eur > 0
            GROUP BY l.location
            HAVING COUNT(*) >= 5
            ORDER BY avg_price DESC
        """
        
        results = execute_query(location_query)
        if not results:
            return {"premiums": []}
        
        premiums = []
        for row in results:
            location_avg = float(row['avg_price'] or 0)
            premium_amount = location_avg - overall_avg
            premium_percent = (premium_amount / overall_avg * 100) if overall_avg > 0 else 0
            
            premiums.append({
                "location": row['location'],
                "listing_count": int(row['listing_count'] or 0),
                "avg_price": location_avg,
                "premium_amount": round(premium_amount, 2),
                "premium_percent": round(premium_percent, 2),
                "premium_type": "premium" if premium_amount > 0 else "discount"
            })
        
        return {
            "overall_avg_price": overall_avg,
            "premiums": premiums
        }

