import pytest

from app.market_data import FallbackMarketDataProvider, MarketDataError, MarketSnapshot


class FailingProvider:
    def fetch(self):
        raise MarketDataError("primary failed")


class WorkingProvider:
    def fetch(self):
        return MarketSnapshot(
            source="fallback",
            indexes=[{"code": "000001", "name": "上证指数", "price": 3000, "change_pct": 0.2, "amount": 1, "volume": 1}],
            breadth={"rising": 1, "falling": 0, "flat": 0, "limit_up": 0, "limit_down": 0},
            industry_boards=[],
            concept_boards=[],
        )


def test_fallback_provider_uses_secondary_when_primary_fails():
    provider = FallbackMarketDataProvider(FailingProvider(), WorkingProvider())

    snapshot = provider.fetch()

    assert snapshot.source == "fallback"


def test_fallback_provider_raises_when_all_sources_fail():
    provider = FallbackMarketDataProvider(FailingProvider(), FailingProvider())

    with pytest.raises(MarketDataError):
        provider.fetch()

