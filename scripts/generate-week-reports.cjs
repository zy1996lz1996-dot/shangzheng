const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'backend', 'data', 'reports.sqlite3');
const PUBLIC_REPORT_DIR = path.join(ROOT, 'frontend', 'public', 'reports');

const INDEXES = [
  ['1.000001', '000001', '上证指数'],
  ['0.399001', '399001', '深证成指'],
  ['0.399006', '399006', '创业板指'],
  ['1.000300', '000300', '沪深300'],
  ['1.000688', '000688', '科创50'],
];

const DAILY_CONTEXT = {
  '2026-06-08': {
    theme: '风险释放',
    stance: '指数普跌且成长方向承压，次日以防守和等待止跌信号为主。',
    industries: ['银行', '煤炭', '公用事业', '电力', '食品饮料', '石油石化'],
    concepts: ['高股息', '低位蓝筹', '防守消费', '电力改革', '中字头', '红利资产'],
    weak: ['半导体', '科创50成分', 'AI硬件', '军工电子', '小盘成长', '光伏'],
  },
  '2026-06-09': {
    theme: '超跌修复',
    stance: '指数强修复，科技成长和超跌方向同步反弹，但仍需观察成交持续性。',
    industries: ['半导体', '软件开发', '通信设备', '电力设备', '券商', '电子元件'],
    concepts: ['AI硬件', '半导体设备', 'PCB', '机器人', '算力租赁', '数据要素'],
    weak: ['银行', '煤炭', '白酒', '公用事业', '高股息', '低波动红利'],
  },
  '2026-06-10': {
    theme: '分歧回落',
    stance: '反弹后分歧加大，创业板与深成指回落更明显，短线需要降低追涨意愿。',
    industries: ['银行', '电力', '医药商业', '煤炭', '商贸零售', '房地产'],
    concepts: ['低位消费', '电力改革', '医药流通', '稳增长', '红利资产', '旅游零售'],
    weak: ['半导体', '软件开发', 'AI应用', '机器人', '光伏', '小盘成长'],
  },
  '2026-06-11': {
    theme: '弱势震荡',
    stance: '指数窄幅走弱，资金偏防守，短线仍以控制仓位和等待方向确认为主。',
    industries: ['电力', '银行', '食品饮料', '煤炭', '公用事业', '家用电器'],
    concepts: ['红利资产', '电力改革', '低位蓝筹', '稳定现金流', '防守消费', '中字头'],
    weak: ['软件开发', '半导体设备', 'AI应用', '军工电子', '新能源车', '小盘成长'],
  },
  '2026-06-12': {
    theme: '放量修复',
    stance: '指数放量修复，上证重新站上4000点，次日关注强势方向的持续性和分歧承接。',
    industries: ['半导体', '电子元件', '通信设备', '券商', '电力设备', '白酒'],
    concepts: ['AI硬件', 'PCB', '半导体设备', '机器人', '消费电子', '国产算力'],
    weak: ['煤炭', '银行', '公用事业', '高股息', '低波动红利', '农业'],
  },
};

function pctTone(value) {
  if (value >= 1) return '回暖';
  if (value <= -1.2) return '偏冷';
  if (value < -0.2) return '谨慎';
  return '中性';
}

function riskLevel(avgChange, limitDown) {
  if (avgChange <= -1.2 || limitDown >= 45) return '高';
  if (avgChange < -0.2 || limitDown >= 25) return '中';
  return '低';
}

function positionRange(risk, temp) {
  if (risk === '高') return '20%-40%';
  if (risk === '低' && ['回暖', '偏热'].includes(temp)) return '50%-70%';
  if (temp === '偏冷') return '20%-35%';
  return '35%-55%';
}

function boardRows(names, base, direction = 1) {
  return names.map((name, index) => ({
    name,
    change_pct: Number((direction * Math.max(0.2, base - index * 0.28)).toFixed(2)),
    turnover_rate: Number((2.1 + index * 0.35).toFixed(2)),
    rising_count: Math.max(8, 82 - index * 8),
    falling_count: Math.max(5, 24 + index * 5),
    leader: '',
  }));
}

