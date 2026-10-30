# 观己 · SELFSPACE

一个以每日记录为核心的个人数据中心：健康、三餐、任务、工作、自媒体、资产、手记与复盘。

Personal dashboard for health, tasks, meals, work, content planning and personal records.

项目原创部分采用 [MIT](LICENSE) 协议。第三方代码和 OCR 模型保留各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 直接使用：本地试用版

不准备开发代码？前往 [Releases](https://github.com/jinyangtang33-sys/Hygieia/releases) 选择 **Hygieia 本地版 ZIP**：Mac Intel 选 `darwin-x64`，Apple 芯片选 `darwin-arm64`，Windows 选 `win-x64`。完整解压后双击启动文件，浏览器自动打开，数据库自动创建，无需安装 Node.js 或登录 ChatGPT。不要把 GitHub 自动生成的 Source code 当作启动包。

本地版数据保存在自己的电脑，不会自动上传或跨设备同步。Apple 健康自动连接尚未适配本地版，先使用手动记录、体脂秤报告或 JSON 备份导入。Mac 包尚未公证签名；这是试用版，请先阅读 [本地版使用说明](docs/LOCAL_EDITION.md)。只有打包和测试全部成功后，Releases 才会出现对应版本；Actions 中也会保留测试通过的构建文件。

## 功能

- 健康记录、活动圆环与训练摘要、体脂秤报告导入和趋势。
- 浏览器本地 OCR 预填 23 项身体指标，保存前人工核对；不依赖付费 AI 接口。
- 三餐、心情、生活手记、日历及每周复盘。
- 跨日期任务清单：截止时间、优先级、分类、完成状态和提醒计划字段。
- 按日待办、历史未完成事项复制、25 分钟专注计时。
- X、小红书、抖音账号资料、选题来源、平台稿件和版本恢复。
- 资产账户、收支、转账和余额核对。
- 账号隔离的云同步、离线待同步队列、冲突处理、本机草稿及备份恢复。
- 可选 Mac + PulsHealth 中转，将 Apple 健康每日汇总送到自己的私人站点。

任务提醒目前只保存计划。微信、Bark 等通知渠道及自动投递尚未接入。没有微信小程序版本。

## 先了解运行边界

**云端版后端适配 ChatGPT Sites 的私人站点认证和 Cloudflare D1 运行环境；本地版使用独立回环服务、SQLite 和本机会话。** 源码公开不代表个人数据公开，也不意味着可以直接部署到任意公开服务器。

API 信任托管网关注入的用户身份请求头。生产环境必须由可信网关完成登录、移除访客伪造的身份头并限制后台端点访问。单独将 Worker 暴露到公网并不能获得等价认证；直接托管到其他平台前需要实现认证适配。详见 [部署说明](docs/DEPLOYMENT.md) 和 [安全说明](SECURITY.md)。

此仓库从生产项目的源码快照整理，使用全新提交历史；不包含原站点 ID、原作者的私人站点地址、健康记录、数据库、截图、备份、同步密钥或本机运行目录。测试中的数值、账号和内容为合成数据。历史示例清理代码不是作者真实记录。

## 本地开发

本地版开发只需 Node.js **22.13 或更新版本**，不需要安装 npm 依赖：

```sh
git clone https://github.com/jinyangtang33-sys/Hygieia.git
cd Hygieia
node scripts/build-local.mjs
node dist/local/server.mjs
```

以下为云端版框架开发流程，需要 Node.js 和 npm。Mac 健康中转另外需要 Python 3；钥匙串组件需要 macOS 和 Xcode Command Line Tools。

```sh
git clone https://github.com/jinyangtang33-sys/Hygieia.git
cd Hygieia
npm run install:ci
npm test
npm run audit:public
npm run dev
```

开发服务默认在 `http://127.0.0.1:5173`，使用明确的本地模拟身份，不是真实登录。不要将开发服务通过端口转发暴露到公网。

API 需要数据库表。第一次使用独立本机 Worker 时：

```sh
npm run build
npx wrangler d1 migrations apply site-creator-d1 --local --config dist/server/wrangler.json
npm start
```

若本机数据库命令提示没有迁移目录，请使用 [部署说明中的 SQL 初始化步骤](docs/DEPLOYMENT.md)。本地数据库由 Wrangler 保存在 `.wrangler/`，必须保持忽略。

`.openai/hosting.json` 中的 `project_id` 是公开占位符。正式部署时在自己的新项目中替换，并保持私人访问权限。不要填写原作者站点或复用其他人的服务密钥。

## 测试

`npm test` 显式运行不需要联网服务的模型、UI 状态和数据格式测试；不会启动服务器或接触真实健康记录。

```sh
npm test
python3 -m unittest discover -s mac-bridge -p 'test_*.py'
```

`*-api.test.mjs` 及部分备份、账本测试需要运行中的本机 Worker。它们使用合成账号，只能对本机测试服务执行。示例：

```sh
PERSONAL_TEST_BASE=http://127.0.0.1:8787 node checklist-api.test.mjs
```

部分早期集成脚本固定了本机端口；先阅读脚本中的端口和前置条件，勿指向生产站点。CI 运行离线测试、Python 接收器测试和公开内容审计。

## Apple 健康与报告识别

网站本身不能直接读取 Apple HealthKit。可选接入方式：

1. 在自己的私人站点生成健康同步配置。
2. 按 [Mac 中转说明](mac-bridge/使用说明.md) 设置 `SELFSPACE_SITE_URL` 并启动接收器。
3. 在 iPhone 的 PulsHealth 中授权并配对自己的接收端。
4. 原始样本留在本机 SQLite，仅支持的每日汇总和圆环摘要上传到自己的站点。

Mac 中转需要开机联网；iOS 后台投递不保证实时。每位部署者使用自己的连接、运行目录与密钥，不与原作者共享接收器。

报告 OCR 在浏览器本地运行，截图不会上传到识别服务。识别可能漏项或误识别，必须对照原图核对日期、数值和单位；记录不构成医疗建议。

## 目录

| 路径 | 内容 |
| --- | --- |
| `public/`、`ui/` | 网页界面、离线队列、报告识别和交互 |
| `app/api/` | 健康、个人记录、账本及备份接口 |
| `lib/` | 客户端与服务端共享验证、计算和存储逻辑 |
| `db/`、`drizzle/` | D1 数据结构及迁移 |
| `mac-bridge/` | 本机 PulsHealth 接收与转发 |
| `scripts/` | 安装、测试和公开内容审计 |
| `docs/` | 部署和发布边界 |
| `desktop/` | 本地服务、SQLite 适配、集成测试与发布版本 |

## 参与

GitHub 仓库是公开源码和版本历史的入口。小修复验证后可直接提交 `main`，较大改动建议开发分支和 PR。GitHub Actions 会运行离线测试、Mac 接收器测试、本地集成测试和公开内容审计。本地发布相关修改会触发三平台构建，版本号更新后在全部通过时发布新的 alpha 下载包；不会覆盖已有版本。网站没有自动部署工作流，代码提交后仍需单独部署到自己的私人站点。生产数据库、健康记录与同步密钥不随 Git 提交。

欢迎提交可复现的问题与改进。请阅读 [贡献指南](CONTRIBUTING.md)，仅使用合成账号、假密钥和虚构报告。健康截图、原始样本、个人财务记录、生产日志及实际连接配置不要出现在 Issue 或 PR 中。
