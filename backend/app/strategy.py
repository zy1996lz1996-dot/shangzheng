from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.market_data import MarketSnapshot


def _average(values: list[float]) -> float:
    return round(sum(values) / len(values), 2) if values else 0


def _market_temperature(avg_index_change: float, breadth_ratio: float, strong_board_count: int) -> str:
    score = avg_index_change * 18 + (breadth_ratio - 0.5) * 70 + strong_board_count * 1.5
    if score >= 35:
        return "偏热"
    if score >= 10:
        return "回暖"
    if score <= -25:
        return "偏冷"
    if score <= -8:
        return "谨慎"
    return "中性"


def _risk_level(avg_index_change: float, falling: int, rising: int, limit_down: int) -> str:
    if avg_index_change <= -1.2 or (falling > rising * 1.8 and limit_down >= 20):
        return "高"
    if avg_index_change < -0.35 or falling > rising * 1.2:
        return "中"
    return "低"


def _position_range(risk_level: str, temperature: str) -> str:
    if risk_level == "高":
        return "20%-40%"
    if temperature in {"偏热", "回暖"} and risk_level == "低":
        return "50%-70%"
    if temperature == "偏冷":
        return "20%-35%"
    return "35%-55%"


def _names(items: list[dict], limit: int = 3) -> str:
    names = [item["name"] for item in items[:limit] if item.get("name")]
    return "、".join(names) if names else "暂无明显方向"


def _index_line(indexes: list[dict]) -> str:
    if not indexes:
        return "主要指数数据暂未返回。"
    return "；".join(
        f'{item["name"]}收于{item["price"]:.2f}，涨跌幅{item["change_pct"]:+.2f}%'
        for item in indexes
    ) + "。"


def _build_sections(
    snapshot: MarketSnapshot,
    top_industries: list[dict],
    top_concepts: list[dict],
    weak_boards: list[dict],
    stance: str,
    temperature: str,
    risk_level: str,
    position_range: str,
) -> list[dict]:
    breadth = snapshot.breadth
    total_amount = sum(item.get("amount", 0) for item in snapshot.indexes)
    amount_text = f"主要指数合计成交额约{total_amount / 100000000:.0f}亿元" if total_amount else "成交额数据暂未完整返回"

    return [
        {
            "key": "one_line",
            "title": "今日一句话总结",
            "content": [stance],
        },
        {
            "key": "index_performance",
            "title": "大盘指数表现",
            "content": [_index_line(snapshot.indexes)],
        },
        {
            "key": "intraday_review",
            "title": "盘中走势复盘",
            "content": [
                "当前自动接口以盘后快照为主，分时走势尚未接入；盘中强弱先由收盘涨跌、市场宽度和板块强弱共同判断。"
            ],
        },
        {
            "key": "turnover_breadth",
            "title": "成交额与市场宽度",
            "content": [
                f"{amount_text}；上涨{breadth.get('rising', 0)}家，下跌{breadth.get('falling', 0)}家，涨停{breadth.get('limit_up', 0)}家，跌停{breadth.get('limit_down', 0)}家。"
            ],
        },
        {
            "key": "sector_performance",
            "title": "板块表现",
            "content": [
                f"行业强势方向集中在{_names(top_industries)}；弱势方向主要是{_names(weak_boards)}。"
            ],
        },
        {
            "key": "theme_performance",
            "title": "主题题材表现",
            "content": [f"题材活跃方向集中在{_names(top_concepts)}，观察次日是否继续获得成交额配合。"],
        },
        {
            "key": "capital_flow",
            "title": "资金流向",
            "content": [
                "资金流向接口暂未接入，当前用板块涨跌幅、换手率、涨跌家数和领涨方向作为资金偏好的替代信号。"
            ],
        },
        {
            "key": "macro_liquidity",
            "title": "宏观、汇率与流动性",
            "content": [
                "宏观、汇率与流动性数据暂未接入，后续可扩展人民币汇率、国债收益率、公开市场操作和北向/ETF资金数据。"
            ],
        },
        {
            "key": "heavyweights",
            "title": "权重股与指数贡献",
            "content": [
                "权重股贡献接口暂未接入，当前通过上证、深成指、创业板指、沪深300等指数分化观察权重方向的影响。"
            ],
        },
        {
            "key": "technical",
            "title": "技术面分析",
            "content": [
                f"市场温度为{temperature}，风险等级为{risk_level}，规则模型给出的次日参考仓位为{position_range}。"
            ],
        },
        {
            "key": "announcements",
            "title": "重要公告、政策与异动个股",
            "content": [
                "公告、政策和异动个股数据暂未接入，当前版本不做个股公告解读，避免把未经核验的信息写入交易计划。"
            ],
        },
        {
            "key": "trading_plan",
            "title": "明日交易计划与风险提示",
            "content": [
                "若主要指数放量站上当日高点，可逐步提高到建议仓位上沿。",
                "若涨跌家数重新转弱且跌停数扩大，仓位降至建议区间下沿。",
                "若强势板块高开低走，优先等待回踩确认，不做情绪化追涨。",
                "仅供研究复盘，不构成任何证券投资建议或收益承诺。",
            ],
        },
    ]


