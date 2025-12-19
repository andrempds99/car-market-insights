"""Data processing utilities for ML models."""
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any
from datetime import datetime


def prepare_price_features(listing: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare features for price prediction from a listing."""
    features = {}
    
    # Numeric features
    features['year'] = listing.get('year') or 0
    features['mileage_km'] = listing.get('mileage_km') or 0
    features['age'] = datetime.now().year - (listing.get('year') or datetime.now().year)
    
    # Categorical features (one-hot encoded)
    make = str(listing.get('extracted_make') or listing.get('make') or '').lower()
    model = str(listing.get('extracted_model') or listing.get('model') or '').lower()
    fuel = listing.get('specs', {}).get('fuel') if isinstance(listing.get('specs'), dict) else None
    transmission = listing.get('specs', {}).get('transmission') if isinstance(listing.get('specs'), dict) else None
    
    features['make'] = make
    features['model'] = model
    features['fuel_type'] = fuel
    features['transmission'] = transmission
    
    # Engine features
    specs = listing.get('specs', {}) if isinstance(listing.get('specs'), dict) else {}
    features['power'] = specs.get('power') or 0
    engine_size = specs.get('engine', '')
    if isinstance(engine_size, str):
        # Extract numeric value from engine string
        try:
            features['engine_size'] = float(''.join(filter(str.isdigit, engine_size)) or 0)
        except:
            features['engine_size'] = 0
    else:
        features['engine_size'] = float(engine_size or 0)
    
    # Location (simplified - could be enhanced with geocoding)
    location = str(listing.get('location') or '').lower()
    features['location'] = location
    
    # Derived features
    if features['mileage_km'] > 0 and features['age'] > 0:
        features['mileage_per_year'] = features['mileage_km'] / features['age']
    else:
        features['mileage_per_year'] = 0
    
    return features


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and prepare dataframe for ML models."""
    df = df.copy()
    
    # Handle missing values
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].median())
    
    # Remove outliers (using IQR method)
    for col in numeric_cols:
        Q1 = df[col].quantile(0.25)
        Q3 = df[col].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        df = df[(df[col] >= lower_bound) & (df[col] <= upper_bound)]
    
    return df


def calculate_depreciation_rate(original_price: float, current_price: float, age_years: float) -> float:
    """Calculate annual depreciation rate."""
    if age_years <= 0 or original_price <= 0:
        return 0.0
    
    depreciation_amount = original_price - current_price
    depreciation_rate = (depreciation_amount / original_price) / age_years
    
    return depreciation_rate * 100  # Return as percentage


def calculate_price_per_mileage(price: float, mileage: float) -> Optional[float]:
    """Calculate price per kilometer."""
    if mileage <= 0:
        return None
    return price / mileage

