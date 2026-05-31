import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  Newspaper,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { fetchLatestReport, fetchReport, fetchReports } from './api';
import type { BoardItem, ExternalView, IndexItem, Report, ReportSection } from './types';
import './styles.css';

const SECTION_TITLES = [
  '今日一句话总结',
  '大盘指数表现',
  '盘中走势复盘',
  '成交额与市场宽度',
  '板块表现',
  '主题题材表现',
  '资金流向',
  '宏观、汇率与流动性',
  '权重股与指数贡献',
  '技术面分析',
  '重要公告、政策与异动个股',
  '明日交易计划与风险提示',
];

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toFixed(value > 100 ? 0 : 2);
}

function formatPct(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

function tone(value: number): string {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function fallbackSections(report: Report): ReportSection[] {
  const topIndustries = report.boards.industries.slice(0, 3).map((item) => item.name).join('、') || '暂无明显强势行业';
  const topConcepts = report.boards.concepts.slice(0, 3).map((item) => item.name).join('、') || '暂无明显强势题材';
  const weak = report.boards.weak.slice(0, 3).map((item) => item.name).join('、') || '暂无明显弱势方向';

  return [
    { key: 'one_line', title: '今日一句话总结', content: [report.summary.stance] },
    {
      key: 'index_performance',
      title: '大盘指数表现',
      content: report.indexes.map((item) => `${item.name}收于${formatNumber(item.price)}，涨跌幅${formatPct(item.change_pct)}。`),
    },
    { key: 'intraday_review', title: '盘中走势复盘', content: ['盘中走势数据暂未接入分时接口，先以收盘结果和市场宽度判断强弱。'] },
    {
      key: 'turnover_breadth',
      title: '成交额与市场宽度',
      content: [`上涨${report.breadth.rising ?? 0}家，下跌${report.breadth.falling ?? 0}家，涨停${report.breadth.limit_up ?? 0}家，跌停${report.breadth.limit_down ?? 0}家。`],
    },
    { key: 'sector_performance', title: '板块表现', content: [`相对强势行业：${topIndustries}。弱势方向：${weak}。`] },
    { key: 'theme_performance', title: '主题题材表现', content: [`相对活跃题材：${topConcepts}。`] },
    { key: 'capital_flow', title: '资金流向', content: ['资金流向接口暂未接入，先用板块涨跌、成交活跃度和涨跌家数作为替代观察。'] },
    { key: 'macro_liquidity', title: '宏观、汇率与流动性', content: ['宏观、汇率与流动性数据暂未接入，后续可扩展人民币汇率、国债收益率和公开市场投放数据。'] },
    { key: 'heavyweights', title: '权重股与指数贡献', content: ['权重股贡献数据暂未接入，当前通过主要指数表现观察权重方向对盘面的影响。'] },
    { key: 'technical', title: '技术面分析', content: [`市场温度为${report.summary.temperature}，风险等级为${report.summary.risk_level}，建议仓位${report.strategy.position_range}。`] },
    { key: 'announcements', title: '重要公告、政策与异动个股', content: ['公告、政策和异动个股数据暂未接入，当前报告不做个股公告解读。'] },
    { key: 'trading_plan', title: '明日交易计划与风险提示', content: [...report.strategy.triggers, report.disclaimer] },
  ];
}

function normalizedSections(report: Report): ReportSection[] {
  const existing = report.sections ?? [];
  const fallback = fallbackSections(report);
  return SECTION_TITLES.map((title) => existing.find((item) => item.title === title) ?? fallback.find((item) => item.title === title)!);
}

function StatCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string; helper: string }) {
  return (
    <section className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
    </section>
  );
}

function MetricStrip({ items }: { items: Array<{ label: string; value: string; helper?: string; valueTone?: string }> }) {
  return (
    <div className="metric-strip">
      {items.map((item) => (
        <div className="mini-metric" key={item.label}>
          <span>{item.label}</span>
          <strong className={item.valueTone ?? ''}>{item.value}</strong>
          {item.helper && <em>{item.helper}</em>}
        </div>
      ))}
    </div>
  );
}

