"""Depreciation model for calculating depreciation curves."""
from typing import Optional, Dict, Any, List
import pandas as pd
import numpy as np
from app.utils.database import execute_query
from app.utils.data_processing import calculate_depreciation_rate


class DepreciationModel:
    """Depreciation curve model."""
    
    def __init__(self):
        """Initialize depreciation model."""
        pass
    
    def get_curves(
        self,
        make: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get depreciation curves for make/model."""
        # Get listings with both current price and original entry price
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
            SELECT DISTINCT ON (l.id)
                l.id,
                l.price_eur AS current_price,
                l.year AS listing_year,
                l.mileage_km,
                p.entry_price_eur AS original_price,
                p.year AS original_year,
                COALESCE(mk.name, l.extracted_make) AS make,
                COALESCE(m.name, l.extracted_model) AS model
            FROM listings l
            LEFT JOIN models m ON m.id = l.model_id
            LEFT JOIN makers mk ON mk.id = m.maker_id
            LEFT JOIN LATERAL (
                SELECT entry_price_eur, year
                FROM prices p2
                WHERE p2.model_id = m.id AND m.id IS NOT NULL
                ORDER BY ABS(p2.year - COALESCE(l.year, 0)) ASC
                LIMIT 1
            ) p ON m.id IS NOT NULL
            {where_clause}
            AND l.price_eur IS NOT NULL
            AND p.entry_price_eur IS NOT NULL
            AND l.year IS NOT NULL
            AND p.year IS NOT NULL
            ORDER BY l.id, ABS(p.year - l.year)
            LIMIT 500
        """
        
        results = execute_query(query, tuple(params))
        if not results:
            return {"curves": [], "error": "No data available"}
        
        # Calculate depreciation rates
        depreciation_data = []
        for row in results:
            current_price = float(row['current_price'] or 0)
            original_price = float(row['original_price'] or 0)
            listing_year = int(row['listing_year'] or 0)
            original_year = int(row['original_year'] or 0)
            age_years = listing_year - original_year
            
            if age_years > 0 and original_price > 0:
                depreciation_rate = calculate_depreciation_rate(
                    original_price, current_price, age_years
                )
                depreciation_amount = original_price - current_price
                depreciation_percent = (depreciation_amount / original_price * 100) if original_price > 0 else 0
                
                depreciation_data.append({
                    "age_years": age_years,
                    "original_price": original_price,
                    "current_price": current_price,
                    "depreciation_amount": depreciation_amount,
                    "depreciation_percent": depreciation_percent,
                    "annual_depreciation_rate": depreciation_rate,
                    "make": row['make'],
                    "model": row['model']
                })
        
        if not depreciation_data:
            return {"curves": [], "error": "No valid depreciation data"}
        
        # Group by age and calculate averages
        df = pd.DataFrame(depreciation_data)
        curve_points = []
        
        for age in sorted(df['age_years'].unique()):
            age_data = df[df['age_years'] == age]
            curve_points.append({
                "age_years": int(age),
                "avg_current_price": float(age_data['current_price'].mean()),
                "avg_original_price": float(age_data['original_price'].mean()),
                "avg_depreciation_percent": float(age_data['depreciation_percent'].mean()),
                "avg_annual_depreciation_rate": float(age_data['annual_depreciation_rate'].mean()),
                "sample_size": len(age_data)
            })
        
        return {
            "curves": curve_points,
            "summary": {
                "total_samples": len(depreciation_data),
                "avg_annual_depreciation_rate": float(df['annual_depreciation_rate'].mean()),
                "avg_total_depreciation_percent": float(df['depreciation_percent'].mean())
            }
        }
    
    def train(self):
        """Train depreciation model (for future enhancements)."""
        # Placeholder for future ML-based depreciation modeling
        pass

