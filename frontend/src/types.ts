export type IndexItem = {
  code: string;
  name: string;
  price: number;
  change_pct: number;
  amount: number;
  volume: number;
};

export type BoardItem = {
  name: string;
  change_pct: number;
  turnover_rate: number;
  rising_count: number;
  falling_count: number;
  leader: string;
};

export type Report = {
  date: string;
  generated_at: string;
  source: string;
  summary: {
    title: string;
    temperature: string;
    risk_level: string;
    avg_index_change: number;
    breadth_ratio: number;
    stance: string;
  };
  indexes: IndexItem[];
  breadth: {
    rising?: number;
    falling?: number;
    flat?: number;
    limit_up?: number;
    limit_down?: number;
  };
  boards: {
    industries: BoardItem[];
    concepts: BoardItem[];
    weak: BoardItem[];
  };
  strategy: {
    position_range: string;
    focus: string[];
    avoid: string[];
    triggers: string[];
    notes: string[];
  };
  sections?: ReportSection[];
  external_views?: ExternalView[];
  disclaimer: string;
};

export type ReportSection = {
  key: string;
  title: string;
  content: string[];
};

export type ExternalView = {
  source: string;
  author?: string;
  url: string;
  stance: string;
  summary: string;
  tags: string[];
};
