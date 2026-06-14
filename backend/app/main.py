from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from zoneinfo import ZoneInfo

from app.config import Settings, get_settings
from app.database import ReportRepository
from app.market_data import AkshareProvider, FallbackMarketDataProvider, MarketDataError, TushareProvider
from app.strategy import build_report

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_repository(settings: Settings = Depends(get_settings)) -> ReportRepository:
    return ReportRepository(settings.database_file)


def create_provider(settings: Settings) -> FallbackMarketDataProvider:
    fallback = TushareProvider(settings.tushare_token) if settings.tushare_token else None
    return FallbackMarketDataProvider(AkshareProvider(), fallback)


def generate_today_report(
    repository: ReportRepository,
    settings: Settings,
) -> dict:
    snapshot = create_provider(settings).fetch()
    report = build_report(snapshot)
    repository.save_report(report)
    repository.cleanup(settings.retention_days)
    logger.info("generated report for %s via %s", report["date"], report["source"])
    return report


def scheduled_job() -> None:
    settings = get_settings()
    repository = ReportRepository(settings.database_file)
    try:
        generate_today_report(repository, settings)
    except MarketDataError as exc:
        logger.exception("daily report generation failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler(timezone=ZoneInfo("Asia/Shanghai"))
    scheduler.add_job(
        scheduled_job,
        "cron",
        day_of_week="mon-fri",
        hour=18,
        minute=0,
        id="daily_report",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("daily report scheduler started: weekdays 18:00 Asia/Shanghai")
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="A股每日盘后分析 API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "timezone": "Asia/Shanghai"}


@app.get("/api/reports/latest")
def latest_report(repository: ReportRepository = Depends(get_repository)) -> dict:
    report = repository.latest()
    if not report:
        raise HTTPException(status_code=404, detail="今日报告暂未生成")
    return report


@app.get("/api/reports")
def list_reports(limit: int = 90, repository: ReportRepository = Depends(get_repository)) -> list[dict]:
    return repository.list(max(1, min(limit, 90)))


@app.get("/api/reports/{report_date}")
def get_report(report_date: str, repository: ReportRepository = Depends(get_repository)) -> dict:
    report = repository.get(report_date)
    if not report:
        raise HTTPException(status_code=404, detail="未找到该日期报告")
    return report


@app.post("/api/admin/reports/run-today")
def run_today(
    x_admin_key: str = Header(default=""),
    repository: ReportRepository = Depends(get_repository),
    settings: Settings = Depends(get_settings),
) -> dict:
    if not settings.admin_run_key or x_admin_key != settings.admin_run_key:
        raise HTTPException(status_code=401, detail="无权执行手动生成")
    try:
        return generate_today_report(repository, settings)
    except MarketDataError as exc:
        logger.exception("manual report generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


