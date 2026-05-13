# 大田无人机巡检监控系统

面向无人机大田巡检、烟田杂草/病虫害识别、视频流监控、告警展示和历史分析的 Web 监控系统。

当前主开发版本由两部分组成：

- React Web 分析工作台
- FastAPI 推理与监控后端

`frontend/UAVInspectionDesktop` 为早期桌面端目录，当前主流程不依赖它。

## 技术栈

- 前端：React + Vite + TypeScript
- 后端：Python + FastAPI
- 数据库：SQLite 开发默认，预留 MySQL 切换
- ORM：SQLAlchemy
- 通信：REST API + WebSocket
- 推理：PyTorch / OpenCV / segmentation-models-pytorch

## 项目结构

```text
.
├── backend/                     # FastAPI 后端
│   ├── app/
│   │   ├── api/                 # REST API 路由
│   │   ├── models/              # SQLAlchemy 模型
│   │   ├── services/            # 推理、分析和监控服务
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── uav-inspection-web/      # React Web 分析工作台
│   └── UAVInspectionDesktop/    # 早期桌面端目录，当前主流程不依赖
├── docs/                        # 项目文档
├── .gitignore
└── README.md
```

## 环境要求

建议在 Windows 下使用 PowerShell 启动，至少准备好：

- Git
- Python 3.11 或更高版本
- Node.js 20 或更高版本

## 快速启动

### 1. 克隆项目

```powershell
git clone https://github.com/Misako001/uav-field-inspection-system.git
cd uav-field-inspection-system
```

### 2. 启动后端 FastAPI

第一次启动：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

后续再次启动：

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

后端启动成功后可访问：

- 接口文档：[http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs)
- 服务根地址：[http://127.0.0.1:8001](http://127.0.0.1:8001)

### 3. 启动 React Web 前端

另开一个 PowerShell 窗口，在项目根目录执行。

第一次启动：

```powershell
cd frontend\uav-inspection-web
Copy-Item .env.example .env
npm install
npm run dev
```

后续再次启动：

```powershell
cd frontend\uav-inspection-web
npm run dev
```

Web 前端地址：

- [http://127.0.0.1:5173](http://127.0.0.1:5173)

## 前端环境变量

Web 前端通过 `frontend/uav-inspection-web/.env` 连接本地后端：

```env
VITE_API_BASE_URL=http://127.0.0.1:8001
VITE_WS_BASE_URL=ws://127.0.0.1:8001
```

如果你修改后端端口，需要同步修改这两个变量。

生产部署时，可以先用服务器公网 IP 完成第一版上线，域名审核和备案完成后再切换到域名与 HTTPS。示例见：

- `frontend/uav-inspection-web/.env.production.example`

## 后端配置

后端默认读取：

- `backend/.env`

默认数据库是 SQLite：

```env
DATABASE_URL=sqlite:///./uav_inspection.db
```

如果后续切换 MySQL，只需要修改 `DATABASE_URL`。

如果接入真实模型，重点检查这些配置项：

```env
MODEL_BACKEND=ckpt
MODEL_TYPE=deeplabv3plus_resnet34
MODEL_PATH=C:/path/to/best.ckpt
MODEL_DEVICE=auto
MODEL_CLASS_INDEX_CROP=2
MODEL_CLASS_INDEX_WEED=1
```

## 验证启动状态

### 后端

浏览器打开：

- [http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs)

如果能看到 Swagger 接口文档，说明后端 REST 接口正常。

### 前端

浏览器打开：

- [http://127.0.0.1:5173](http://127.0.0.1:5173)

如果页面顶部显示“后端在线”，说明前端已连上后端 WebSocket。

## 常见问题

### 1. PowerShell 不允许执行激活脚本

如果执行 `.\.venv\Scripts\Activate.ps1` 报权限错误，可先运行：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

然后重新激活虚拟环境。

### 2. Web 页面显示“离线回退”

先确认后端使用的是项目虚拟环境，而不是其他 Python 环境：

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

如果使用 Anaconda 或全局 Python 启动，可能缺少 `websockets` 依赖，导致 REST 接口能访问但 WebSocket 连接失败。

### 3. `npm run dev` 启动失败

先确认 Node.js 版本足够新，然后重新安装依赖：

```powershell
cd frontend\uav-inspection-web
npm install
```

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
- `docs/大陆服务器学生版上线清单.md`
