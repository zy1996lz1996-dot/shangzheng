import json
import sqlite3
from datetime import date, timedelta
from pathlib import Path
from typing import Any


class ReportRepository:
    def __init__(self, database_path: Path | str):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.init()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def init(self) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS reports (
                    report_date TEXT PRIMARY KEY,
                    generated_at TEXT NOT NULL,
                    source TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_reports_generated_at ON reports(generated_at DESC)"
            )

    def save_report(self, report: dict[str, Any]) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO reports (report_date, generated_at, source, payload)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(report_date) DO UPDATE SET
                    generated_at = excluded.generated_at,
                    source = excluded.source,
                    payload = excluded.payload
                """,
                (
                    report["date"],
                    report["generated_at"],
                    report["source"],
                    json.dumps(report, ensure_ascii=False),
                ),
            )

    def latest(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload FROM reports ORDER BY report_date DESC LIMIT 1"
            ).fetchone()
        return json.loads(row["payload"]) if row else None

    def get(self, report_date: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload FROM reports WHERE report_date = ?",
                (report_date,),
            ).fetchone()
        return json.loads(row["payload"]) if row else None

    def list(self, limit: int = 90) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT payload FROM reports ORDER BY report_date DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [json.loads(row["payload"]) for row in rows]

    def cleanup(self, retention_days: int) -> None:
        cutoff = (date.today() - timedelta(days=retention_days)).isoformat()
        with self.connect() as connection:
            connection.execute("DELETE FROM reports WHERE report_date < ?", (cutoff,))

