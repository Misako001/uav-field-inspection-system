# 大田无人机巡检监控系统

一个面向无人机大田巡检、烟田病虫害检测、视频流监控、告警展示和数据分析的监控系统。当前仓库同时包含：

- WPF 桌面监控大屏
- React Web 分析大屏
- FastAPI 推理与监控后端

## 技术栈

- 前端：C# WPF，MVVM，.NET 9
- Web 前端：React + Vite + TypeScript
- 后端：Python FastAPI
- 数据库：SQLite 开发默认，预留 MySQL 切换
- ORM：SQLAlchemy
- 通信：REST API + WebSocket

## 项目结构

```text
.
├── backend/                     # FastAPI 后端
│   ├── app/
│   │   ├── api/                 # REST API 路由
│   │   ├── models/              # SQLAlchemy 模型
│   │   ├── services/            # 监控数据服务
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── UAVInspectionDesktop/    # WPF 桌面端
│   └── uav-inspection-web/      # React Web 分析大屏
├── docs/                        # 项目文档
├── .gitignore
└── README.md
```

## 快速启动

### 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

后端默认地址：`http://127.0.0.1:8000`，接口文档：`http://127.0.0.1:8000/docs`。

真实模型接入时，可在 `backend/.env` 中配置：

```env
MODEL_BACKEND=ckpt
MODEL_TYPE=deeplabv3plus_resnet34
MODEL_PATH=C:/path/to/best.ckpt
MODEL_DEVICE=auto
MODEL_CLASS_INDEX_WEED=2
```

### 前端

```powershell
dotnet build frontend\UAVInspectionDesktop\UAVInspectionDesktop.csproj
dotnet run --project frontend\UAVInspectionDesktop\UAVInspectionDesktop.csproj
```

### Web 大屏

```powershell
cd frontend\uav-inspection-web
copy .env.example .env
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5173`

## 核心接口

- `GET /api/system/status`
- `GET /api/video/status`
- `GET /api/detection/statistics`
- `GET /api/alerts`
- `GET /api/config`
- `WS /ws/realtime`
- `POST /api/analysis/images`
- `POST /api/analysis/videos`
- `POST /api/analysis/streams`
- `GET /api/analysis/jobs`
- `GET /api/analysis/jobs/{job_id}`
- `GET /api/analysis/jobs/{job_id}/results`
- `POST /api/analysis/jobs/{job_id}/stop`
- `WS /ws/analysis/{job_id}`

更多说明见 `docs/` 目录。
