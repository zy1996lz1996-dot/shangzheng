from fastapi.testclient import TestClient

from app.config import get_settings
from app.database import ReportRepository
from app.main import app, get_repository


def test_reports_api_roundtrip(tmp_path):
    repository = ReportRepository(tmp_path / "reports.sqlite3")
    repository.save_report(
        {
            "date": "2026-05-31",
            "generated_at": "2026-05-31T17:00:00+08:00",
            "source": "test",
            "summary": {"title": "测试报告"},
            "indexes": [],
            "breadth": {},
            "boards": {"industries": [], "concepts": [], "weak": []},
            "strategy": {},
            "disclaimer": "仅供研究复盘，不构成任何证券投资建议或收益承诺。",
        }
    )

    app.dependency_overrides[get_repository] = lambda: repository
    client = TestClient(app)

    latest = client.get("/api/reports/latest")
    reports = client.get("/api/reports")
    detail = client.get("/api/reports/2026-05-31")

    assert latest.status_code == 200
    assert latest.json()["date"] == "2026-05-31"
    assert reports.status_code == 200
    assert len(reports.json()) == 1
    assert detail.status_code == 200

    app.dependency_overrides.clear()

