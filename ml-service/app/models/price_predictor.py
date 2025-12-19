"""Price prediction model using XGBoost."""
import os
import pickle
from typing import Dict, Any, Optional
import pandas as pd
import numpy as np
try:
    from xgboost import XGBRegressor
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    print("Warning: XGBoost not available, using fallback")
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestRegressor
from app.utils.database import execute_query
from app.utils.data_processing import prepare_price_features, clean_dataframe


class PricePredictor:
    """Price prediction model."""
    
    def __init__(self, model_path: Optional[str] = None):
        """Initialize price predictor."""
        import os
        model_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'models')
        os.makedirs(model_dir, exist_ok=True)
        self.model_path = model_path or os.path.join(model_dir, "price_predictor.pkl")
        self.model = None
        self.label_encoders = {}
        self.feature_columns = []
        self.is_trained = False
        
        # Try to load existing model
        if os.path.exists(self.model_path):
            try:
                self.load_model()
            except Exception as e:
                print(f"Could not load existing model: {e}")
    
    def load_training_data(self) -> pd.DataFrame:
        """Load training data from database."""
        query = """
            SELECT 
                l.id,
                l.price_eur,
                l.year,
                l.mileage_km,
                l.location,
                l.extracted_make AS make,
                l.extracted_model AS model,
                l.specs
            FROM listings l
            WHERE l.price_eur IS NOT NULL
            AND l.price_eur > 0
            AND l.price_eur < 1000000  -- Remove extreme outliers
            AND l.year IS NOT NULL
            AND l.year >= 1990
            AND l.mileage_km IS NOT NULL
            AND l.mileage_km >= 0
            AND l.mileage_km < 500000  -- Remove extreme outliers
        """
        
        results = execute_query(query)
        if not results:
            raise ValueError("No training data available")
        
        # Convert to DataFrame
        data = []
        for row in results:
            listing = {
                'price_eur': float(row['price_eur']),
                'year': int(row['year']),
                'mileage_km': float(row['mileage_km']),
                'location': str(row['location'] or ''),
                'make': str(row['make'] or ''),
                'model': str(row['model'] or ''),
            }
            
            # Extract specs
            specs = row.get('specs', {})
            if isinstance(specs, str):
                try:
                    import json
                    specs = json.loads(specs)
                except:
                    specs = {}
            
            listing['fuel_type'] = specs.get('fuel') if isinstance(specs, dict) else None
            listing['transmission'] = specs.get('transmission') if isinstance(specs, dict) else None
            listing['power'] = specs.get('power') or 0
            engine = specs.get('engine', '') if isinstance(specs, dict) else ''
            if isinstance(engine, str):
                listing['engine_size'] = float(''.join(filter(str.isdigit, engine)) or 0)
            else:
                listing['engine_size'] = float(engine or 0)
            
            data.append(listing)
        
        df = pd.DataFrame(data)
        return clean_dataframe(df)
    
    def prepare_features(self, df: pd.DataFrame) -> tuple:
        """Prepare features for training."""
        # Create age feature
        current_year = pd.Timestamp.now().year
        df['age'] = current_year - df['year']
        
        # Create mileage per year
        df['mileage_per_year'] = df['mileage_km'] / df['age'].replace(0, 1)
        
        # Select features
        feature_cols = ['year', 'age', 'mileage_km', 'mileage_per_year', 'power', 'engine_size']
        categorical_cols = ['make', 'model', 'location', 'fuel_type', 'transmission']
        
        # Encode categorical variables
        X = df[feature_cols].copy()
        for col in categorical_cols:
            if col in df.columns:
                le = LabelEncoder()
                # Handle NaN values
                df[col] = df[col].fillna('unknown')
                X[col + '_encoded'] = le.fit_transform(df[col].astype(str))
                self.label_encoders[col] = le
                feature_cols.append(col + '_encoded')
        
        y = df['price_eur']
        
        self.feature_columns = feature_cols
        return X[feature_cols], y
    
    def train(self):
        """Train the price prediction model."""
        print("Loading training data...")
        df = self.load_training_data()
        
        if len(df) < 50:
            raise ValueError(f"Insufficient training data: {len(df)} samples (need at least 50)")
        
        print(f"Training on {len(df)} samples...")
        X, y = self.prepare_features(df)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        # Train model (use XGBoost if available, otherwise Random Forest)
        if XGBOOST_AVAILABLE:
            self.model = XGBRegressor(
                n_estimators=100,
                max_depth=6,
                learning_rate=0.1,
                random_state=42,
                n_jobs=-1
            )
        else:
            self.model = RandomForestRegressor(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                n_jobs=-1
            )
        
        self.model.fit(X_train, y_train)
        
        # Evaluate
        train_score = self.model.score(X_train, y_train)
        test_score = self.model.score(X_test, y_test)
        
        print(f"Training R²: {train_score:.4f}")
        print(f"Test R²: {test_score:.4f}")
        
        self.is_trained = True
        
        # Save model
        self.save_model()
    
    def predict(self, listing: Dict[str, Any]) -> Dict[str, Any]:
        """Predict price for a listing."""
        if not self.is_trained or self.model is None:
            # Try to train if not trained
            try:
                self.train()
            except Exception as e:
                return {
                    "error": "Model not trained",
                    "message": str(e),
                    "fallback": True
                }
        
        # Prepare features
        features = prepare_price_features(listing)
        
        # Create feature vector
        feature_vector = {}
        for col in self.feature_columns:
            if col.endswith('_encoded'):
                # Categorical encoding
                original_col = col.replace('_encoded', '')
                if original_col in self.label_encoders:
                    le = self.label_encoders[original_col]
                    value = str(features.get(original_col, 'unknown'))
                    try:
                        feature_vector[col] = le.transform([value])[0]
                    except:
                        # Unknown category, use most common
                        feature_vector[col] = 0
                else:
                    feature_vector[col] = 0
            else:
                feature_vector[col] = features.get(col, 0)
        
        # Ensure all required features are present
        for col in self.feature_columns:
            if col not in feature_vector:
                feature_vector[col] = 0
        
        # Create DataFrame with correct column order
        X = pd.DataFrame([feature_vector])[self.feature_columns]
        
        # Predict
        try:
            prediction = self.model.predict(X)[0]
            confidence = 0.8  # Could be improved with prediction intervals
            
            return {
                "predicted_price": round(float(prediction), 2),
                "confidence": confidence,
                "model_version": "1.0"
            }
        except Exception as e:
            return {
                "error": "Prediction failed",
                "message": str(e)
            }
    
    def save_model(self):
        """Save trained model."""
        import os
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        with open(self.model_path, 'wb') as f:
            pickle.dump({
                'model': self.model,
                'label_encoders': self.label_encoders,
                'feature_columns': self.feature_columns
            }, f)
    
    def load_model(self):
        """Load trained model."""
        import os
        if os.path.exists(self.model_path):
            with open(self.model_path, 'rb') as f:
                data = pickle.load(f)
                self.model = data['model']
                self.label_encoders = data['label_encoders']
                self.feature_columns = data['feature_columns']
                self.is_trained = True