function MiniBars({ items, compact = false }: { items: Array<{ name: string; value: number }>; compact?: boolean }) {
  const maxAbs = Math.max(...items.map((item) => Math.abs(item.value)), 1);
  return (
    <div className={compact ? 'mini-bars compact' : 'mini-bars'}>
      {items.map((item) => {
        const width = clampPercent((Math.abs(item.value) / maxAbs) * 100);
        return (
          <div className="mini-bar-row" key={`${item.name}-${item.value}`}>
            <span>{item.name}</span>
            <div className="bar-track">
              <i className={tone(item.value)} style={{ width: `${width}%` }} />
            </div>
            <em className={tone(item.value)}>{formatPct(item.value)}</em>
          </div>
        );
      })}
    </div>
  );
}

function MiniBreadth({ report }: { report: Report }) {
  const rising = report.breadth.rising ?? 0;
  const falling = report.breadth.falling ?? 0;
  const flat = report.breadth.flat ?? 0;
  const total = Math.max(rising + falling + flat, 1);
  const risePct = clampPercent((rising / total) * 100);
  const fallPct = clampPercent((falling / total) * 100);

  return (
    <div className="section-chart">
      <div className="stacked-bar small">
        <i className="rise" style={{ width: `${risePct}%` }} />
        <i className="fall" style={{ width: `${fallPct}%` }} />
      </div>
      <div className="breadth-legend">
        <span>上涨 {rising}</span>
        <span>下跌 {falling}</span>
        <span>平盘 {flat}</span>
      </div>
    </div>
  );
}