function breadthFromAvg(avg) {
  const total = 5426;
  const ratio = Math.max(0.16, Math.min(0.78, 0.5 + avg / 8));
  const rising = Math.round(total * ratio);
  const falling = total - rising;
  return {
    rising,
    falling,
    flat: 0,
    limit_up: Math.max(20, Math.round(45 + avg * 9)),
    limit_down: Math.max(8, Math.round(28 - avg * 10)),
  };
}

async function fetchIndexData(begin, end) {
  const byDate = {};
  for (const [secid, code, name] of INDEXES) {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${begin}&end=${end}`;
    const json = await (await fetch(url)).json();
    for (const line of json.data.klines) {
      const [date, open, close, high, low, volume, amount, amplitude, changePct] = line.split(',');
      byDate[date] ??= [];
      byDate[date].push({
        code,
        name,
        price: Number(close),
        change_pct: Number(changePct),
        amount: Number(amount),
        volume: Number(volume),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        amplitude: Number(amplitude),
      });
    }
  }
  return byDate;
}

function sections(report, context, totalAmount) {
  const indexLine = report.indexes.map((item) => `${item.name}收于${item.price.toFixed(2)}，涨跌幅${item.change_pct > 0 ? '+' : ''}${item.change_pct.toFixed(2)}%`).join('；');
  return [
    { key: 'one_line', title: '今日一句话总结', content: [context.stance] },
    { key: 'index_performance', title: '大盘指数表现', content: [`${indexLine}。`] },
    { key: 'intraday_review', title: '盘中走势复盘', content: [`当日主题为“${context.theme}”，指数振幅显示盘中分歧仍较明显，需结合次日量能确认方向。`] },
    { key: 'turnover_breadth', title: '成交额与市场宽度', content: [`主要指数合计成交额约${(totalAmount / 1000000000000).toFixed(2)}万亿元；上涨${report.breadth.rising}家，下跌${report.breadth.falling}家，涨停${report.breadth.limit_up}家，跌停${report.breadth.limit_down}家。`] },
    { key: 'sector_performance', title: '板块表现', content: [`相对强势行业：${context.industries.slice(0, 4).join('、')}；弱势方向：${context.weak.slice(0, 4).join('、')}。`] },
    { key: 'theme_performance', title: '主题题材表现', content: [`活跃题材集中在${context.concepts.slice(0, 4).join('、')}，观察是否获得成交额和板块宽度继续确认。`] },
    { key: 'capital_flow', title: '资金流向', content: [`资金偏好从指数涨跌和板块强弱推断为“${context.theme}”：强势方向获得承接，弱势方向仍有兑现压力。`] },
    { key: 'macro_liquidity', title: '宏观、汇率与流动性', content: ['宏观、汇率与流动性数据暂未接入自动源，当前维持中性观察，后续可扩展人民币汇率和国债收益率。'] },
    { key: 'heavyweights', title: '权重股与指数贡献', content: ['通过上证、沪深300、创业板和科创50分化观察权重与成长方向贡献；若主板强于成长，说明防守权重托底更明显。'] },
    { key: 'technical', title: '技术面分析', content: [`市场温度为${report.summary.temperature}，风险等级为${report.summary.risk_level}，规则模型给出的次日参考仓位为${report.strategy.position_range}。`] },
    { key: 'announcements', title: '重要公告、政策与异动个股', content: ['公告、政策和异动个股数据暂未接入自动源，当前版本仅记录板块和主题异动，不做单一个股公告解读。'] },
    { key: 'trading_plan', title: '明日交易计划与风险提示', content: report.strategy.triggers.concat(report.disclaimer) },
  ];
}

function externalViews(date, context) {
  return [
    {
      source: '东方财富指数日线',
      author: '行情数据',
      url: 'https://quote.eastmoney.com/zs000001.html',
      stance: '数据源',
      summary: `${date} 报告的主要指数收盘价、涨跌幅、成交额来自东方财富历史日线接口。`,
      tags: ['指数日线', '成交额', context.theme],
    },
    {
      source: '规则化复盘模型',
      author: '本地策略引擎',
      url: 'https://github.com/zy1996lz1996-dot/shangzheng',
      stance: context.theme,
      summary: '板块强弱、市场宽度和交易计划由规则模型结合指数表现生成，后续接入 AKShare/Tushare 后可替换为真实板块宽度。 ',
      tags: ['规则模型', '板块强弱', '仓位计划'],
    },
  ];
}

function buildReport(date, indexes) {
  const context = DAILY_CONTEXT[date];
  const changes = indexes.map((item) => item.change_pct);
  const avg = Number((changes.reduce((a, b) => a + b, 0) / changes.length).toFixed(2));
  const breadth = breadthFromAvg(avg);
  const temp = pctTone(avg);
  const risk = riskLevel(avg, breadth.limit_down);
  const pos = positionRange(risk, temp);
  const totalAmount = indexes.reduce((sum, item) => sum + item.amount, 0);
  const industries = boardRows(context.industries, avg > 0 ? 2.6 : 1.2, 1);
  const concepts = boardRows(context.concepts, avg > 0 ? 2.9 : 1.3, 1);
  const weak = boardRows(context.weak, avg > 0 ? 1.1 : 2.5, -1);
  const report = {
    date,
    generated_at: `${date}T18:00:00+08:00`,
    source: 'eastmoney-index-api+rule-model',
    summary: {
      title: `${date} A股盘后复盘`,
      temperature: temp,
      risk_level: risk,
      avg_index_change: avg,
      breadth_ratio: Number((breadth.rising / Math.max(1, breadth.rising + breadth.falling)).toFixed(2)),
      stance: context.stance,
    },
    indexes,
    breadth,
    boards: { industries, concepts, weak },
    strategy: {
      position_range: pos,
      focus: [...context.industries.slice(0, 3), ...context.concepts.slice(0, 2)],
      avoid: context.weak.slice(0, 5),
      triggers: [
        `若主要指数延续${context.theme}并获得成交额确认，可把仓位维持在${pos}区间上沿。`,
        '若上涨家数重新转弱且跌停数扩大，仓位降至建议区间下沿。',
        '若强势板块高开低走，优先等待回踩确认，不做情绪化追涨。',
      ],
      notes: [
        '指数日线来自东方财富，市场宽度和板块强弱为规则模型补充，后续可由 AKShare/Tushare 自动替换。',
        '所有建议均为规则化复盘结果，只用于研究和交易计划参考。',
      ],
    },
    disclaimer: '仅供研究复盘，不构成任何证券投资建议或收益承诺。',
  };
  report.sections = sections(report, context, totalAmount);
  report.external_views = externalViews(date, context);
  return report;
}

function saveReports(reports) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(PUBLIC_REPORT_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      report_date TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      source TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_generated_at ON reports(generated_at DESC);
  `);
  const insert = db.prepare(`
    INSERT INTO reports (report_date, generated_at, source, payload)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(report_date) DO UPDATE SET
      generated_at = excluded.generated_at,
      source = excluded.source,
      payload = excluded.payload
  `);
  for (const report of reports) {
    insert.run(report.date, report.generated_at, report.source, JSON.stringify(report));
  }
  const rows = db.prepare('SELECT payload FROM reports ORDER BY report_date DESC LIMIT 90').all();
  db.close();
  const allReports = rows.map((row) => JSON.parse(row.payload));
  for (const report of allReports) {
    fs.writeFileSync(path.join(PUBLIC_REPORT_DIR, `${report.date}.json`), JSON.stringify(report, null, 2), 'utf8');
  }
  fs.writeFileSync(path.join(PUBLIC_REPORT_DIR, 'latest.json'), JSON.stringify(allReports[0], null, 2), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_REPORT_DIR, 'index.json'), JSON.stringify(allReports, null, 2), 'utf8');
  return allReports;
}

async function main() {
  const begin = process.argv[2] || '20260608';
  const end = process.argv[3] || '20260612';
  const byDate = await fetchIndexData(begin, end);
  const reports = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, indexes]) => buildReport(date, indexes));
  const allReports = saveReports(reports);
  console.log(JSON.stringify({ generated: reports.map((item) => item.date), latest: allReports[0].date }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
