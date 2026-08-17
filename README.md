# WebSSH

浏览器里用的轻量 SSH / SFTP 工具：装在服务端即可通过页面连远程、管文件、跑终端。可独立运行，也可作为 Spring Boot Starter / iframe 嵌进现有项目。

入口：开启后打开 [http://localhost:9092/webssh/page/index.html](http://localhost:9092/webssh/page/index.html)

开发运行：

```bash
mvn spring-boot:run
```

默认端口 **9092**。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Java、Spring Boot、WebSocket、JSch |
| 前端 | HTML / jQuery / Bootstrap、xterm.js |
| 数据 | 本地 JSON（`data/sessions.json`、`data/commands.json`） |

---

## 功能总览

### 基础能力

- 浏览器内 **SSH 终端**（xterm，体验接近标准 Shell）
- 同页 **SFTP 文件浏览**、上传 / 下载
- Vim、Top、实时看日志等全屏类命令可用
- **编码切换**（UTF-8 / GBK 等），中文输入按连接编码写出，默认 UTF-8
- **多会话 / 多 Tab**：列表 + 多个远程工作区并行
- 终端侧 **快捷键面板**（来自通用 + 本机命令，可搜索、过滤）

### 近期增强（2026-08）

| 能力 | 说明 |
|------|------|
| 会话列表首页 | 首页固定「会话列表」Tab；添加 / 修改 / 删除会话 |
| 远程 Tab | 点「远程」打开工作区；Tab 右键「复制会话」= 同配置再开一页（不新建库记录） |
| 分栏拖拽 | SFTP \| 终端分隔条可拖，拖拽时禁用 iframe 抢鼠，更顺滑 |
| 文件模块开关 | 操作栏「文件」显示/隐藏左侧 SFTP；默认隐藏，终端占满 |
| 文件查看方式 | 文件区「预览窗格」：详细信息 / 大图标（图片缩略图） |
| 通用 / 本机命令 | 弹窗 CRUD；首次启动从 `dict.json` 导入通用命令 |
| 快捷键搜索过滤 | 全部 / 通用 / 本机 + 关键字 |
| IDEA 风格命令提示 | 输入时浮层提示；匹配字高亮；本机项带头像图标 |
| 提示交互 | 仅 **↑↓ 选中后** Tab/回车才作用于提示，避免抢 shell 补全 |
| 回车自动收集 | 按会话开关、上限（≤1000）、收集行数（1–50）写入本机命令 |

---

## 快速上手

1. `mvn spring-boot:run`
2. 浏览器打开首页
3. **添加会话** → 填 IP / 端口 / 用户名 / 密码 → 保存
4. 行内点 **远程** → 左侧文件、右侧终端
5. 需要复用连接：远程 Tab 上右键 → **复制会话**

```mermaid
flowchart LR
  A[会话列表] -->|远程| B[工作区 Tab]
  B --> C[SFTP]
  B --> D[SSH 终端]
  A -->|通用命令| E[全局命令库]
  A -->|常用命令| F[本机会话命令]
  D -->|提示 / 回车收集| F
  D -->|快捷键面板| E
  D -->|快捷键面板| F
```

---

## 界面与功能说明

> 下文截图均在示例会话 **demo-4080**、路径 **`/run/udev`** 下拍摄；会话名 / IP / 主机名已脱敏，命令列表为演示数据。

### 1. 会话列表（首页）

首页第一个 Tab 固定为 **会话列表**：集中管理连接配置。

![会话列表](img/feature-session-list.png)

| 操作 | 作用 |
|------|------|
| 添加会话 | 新建连接（名称、IP、端口、账号密码） |
| 通用命令 | 维护所有会话共用的命令库 |
| 修改 / 删除 | 编辑或移除会话 |
| 常用命令 | 打开该会话的本机命令 + **自动收集设置** |
| 远程 | 打开 SFTP + SSH 工作区 Tab |

添加会话表单：

![添加会话](img/feature-add-session.png)

> 会话密码明文写在 `data/sessions.json`，勿公网裸奔。

---

### 2. 通用命令 / 本机常用命令

**通用命令**：全会话共享，首次启动会从 `static/webssh/data/dict.json` 导入。

![通用命令](img/feature-global-commands.png)

**本机常用命令**：按会话隔离；弹窗顶部可配置自动收集（仅本机弹窗显示）。

![本机常用命令与自动收集](img/feature-session-commands.png)

| 设置项 | 默认 | 范围 | 含义 |
|--------|------|------|------|
| 自动收集 | 开 | 开/关 | 终端回车后是否写入本机命令 |
| 收集上限 | 1000 | 1–1000 | 超出则从尾部删最旧 |
| 收集行数 | 1 | 1–50 | 一次收集最多取前 N 行 |

规则摘要：

- 只写入当前会话的 `bySession`，不进通用库
- 与已有 `value`（trim）相同 → 更新时间并置顶，不重复新增
- 多行粘贴按「收集行数」截断后一次收集

**安全提示：** 开启自动收集时，终端键入内容（含密码、token）可能写入 `data/commands.json`。输入密钥前请先关闭自动收集。

---

### 3. 远程工作区（SFTP + 终端）

经典布局：左侧文件树 / 操作，右侧 xterm；中间分隔条可拖。  
默认隐藏左侧文件区，终端操作栏点 **文件** 可显示/隐藏（按钮高亮表示文件区打开）。

![文件与命令行](img/image-20240803154706137.png)

上传 / 下载：

![上传下载](img/image-20240803154738778.png)

编码：终端工具栏可切换（如 UTF-8 / GBK），连接时会同步到后端，避免中文乱码。

---

### 4. 多 Tab 与「复制会话」

- 顶部：**会话列表** + 多个远程 Tab
- 列表点「远程」：尽量复用该会话最近一个远程 Tab；需要并行再开一份时用右键 **复制会话**
- 「复制会话」只再开连接，**不会**在会话库里新增一行

---

### 5. 终端命令提示（IDEA 风格）

输入时根据 **通用 + 本机** 命令弹出候选（示意）：

![命令提示示意](img/feature-cmd-suggest.png)

展示约定：

- **命令在上**（更醒目），中文名称在下
- **本机**命令左侧为用户小图标；通用命令无图标（占位对齐）
- 与当前输入匹配的片段高亮

| 按键 | 行为 |
|------|------|
| 输入 | 更新候选；未 ↑↓ 前不高亮选中项 |
| ↑ / ↓ | 选中并滚动保证可见；此后 Tab/回车才作用于提示 |
| Tab | 已选中 → 补全到终端（不回车）；未选中 → 交给 shell |
| 回车 | 已选中 → 补全并执行；未选中 → 正常回车 +（可选）自动收集 |
| Esc | 关闭提示 |
| 鼠标点选 | 直接补全该项 |

提示层靠近光标；靠近屏幕底部时会翻到光标上方。

---

### 6. 快捷键面板

终端侧快捷键列表对接命令 API，支持搜索与「全部 / 通用 / 本机」过滤，一点即可下发命令。

![快捷键](img/image-20240803154929156.png)

---

## 数据文件

| 文件 | 内容 |
|------|------|
| `data/sessions.json` | 会话列表（含密码） |
| `data/commands.json` | `global`、`bySession`、`sessionSettings` |
| `static/webssh/data/dict.json` | 通用命令种子（首次导入） |

`commands.json` 结构示意：

```json
{
  "global": [{ "id": "...", "name": "...", "value": "...", "updatedAt": "..." }],
  "bySession": {
    "<sessionId>": [{ "id": "...", "name": "...", "value": "...", "updatedAt": "..." }]
  },
  "sessionSettings": {
    "<sessionId>": {
      "autoCollect": true,
      "collectLimit": 1000,
      "collectLines": 1
    }
  }
}
```

---

## 主要 API（摘要）

| 方法 | 路径 | 说明 |
|------|------|------|
| CRUD | `/webssh/api/sessions` | 会话增删改查 |
| CRUD | `/webssh/api/commands/...` | 通用 / 本机命令 |
| GET | `/webssh/api/commands/for-session/{id}` | 终端提示用：`{ global, session }` |
| GET/PUT | `/webssh/api/commands/settings?sessionId=` | 自动收集设置 |
| POST | `/webssh/api/commands/collect` | 回车收集（尊重开关与行数） |

WebSocket：终端输入输出；`operate: encoded` 切换远端编码。

---

## 集成方式

- **独立运行**：本仓库 `mvn spring-boot:run` 或发行包脚本
- **Spring Boot Starter**：引入依赖后挂载静态页与 WebSocket
- **iframe**：将 `/webssh/page/index.html`（或终端页）嵌到业务系统

---

## 发行版

| 包 | 说明 |
|----|------|
| `webssh.zip` | 需本机已装 JDK |
| `webssh_win64.zip` | 内置 Windows JDK，解压后 `run.bat` |
| `webssh_mac64.zip` | 内置 macOS JDK，解压后按说明启动 |

脚本：Linux `client.sh`，Windows `run.bat`，macOS `client-mac.sh`。

---

## 安全注意

1. 会话密码明文存 JSON，仅建议内网 / 本机使用  
2. 自动收集可能记下敏感输入 → 输密码前关「自动收集」  
3. 勿将 `data/` 提交到公开仓库或暴露到公网  

---

## 后续方向

- Go 版本
- 前端改造为 Vue3 + Vite

---

## 许可

见 [LICENSE](LICENSE)。
