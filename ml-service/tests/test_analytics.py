"""Basic tests for analytics modules."""
import unittest
from app.analytics.price_analytics import PriceAnalytics
from app.analytics.mileage_analytics import MileageAnalytics
from app.analytics.location_analytics import LocationAnalytics


class TestAnalytics(unittest.TestCase):
    """Test analytics modules."""
    
    def test_price_analytics_init(self):
        """Test PriceAnalytics initialization."""
        analytics = PriceAnalytics()
        self.assertIsNotNone(analytics)
    
    def test_mileage_analytics_init(self):
        """Test MileageAnalytics initialization."""
        analytics = MileageAnalytics()
        self.assertIsNotNone(analytics)
    
    def test_location_analytics_init(self):
        """Test LocationAnalytics initialization."""
        analytics = LocationAnalytics()
        self.assertIsNotNone(analytics)


if __name__ == '__main__':
    unittest.main()

