"""Sales forecasting model using Prophet."""
from typing import Optional, Dict, Any
import pandas as pd
import numpy as np
try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    print("Warning: Prophet not available, forecasting will use simple linear regression")
from app.utils.database import execute_query


class SalesForecaster:
    """Sales volume forecasting model."""
    
    def __init__(self):
        """Initialize sales forecaster."""
        self.model = None
        self.is_trained = False
    
    def load_training_data(self, make: Optional[str] = None, model: Optional[str] = None) -> pd.DataFrame:
        """Load sales data from database."""
        filters = []
        params = []
        param_idx = 1
        
        if make:
            filters.append(f"mk.name ILIKE ${param_idx}")
            params.append(f"%{make}%")
            param_idx += 1
        
        if model:
            filters.append(f"m.name ILIKE ${param_idx}")
            params.append(f"%{model}%")
            param_idx += 1
        
        where_clause = "WHERE " + " AND ".join(filters) if filters else ""
        
        query = f"""
            SELECT 
                s.year AS ds,
                SUM(s.units) AS y
            FROM sales s
            JOIN models m ON m.id = s.model_id
            JOIN makers mk ON mk.id = m.maker_id
            {where_clause}
            GROUP BY s.year
            ORDER BY s.year
        """
        
        results = execute_query(query, tuple(params))
        if not results:
            raise ValueError("No sales data available")
        
        data = []
        for row in results:
            data.append({
                'ds': pd.Timestamp(f"{int(row['ds'])}-01-01"),
                'y': float(row['y'] or 0)
            })
        
        df = pd.DataFrame(data)
        return df
    
    def train(self, make: Optional[str] = None, model: Optional[str] = None):
        """Train the sales forecasting model."""
        print("Loading sales data...")
        df = self.load_training_data(make=make, model=model)
        
        if len(df) < 3:
            raise ValueError(f"Insufficient data: {len(df)} years (need at least 3)")
        
        print(f"Training on {len(df)} years of data...")
        
        if PROPHET_AVAILABLE:
            # Initialize and fit Prophet model
            self.model = Prophet(
                yearly_seasonality=True,
                weekly_seasonality=False,
                daily_seasonality=False,
                seasonality_mode='multiplicative'
            )
            self.model.fit(df)
        else:
            # Fallback to simple linear regression
            from sklearn.linear_model import LinearRegression
            X = df['ds'].apply(lambda x: x.year).values.reshape(-1, 1)
            y = df['y'].values
            self.model = LinearRegression()
            self.model.fit(X, y)
        self.is_trained = True
    
    async def forecast(
        self,
        make: Optional[str] = None,
        model: Optional[str] = None,
        periods: int = 12
    ) -> Dict[str, Any]:
        """Forecast future sales volumes."""
        # Train model if not trained or if parameters changed
        try:
            self.train(make=make, model=model)
        except Exception as e:
            return {
                "error": "Forecast failed",
                "message": str(e)
            }
        
        if PROPHET_AVAILABLE:
            # Create future dataframe
            future = self.model.make_future_dataframe(periods=periods, freq='Y')
            
            # Forecast
            forecast = self.model.predict(future)
            
            # Get future predictions only
            future_forecast = forecast.tail(periods)[['ds', 'yhat', 'yhat_lower', 'yhat_upper']]
            
            # Format results
            predictions = []
            for _, row in future_forecast.iterrows():
                predictions.append({
                    "year": int(row['ds'].year),
                    "predicted_units": round(float(row['yhat']), 0),
                    "lower_bound": round(float(row['yhat_lower']), 0),
                    "upper_bound": round(float(row['yhat_upper']), 0)
                })
        else:
            # Fallback: simple linear regression forecast
            last_year = df['ds'].max().year
            predictions = []
            for i in range(1, periods + 1):
                future_year = last_year + i
                pred = self.model.predict([[future_year]])[0]
                # Simple confidence interval (20% variation)
                lower = pred * 0.8
                upper = pred * 1.2
                predictions.append({
                    "year": future_year,
                    "predicted_units": round(float(pred), 0),
                    "lower_bound": round(float(lower), 0),
                    "upper_bound": round(float(upper), 0)
                })
        
        return {
            "forecast": predictions,
            "model_type": "Prophet",
            "periods": periods
        }

