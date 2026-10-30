# 部署与数据边界

## 当前支持的生产环境

本项目来自 ChatGPT Sites 私人站点，使用 Vinext + Cloudflare Workers + D1。原始项目的生产资源没有公开；每位部署者创建自己的站点、数据库及密钥。

当前发布物是带平台适配层的源码，不承诺 GitHub Pages、普通静态托管或裸 Worker 的一键完整部署。GitHub Pages 无法运行本项目的数据库 API。

在 Sites 中创建新的私人项目后，使用它返回的 `project_id` 替换 `.openai/hosting.json` 中的占位值，保留 `d1: "DB"`。按平台的当前源码同步、构建、迁移和发布流程导入本仓库。不要复制原作者的数据库或托管配置。

## 本机数据库

`npm run build` 生成 `dist/server/wrangler.json`。本机启动后 API 报“暂时无法读取”时，应先确认 D1 表已初始化。

迁移目录：`drizzle/`，按编号由小到大执行 SQL。例如在 macOS / Linux 项目根目录：

```sh
for migration in drizzle/*.sql; do
  npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file "$migration" || break
done
```

仅对新建的空本机数据库执行一次。已有数据库使用正确的迁移记录继续升级，不重复执行建表 SQL。生产数据库由托管平台的迁移机制处理，不使用 `--local` 方式冒充生产初始化。

## 认证是部署前提

当前 `lib/health-api.ts` 读取 `oai-authenticated-user-id`，并依赖 Sites 私人网关保护请求。其他服务器不会天然提供这一保障。

改为独立托管时，应先实现服务端会话验证、稳定用户 ID、用户级数据访问控制、同源写入保护、入口限流，以及后台调度接口的服务身份校验；网关应丢弃访客提交的伪造身份头。不能仅把浏览器传来的用户 ID 当作认证结果。

`/api/backups/daily` 和 `/api/backups/enroll` 等后台端点的保护也依赖私人托管入口；在公开服务器上原样暴露不可接受。默认本地模拟认证只用于回环地址上的开发环境。

## 可选健康同步密钥

`HEALTH_SYNC_SERVICE_TOKEN` 是部署者自己的 Sites 服务访问凭据，在托管平台中保存为运行时 secret，不写入 `.openai/hosting.json` 或公开源码。未配置时，健康连接配置接口返回未配置提示，其他手动记录功能仍可独立开发和测试。

Mac 接收器使用 `SELFSPACE_SITE_URL` 指定自己的 HTTPS 源地址，仅向这个固定来源发送凭据，不跟随重定向。接收器的本机数据目录、钥匙串内容和数据库均不属于源码。

## 费用与服务

开源许可证不包含云数据库、托管流量、第三方 App 或推送服务的额度。浏览器报告 OCR 随仓库自托管，不调用付费识别接口。定时备份还需要部署者按平台支持的方式配置调度；源码里有接口不代表后台任务已经开启。