def build_report(snapshot: MarketSnapshot) -> dict:
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    index_changes = [item["change_pct"] for item in snapshot.indexes]
    avg_index_change = _average(index_changes)
    rising = int(snapshot.breadth.get("rising", 0))
    falling = int(snapshot.breadth.get("falling", 0))
    total_movers = max(rising + falling + int(snapshot.breadth.get("flat", 0)), 1)
    breadth_ratio = round(rising / total_movers, 2)
    all_boards = snapshot.industry_boards + snapshot.concept_boards
    strong_boards = [board for board in all_boards if board["change_pct"] >= 1]

    temperature = _market_temperature(avg_index_change, breadth_ratio, len(strong_boards))
    risk_level = _risk_level(
        avg_index_change,
        falling,
        rising,
        int(snapshot.breadth.get("limit_down", 0)),
    )
    position_range = _position_range(risk_level, temperature)

    top_industries = snapshot.industry_boards[:8]
    top_concepts = snapshot.concept_boards[:8]
    weak_boards = sorted(all_boards, key=lambda item: item["change_pct"])[:8]
    focus_names = [board["name"] for board in (top_industries[:3] + top_concepts[:3]) if board["name"]]
    avoid_names = [board["name"] for board in weak_boards[:5] if board["name"]]

    if temperature in {"偏热", "回暖"} and risk_level == "低":
        stance = "指数与赚钱效应同步改善，次日可围绕强势板块做低吸或分歧后的再确认。"
    elif risk_level == "高":
        stance = "市场风险释放不足，次日以防守和等待为主，避免在弱势反抽中追高。"
    elif avg_index_change < 0:
        stance = "指数承压但未形成极端风险，次日观察量能修复和强势板块持续性。"
    else:
        stance = "市场整体偏均衡，次日以结构性机会为主，仓位跟随板块强度动态调整。"

    return {
        "date": now.date().isoformat(),
        "generated_at": now.isoformat(),
        "source": snapshot.source,
        "summary": {
            "title": f"{now.date().isoformat()} A股盘后复盘",
            "temperature": temperature,
            "risk_level": risk_level,
            "avg_index_change": avg_index_change,
            "breadth_ratio": breadth_ratio,
            "stance": stance,
        },
        "indexes": snapshot.indexes,
        "breadth": snapshot.breadth,
        "boards": {
            "industries": top_industries,
            "concepts": top_concepts,
            "weak": weak_boards,
        },
        "strategy": {
            "position_range": position_range,
            "focus": focus_names or ["等待强势方向形成"],
            "avoid": avoid_names or ["连续缩量且缺少资金承接的方向"],
            "triggers": [
                "若主要指数放量站上当日高点，可逐步提高到建议仓位上沿。",
                "若涨跌家数重新转弱且跌停数扩大，仓位降至建议区间下沿。",
                "若强势板块高开低走，优先等待回踩确认，不做情绪化追涨。",
            ],
            "notes": [
                "所有建议均为规则化复盘结果，只用于研究和交易计划参考。",
                "个股操作需结合自身风险承受能力、持仓成本和流动性。",
            ],
        },
        "sections": _build_sections(
            snapshot,
            top_industries,
            top_concepts,
            weak_boards,
            stance,
            temperature,
            risk_level,
            position_range,
        ),
        "disclaimer": "仅供研究复盘，不构成任何证券投资建议或收益承诺。",
    }
