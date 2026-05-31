# A股每日盘后分析

一个可部署的 A股每日盘后分析与次日规则化策略网站。后端使用 FastAPI 抓取行情、生成报告并保存近 90 天历史；前端使用 React/Vite 展示最新报告、历史报告和板块强弱。

## 功能

- 每个交易日北京时间 17:00 自动生成报告
- AKShare 优先取数，配置 `TUSHARE_TOKEN` 后作为关键指数数据兜底
- SQLite 保存每日行情快照和报告，默认保留近 90 天
- 首页展示最新复盘，历史页展示近 90 天报告
- 后台接口支持手动重跑当日报告
- 全站展示风险提示：仅供研究，不构成投资建议

## 本地开发

后端需要 Python 3.10+。

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

前端：

```bash
cd frontend
npm install
npm run dev
```

默认前端会请求同源 `/api`，本地开发时 Vite 会代理到 `http://localhost:8000`。

## 环境变量

后端读取 `backend/.env`：

```bash
ADMIN_RUN_KEY=change-me
TUSHARE_TOKEN=
DATABASE_PATH=./data/reports.sqlite3
RETENTION_DAYS=90
```

手动生成报告：

```bash
curl -X POST "http://localhost:8000/api/admin/reports/run-today" ^
  -H "x-admin-key: change-me"
```

## 云服务器部署

可用 Docker Compose：

```bash
docker compose up -d --build
```

服务默认暴露：

- 前端：http://服务器IP:5173
- 后端：http://服务器IP:8000

Docker 版本的前端 Nginx 会把 `/api` 代理到后端容器。生产环境建议在服务器入口再加一层 Nginx/HTTPS，并把 `ADMIN_RUN_KEY` 改成强随机字符串。
