from app.market_data import MarketSnapshot
from app.strategy import build_report


def test_build_report_for_warm_market():
    snapshot = MarketSnapshot(
        source="test",
        indexes=[
            {"code": "000001", "name": "上证指数", "price": 3200, "change_pct": 1.1, "amount": 1, "volume": 1},
            {"code": "399001", "name": "深证成指", "price": 10000, "change_pct": 1.4, "amount": 1, "volume": 1},
        ],
        breadth={"rising": 3800, "falling": 1200, "flat": 100, "limit_up": 70, "limit_down": 3},
        industry_boards=[{"name": "半导体", "change_pct": 2.5, "turnover_rate": 3, "rising_count": 80, "falling_count": 10, "leader": "示例"}],
        concept_boards=[{"name": "人工智能", "change_pct": 2.1, "turnover_rate": 4, "rising_count": 90, "falling_count": 8, "leader": "示例"}],
    )

    report = build_report(snapshot)

    assert report["summary"]["risk_level"] == "低"
    assert report["strategy"]["position_range"] == "50%-70%"
    assert "半导体" in report["strategy"]["focus"]


def test_build_report_for_high_risk_market():
    snapshot = MarketSnapshot(
        source="test",
        indexes=[
            {"code": "000001", "name": "上证指数", "price": 3000, "change_pct": -1.8, "amount": 1, "volume": 1},
            {"code": "399001", "name": "深证成指", "price": 9000, "change_pct": -2.2, "amount": 1, "volume": 1},
        ],
        breadth={"rising": 700, "falling": 4200, "flat": 100, "limit_up": 12, "limit_down": 80},
        industry_boards=[{"name": "银行", "change_pct": -0.2, "turnover_rate": 1, "rising_count": 20, "falling_count": 30, "leader": ""}],
        concept_boards=[{"name": "新能源", "change_pct": -3.0, "turnover_rate": 5, "rising_count": 8, "falling_count": 120, "leader": ""}],
    )

    report = build_report(snapshot)

    assert report["summary"]["risk_level"] == "高"
    assert report["strategy"]["position_range"] == "20%-40%"

