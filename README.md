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
│   │   ├── services/            # 推理与监控服务
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

## 环境要求

建议在 Windows 下使用 PowerShell 启动，至少准备好：

- Git
- Python 3.11 或更高版本
- Node.js 20 或更高版本
- .NET 9 SDK

## 别人克隆项目后怎么启动

下面这套步骤，适合第一次把项目从 GitHub 克隆到本地的人直接照着执行。

### 1. 克隆项目

```powershell
git clone https://github.com/Misako001/uav-field-inspection-system.git
cd uav-field-inspection-system
```

## 启动方式总览

这个项目分成 3 个部分：

1. `backend`：FastAPI 后端，必须先启动
2. `frontend/uav-inspection-web`：Web 分析大屏，可选但推荐
3. `frontend/UAVInspectionDesktop`：WPF 桌面端，可选

如果只是体验完整分析流程，推荐启动：

- 后端
- Web 大屏

如果还想看桌面监控大屏，再额外启动 WPF。

## 一、启动后端 FastAPI

### 第一次启动

在项目根目录打开一个 PowerShell 窗口，执行：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 后续再次启动

以后再次启动后端，只需要：

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 后端启动成功后可访问

- 接口文档：[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- 服务根地址：[http://127.0.0.1:8000](http://127.0.0.1:8000)

### 后端配置说明

默认会读取：

- `backend/.env`

如果你接入真实模型，重点看这些配置项：

```env
MODEL_BACKEND=ckpt
MODEL_TYPE=deeplabv3plus_resnet34
MODEL_PATH=C:/path/to/best.ckpt
MODEL_DEVICE=auto
MODEL_CLASS_INDEX_WEED=2
```

默认数据库是 SQLite：

```env
DATABASE_URL=sqlite:///./uav_inspection.db
```

如果以后切 MySQL，只需要修改 `DATABASE_URL`。

## 二、启动 Web 分析大屏

再打开第二个 PowerShell 窗口，在项目根目录执行：

### 第一次启动

```powershell
cd frontend\uav-inspection-web
Copy-Item .env.example .env
npm install
npm run dev
```

### 后续再次启动

```powershell
cd frontend\uav-inspection-web
npm run dev
```

### Web 前端地址

- Web 大屏：[http://127.0.0.1:5173](http://127.0.0.1:5173)

### Web 前端依赖说明

前端默认通过 `.env` 连接本地后端。如果是第一次启动，确保已经复制过：

```powershell
Copy-Item .env.example .env
```

## 三、启动 WPF 桌面端

如果要体验桌面监控大屏，再打开第三个 PowerShell 窗口，在项目根目录执行：

### 构建

```powershell
dotnet build frontend\UAVInspectionDesktop\UAVInspectionDesktop.csproj
```

### 运行

```powershell
dotnet run --project frontend\UAVInspectionDesktop\UAVInspectionDesktop.csproj
```

## 推荐启动顺序

推荐按这个顺序启动：

1. 启动后端 FastAPI
2. 启动 Web 大屏
3. 需要时再启动 WPF 桌面端

## 最常用的完整启动命令

如果你要发给别人，下面这几组命令最实用。

### 命令 1：克隆项目

```powershell
git clone https://github.com/Misako001/uav-field-inspection-system.git
cd uav-field-inspection-system
```

### 命令 2：启动后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 命令 3：启动 Web 大屏

```powershell
cd frontend\uav-inspection-web
Copy-Item .env.example .env
npm install
npm run dev
```

### 命令 4：启动桌面端

```powershell
dotnet run --project frontend\UAVInspectionDesktop\UAVInspectionDesktop.csproj
```

## 如何验证是否启动成功

### 后端成功

浏览器打开：

- [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

如果能看到 Swagger 接口文档，说明后端正常。

### Web 前端成功

浏览器打开：

- [http://127.0.0.1:5173](http://127.0.0.1:5173)

如果能看到“分析工作台 / 历史分析 / 首页总览”等页面，说明 Web 前端正常。

### WPF 桌面端成功

如果弹出桌面窗口“`大田无人机巡检监控系统`”，说明桌面端正常。

## 常见问题

### 1. PowerShell 不允许执行激活脚本

如果执行 `.\.venv\Scripts\Activate.ps1` 报权限错误，可先运行：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

然后重新激活虚拟环境。

### 2. `npm run dev` 启动失败

先确认 Node.js 版本足够新，然后重新安装依赖：

```powershell
cd frontend\uav-inspection-web
npm install
```

### 3. Web 页面打不开或没有数据

先确认后端是否已经启动，并能访问：

- [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

这个项目的 Web 前端依赖本地后端接口和 WebSocket。

### 4. 真实模型加载失败

请检查 `backend/.env` 里的：

- `MODEL_PATH`
- `MODEL_BACKEND`
- `MODEL_DEVICE`

同时确认对应模型文件确实存在。

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

## 更多文档

更多说明见：

- `docs/系统设计说明.md`
- `docs/接口文档.md`
- `docs/数据库设计.md`
- `docs/开发运行说明.md`
