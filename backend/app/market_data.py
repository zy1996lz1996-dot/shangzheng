from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


class MarketDataError(RuntimeError):
    pass


@dataclass
class MarketSnapshot:
    source: str
    indexes: list[dict[str, Any]]
    breadth: dict[str, Any]
    industry_boards: list[dict[str, Any]]
    concept_boards: list[dict[str, Any]]


INDEX_CODES = {
    "000001": "上证指数",
    "399001": "深证成指",
    "399006": "创业板指",
    "000300": "沪深300",
    "000905": "中证500",
}


def _number(value: Any, default: float = 0) -> float:
    if value is None:
        return default
    try:
        if pd.isna(value):
            return default
    except TypeError:
        pass
    try:
        return float(str(value).replace(",", "").replace("%", ""))
    except ValueError:
        return default


def _first(row: pd.Series, names: list[str], default: Any = None) -> Any:
    for name in names:
        if name in row and not pd.isna(row[name]):
            return row[name]
    return default


def _normalize_index_row(row: pd.Series) -> dict[str, Any]:
    code = str(_first(row, ["代码", "指数代码", "symbol"], ""))
    return {
        "code": code,
        "name": str(_first(row, ["名称", "指数名称", "name"], INDEX_CODES.get(code, code))),
        "price": _number(_first(row, ["最新价", "收盘", "close", "收盘价"])),
        "change_pct": _number(_first(row, ["涨跌幅", "pct_chg", "涨跌幅(%)"])),
        "amount": _number(_first(row, ["成交额", "amount", "成交金额"])),
        "volume": _number(_first(row, ["成交量", "vol", "volume"])),
    }


def _normalize_board_row(row: pd.Series) -> dict[str, Any]:
    return {
        "name": str(_first(row, ["板块名称", "名称", "行业名称", "概念名称"], "")),
        "change_pct": _number(_first(row, ["涨跌幅", "涨跌幅%", "涨跌幅(%)"])),
        "turnover_rate": _number(_first(row, ["换手率", "换手率%"])),
        "rising_count": int(_number(_first(row, ["上涨家数", "上涨数"], 0))),
        "falling_count": int(_number(_first(row, ["下跌家数", "下跌数"], 0))),
        "leader": str(_first(row, ["领涨股票", "领涨股"], "")),
    }


class AkshareProvider:
    name = "AKShare"

    def fetch(self) -> MarketSnapshot:
        try:
            import akshare as ak
        except Exception as exc:
            raise MarketDataError(f"AKShare 不可用: {exc}") from exc

        try:
            indexes_df = ak.stock_zh_index_spot_em()
            indexes = self._indexes(indexes_df)
            industry = self._boards(ak.stock_board_industry_name_em())
            concept = self._boards(ak.stock_board_concept_name_em())
            breadth = self._breadth(ak.stock_zh_a_spot_em())
        except Exception as exc:
            raise MarketDataError(f"AKShare 抓取失败: {exc}") from exc

        if not indexes:
            raise MarketDataError("AKShare 未返回主要指数数据")

        return MarketSnapshot(
            source=self.name,
            indexes=indexes,
            breadth=breadth,
            industry_boards=industry,
            concept_boards=concept,
        )

    def _indexes(self, df: pd.DataFrame) -> list[dict[str, Any]]:
        if df.empty:
            return []
        code_column = "代码" if "代码" in df.columns else df.columns[0]
        selected = df[df[code_column].astype(str).isin(INDEX_CODES.keys())]
        if selected.empty:
            selected = df.head(5)
        return [_normalize_index_row(row) for _, row in selected.iterrows()]

    def _boards(self, df: pd.DataFrame) -> list[dict[str, Any]]:
        if df.empty:
            return []
        boards = [_normalize_board_row(row) for _, row in df.iterrows()]
        boards = [board for board in boards if board["name"]]
        return sorted(boards, key=lambda item: item["change_pct"], reverse=True)[:20]

    def _breadth(self, df: pd.DataFrame) -> dict[str, Any]:
        if df.empty:
            return {"rising": 0, "falling": 0, "flat": 0, "limit_up": 0, "limit_down": 0}
        change_column = "涨跌幅" if "涨跌幅" in df.columns else None
        if not change_column:
            return {"rising": 0, "falling": 0, "flat": 0, "limit_up": 0, "limit_down": 0}
        changes = df[change_column].map(_number)
        return {
            "rising": int((changes > 0).sum()),
            "falling": int((changes < 0).sum()),
            "flat": int((changes == 0).sum()),
            "limit_up": int((changes >= 9.8).sum()),
            "limit_down": int((changes <= -9.8).sum()),
        }


class TushareProvider:
    name = "Tushare"

    def __init__(self, token: str):
        self.token = token

    def fetch(self) -> MarketSnapshot:
        if not self.token:
            raise MarketDataError("Tushare Token 未配置")
        try:
            import tushare as ts
        except Exception as exc:
            raise MarketDataError(f"Tushare 不可用: {exc}") from exc

        try:
            pro = ts.pro_api(self.token)
            indexes = []
            for code, name in {
                "000001.SH": "上证指数",
                "399001.SZ": "深证成指",
                "399006.SZ": "创业板指",
                "000300.SH": "沪深300",
                "000905.SH": "中证500",
            }.items():
                df = pro.index_daily(ts_code=code, limit=1)
                if df.empty:
                    continue
                row = df.iloc[0]
                indexes.append(
                    {
                        "code": code,
                        "name": name,
                        "price": _number(row.get("close")),
                        "change_pct": _number(row.get("pct_chg")),
                        "amount": _number(row.get("amount")) * 1000,
                        "volume": _number(row.get("vol")),
                    }
                )
        except Exception as exc:
            raise MarketDataError(f"Tushare 抓取失败: {exc}") from exc

        if not indexes:
            raise MarketDataError("Tushare 未返回主要指数数据")

        return MarketSnapshot(
            source=self.name,
            indexes=indexes,
            breadth={"rising": 0, "falling": 0, "flat": 0, "limit_up": 0, "limit_down": 0},
            industry_boards=[],
            concept_boards=[],
        )


class FallbackMarketDataProvider:
    def __init__(self, primary: AkshareProvider, fallback: TushareProvider | None = None):
        self.primary = primary
        self.fallback = fallback

    def fetch(self) -> MarketSnapshot:
        errors: list[str] = []
        for provider in [self.primary, self.fallback]:
            if provider is None:
                continue
            try:
                return provider.fetch()
            except MarketDataError as exc:
                errors.append(str(exc))
                logger.warning("market provider failed: %s", exc)
        raise MarketDataError("; ".join(errors) or "没有可用行情数据源")