function MiniGauge({ label, value, score }: { label: string; value: string; score: number }) {
  return (
    <div className="mini-gauge" style={{ background: `conic-gradient(#c44536 ${score * 3.6}deg, #e6edf2 0deg)` }}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function SectionVisual({ index, report }: { index: number; report: Report }) {
  const totalAmount = report.indexes.reduce((sum, item) => sum + (item.amount || 0), 0);
  const riskScore = report.summary.risk_level === '高' ? 82 : report.summary.risk_level === '中' ? 58 : 28;
  const positiveIndustries = report.boards.industries.filter((item) => item.change_pct > 0).length;
  const weakCount = report.boards.weak.length;

  if (index === 0) {
    return (
      <div className="section-data two-col">
        <MetricStrip items={[
          { label: '市场温度', value: report.summary.temperature },
          { label: '风险等级', value: report.summary.risk_level },
          { label: '建议仓位', value: report.strategy.position_range },
        ]} />
        <MiniGauge label="风险" value={report.summary.risk_level} score={riskScore} />
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="section-data">
        <MiniBars items={report.indexes.map((item) => ({ name: item.name, value: item.change_pct }))} />
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="section-data">
        <div className="timeline-strip">
          <span>开盘分歧</span>
          <i />
          <span>午后走弱</span>
          <i />
          <span>尾盘谨慎</span>
        </div>
        <MetricStrip items={[
          { label: '收盘均跌', value: formatPct(report.summary.avg_index_change), valueTone: tone(report.summary.avg_index_change) },
          { label: '宽度', value: `${Math.round(report.summary.breadth_ratio * 100)}%` },
        ]} />
      </div>
    );
  }

  if (index === 3) {
    return (
      <div className="section-data">
        <MetricStrip items={[
          { label: '成交额', value: totalAmount ? `${(totalAmount / 1000000000000).toFixed(2)}万亿` : '待接入' },
          { label: '涨停', value: String(report.breadth.limit_up ?? 0) },
          { label: '跌停', value: String(report.breadth.limit_down ?? 0) },
        ]} />
        <MiniBreadth report={report} />
      </div>
    );
  }

  if (index === 4) {
    return (
      <div className="section-data">
        <MiniBars items={report.boards.industries.slice(0, 5).map((item) => ({ name: item.name, value: item.change_pct }))} compact />
      </div>
    );
  }

  if (index === 5) {
    return (
      <div className="section-data">
        <MiniBars items={report.boards.concepts.slice(0, 5).map((item) => ({ name: item.name, value: item.change_pct }))} compact />
      </div>
    );
  }

  if (index === 6) {
    return (
      <div className="section-data">
        <MetricStrip items={[
          { label: '强势行业', value: `${positiveIndustries}个` },
          { label: '弱势方向', value: `${weakCount}个` },
          { label: '观点源', value: `${report.external_views?.length ?? 0}条` },
        ]} />
        <MiniBars items={[
          { name: '防守承接', value: positiveIndustries },
          { name: '成长兑现', value: -weakCount },
        ]} compact />
      </div>
    );
  }

  if (index === 7) {
    return (
      <div className="section-data">
        <MetricStrip items={[
          { label: '人民币汇率', value: '待接入' },
          { label: '国债利率', value: '待接入' },
          { label: '流动性', value: '中性观察' },
        ]} />
      </div>
    );
  }

  if (index === 8) {
    return (
      <div className="section-data">
        <MiniBars items={report.indexes.slice(0, 5).map((item) => ({ name: item.name, value: item.change_pct }))} compact />
      </div>
    );
  }

  if (index === 9) {
    return (
      <div className="section-data two-col">
        <MetricStrip items={[
          { label: '均值涨跌', value: formatPct(report.summary.avg_index_change), valueTone: tone(report.summary.avg_index_change) },
          { label: '市场宽度', value: `${Math.round(report.summary.breadth_ratio * 100)}%` },
          { label: '仓位区间', value: report.strategy.position_range },
        ]} />
        <MiniGauge label="技术风险" value={report.summary.risk_level} score={riskScore} />
      </div>
    );
  }

  if (index === 10) {
    return (
      <div className="section-data">
        <MetricStrip items={[
          { label: '外部观点', value: `${report.external_views?.length ?? 0}条` },
          { label: '异动方向', value: `${report.strategy.focus.length + report.strategy.avoid.length}个` },
        ]} />
        <div className="tag-row section-tags">
          {[...report.strategy.focus.slice(0, 3), ...report.strategy.avoid.slice(0, 3)].map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
    );
  }

  return (
    <div className="section-data two-col">
      <MetricStrip items={[
        { label: '低仓位', value: report.strategy.position_range.split('-')[0] ?? '20%' },
        { label: '高仓位', value: report.strategy.position_range.split('-')[1] ?? '40%' },
        { label: '触发条件', value: `${report.strategy.triggers.length}条` },
      ]} />
      <MiniGauge label="计划风险" value={report.summary.risk_level} score={riskScore} />
    </div>
  );
}

function IndexGrid({ indexes }: { indexes: IndexItem[] }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <BarChart3 size={18} />
        <h2>主要指数</h2>
      </div>
      <div className="index-grid">
        {indexes.map((item) => (
          <article className="index-card" key={item.code}>
            <div>
              <strong>{item.name}</strong>
              <span>{item.code}</span>
            </div>
            <p>{formatNumber(item.price)}</p>
            <em className={tone(item.change_pct)}>{formatPct(item.change_pct)}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function HorizontalBarChart({ title, items }: { title: string; items: Array<{ name: string; value: number }> }) {
  return (
    <section className="chart-box">
      <h3>{title}</h3>
      <MiniBars items={items} />
    </section>
  );
}

function BreadthChart({ report }: { report: Report }) {
  return (
    <section className="chart-box breadth-chart">
      <h3>市场宽度</h3>
      <MiniBreadth report={report} />
    </section>
  );
}

function RiskGauge({ report }: { report: Report }) {
  const riskScore = report.summary.risk_level === '高' ? 82 : report.summary.risk_level === '中' ? 58 : 28;
  return (
    <section className="chart-box risk-gauge">
      <h3>风险仪表</h3>
      <div className="gauge-ring" style={{ background: `conic-gradient(#c44536 ${riskScore * 3.6}deg, #e6edf2 0deg)` }}>
        <div>
          <strong>{report.summary.risk_level}</strong>
          <span>{report.strategy.position_range}</span>
        </div>
      </div>
    </section>
  );
}

function ChartDashboard({ report }: { report: Report }) {
  return (
    <section className="panel chart-panel">
      <div className="panel-title">
        <Activity size={18} />
        <h2>数据图表</h2>
      </div>
      <div className="chart-grid">
        <HorizontalBarChart title="指数涨跌幅" items={report.indexes.map((item) => ({ name: item.name, value: item.change_pct }))} />
        <HorizontalBarChart title="行业强弱" items={report.boards.industries.slice(0, 6).map((item) => ({ name: item.name, value: item.change_pct }))} />
        <BreadthChart report={report} />
        <RiskGauge report={report} />
      </div>
    </section>
  );
}

function ExternalViews({ views = [] }: { views?: ExternalView[] }) {
  if (views.length === 0) {
    return null;
  }

  return (
    <section className="panel external-views">
      <div className="panel-title">
        <Newspaper size={18} />
        <h2>外部观点池</h2>
      </div>
      <p className="source-note">仅展示短摘要和出处链接，不转载原文；观点用于交叉验证，不作为买卖依据。</p>
      <div className="view-grid">
        {views.map((view) => (
          <article className="view-card" key={`${view.source}-${view.url}`}>
            <div className="view-head">
              <strong>{view.source}</strong>
              <span>{view.stance}</span>
            </div>
            {view.author && <p className="view-author">{view.author}</p>}
            <p>{view.summary}</p>
            <div className="tag-row">
              {view.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
            <a href={view.url} target="_blank" rel="noreferrer">
              查看来源
              <ExternalLink size={14} />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

function BoardTable({ title, boards, icon }: { title: string; boards: BoardItem[]; icon: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {boards.length === 0 ? (
        <p className="empty-inline">暂无板块数据</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>板块</th>
                <th>涨跌幅</th>
                <th>换手率</th>
                <th>涨/跌家数</th>
                <th>领涨</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((board) => (
                <tr key={`${title}-${board.name}`}>
                  <td>{board.name}</td>
                  <td className={tone(board.change_pct)}>{formatPct(board.change_pct)}</td>
                  <td>{formatPct(board.turnover_rate)}</td>
                  <td>{board.rising_count}/{board.falling_count}</td>
                  <td>{board.leader || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StrategyPanel({ report }: { report: Report }) {
  return (
    <section className="panel strategy-panel">
      <div className="panel-title">
        <Gauge size={18} />
        <h2>次日规则化策略</h2>
      </div>
      <div className="strategy-head">
        <div>
          <span>建议仓位</span>
          <strong>{report.strategy.position_range}</strong>
        </div>
        <div>
          <span>风险等级</span>
          <strong>{report.summary.risk_level}</strong>
        </div>
        <div>
          <span>市场温度</span>
          <strong>{report.summary.temperature}</strong>
        </div>
      </div>
      <p className="stance">{report.summary.stance}</p>
      <div className="strategy-lists">
        <div>
          <h3>关注方向</h3>
          {report.strategy.focus.map((item) => <span key={item}>{item}</span>)}
        </div>
        <div>
          <h3>回避方向</h3>
          {report.strategy.avoid.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
      <ul className="trigger-list">
        {report.strategy.triggers.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function ReportSections({ report }: { report: Report }) {
  return (
    <section className="panel report-sections">
      <div className="panel-title">
        <FileText size={18} />
        <h2>盘后报告正文</h2>
      </div>
      <div className="section-grid">
        {normalizedSections(report).map((section, index) => (
          <article className={index === 0 ? 'report-section lead-section' : 'report-section'} key={section.title}>
            <div className="section-number">{String(index + 1).padStart(2, '0')}</div>
            <div>
              <h3>{section.title}</h3>
              {section.content.map((item) => <p key={item}>{item}</p>)}
              <SectionVisual index={index} report={report} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HistoryRail({ reports, selectedDate, onSelect }: { reports: Report[]; selectedDate: string; onSelect: (date: string) => void }) {
  return (
    <aside className="history">
      <div className="panel-title">
        <CalendarDays size={18} />
        <h2>近90天</h2>
      </div>
      <div className="history-list">
        {reports.map((report) => (
          <button
            className={report.date === selectedDate ? 'active' : ''}
            key={report.date}
            onClick={() => onSelect(report.date)}
            type="button"
            title={`查看 ${report.date}`}
          >
            <span>{report.date}</span>
            <em>{report.summary.temperature}</em>
          </button>
        ))}
      </div>
    </aside>
  );
}

function Dashboard({ report, reports, onSelect, onRefresh, loading }: { report: Report; reports: Report[]; onSelect: (date: string) => void; onRefresh: () => void; loading: boolean }) {
  const breadth = report.breadth;
  const breadthText = `${breadth.rising ?? 0} 涨 / ${breadth.falling ?? 0} 跌`;

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">A股每日盘后分析</p>
          <h1>{report.summary.title}</h1>
          <span>数据源：{report.source} · 生成时间：{new Date(report.generated_at).toLocaleString('zh-CN')}</span>
        </div>
        <button className="icon-button" type="button" onClick={onRefresh} title="刷新报告" disabled={loading}>
          <RefreshCw size={18} />
        </button>
      </header>

      <section className="risk-banner">
        <ShieldAlert size={18} />
        <span>{report.disclaimer}</span>
      </section>

      <main className="layout">
        <div className="content">
          <section className="stats">
            <StatCard icon={<Activity size={20} />} label="市场温度" value={report.summary.temperature} helper={`平均指数涨跌 ${formatPct(report.summary.avg_index_change)}`} />
            <StatCard icon={<AlertTriangle size={20} />} label="风险等级" value={report.summary.risk_level} helper={`涨跌比 ${(report.summary.breadth_ratio * 100).toFixed(0)}%`} />
            <StatCard icon={<TrendingUp size={20} />} label="涨跌家数" value={breadthText} helper={`涨停 ${breadth.limit_up ?? 0} / 跌停 ${breadth.limit_down ?? 0}`} />
            <StatCard icon={<Database size={20} />} label="历史报告" value={`${reports.length} 天`} helper="仅保留最近90天" />
          </section>

          <ChartDashboard report={report} />
          <ExternalViews views={report.external_views} />
          <ReportSections report={report} />
          <IndexGrid indexes={report.indexes} />
          <StrategyPanel report={report} />

          <div className="boards-grid">
            <BoardTable title="行业强度" boards={report.boards.industries} icon={<TrendingUp size={18} />} />
            <BoardTable title="概念强度" boards={report.boards.concepts} icon={<Activity size={18} />} />
          </div>
          <BoardTable title="弱势方向" boards={report.boards.weak} icon={<TrendingDown size={18} />} />
        </div>
        <HistoryRail reports={reports} selectedDate={report.date} onSelect={onSelect} />
      </main>
    </>
  );
}

function App() {
  const [report, setReport] = useState<Report | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [latest, history] = await Promise.all([fetchLatestReport(), fetchReports()]);
      setReport(latest);
      setReports(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectReport = async (date: string) => {
    setLoading(true);
    setError('');
    try {
      setReport(await fetchReport(date));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const shellClass = useMemo(() => (loading ? 'app-shell loading' : 'app-shell'), [loading]);

  return (
    <div className={shellClass}>
      {error && !report ? (
        <div className="empty-state">
          <AlertTriangle size={34} />
          <h1>今日报告暂未生成</h1>
          <p>{error}</p>
          <button type="button" onClick={load}>重新加载</button>
        </div>
      ) : report ? (
        <Dashboard report={report} reports={reports} onSelect={selectReport} onRefresh={load} loading={loading} />
      ) : (
        <div className="empty-state">
          <RefreshCw size={34} />
          <h1>正在加载盘后报告</h1>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
