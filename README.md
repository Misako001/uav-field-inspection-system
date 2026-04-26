# 大田无人机巡检监控系统

一个面向无人机大田巡检、烟田病虫害检测、视频流监控、告警展示和数据分析的桌面监控大屏基础框架。

## 技术栈

- 前端：C# WPF，MVVM，.NET 9
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
│   └── UAVInspectionDesktop/    # WPF 桌面端
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

后端默认地址：`http://localhost:8000`，接口文档：`http://localhost:8000/docs`。

### 前端

```powershell
dotnet build frontend\UAVInspectionDesktop\UAVInspectionDesktop.csproj
dotnet run --project frontend\UAVInspectionDesktop\UAVInspectionDesktop.csproj
```

## 核心接口

- `GET /api/system/status`
- `GET /api/video/status`
- `GET /api/detection/statistics`
- `GET /api/alerts`
- `GET /api/config`
- `WS /ws/realtime`

更多说明见 `docs/` 目录。
