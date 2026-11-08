<p align="center">
  <img src="src-tauri\icons\app-icon.svg" alt="AHNUoHand Logo" width="180" />
</p>

<h1 align="center">AHNUoHand · 校园助手</h1>

AHNUoHand 是安徽师范大学校园助手，面向移动端使用场景，集中提供课表、校历、空教室、电费查询和校园服务入口。

## 功能

- 课表读取、周次切换、周末显示、课程详情和学期设置
- 空教室查询、查询缓存以及楼栋和教室收藏
- 电费查询、历史数据缓存和用电趋势分析
- 一余额查询、消费记录与消费趋势分析
- 教务系统、后勤服务等平台的登录管理
- 个人资料、头像、学号和后勤服务学号绑定
- 明暗模式、主题色和底部导航显示方式设置
- 通知订阅、消息推送和余额预警提醒

## 技术栈

- React 19 + TypeScript
- Vite
- Tauri 2
- antd-mobile
- Motion
- Recharts

## 开发环境

需要安装 Node.js、pnpm、Rust，以及 Windows 下的 WebView2 和 Visual Studio C++ 构建工具。

```bash
pnpm install
pnpm dev
```

浏览器开发地址默认为 `http://localhost:1420`。运行桌面端开发模式：

```bash
pnpm tauri dev
```

## 构建

构建前端产物：

```bash
pnpm build
```

构建 Tauri 应用或 Android 包：

```bash
pnpm tauri build
pnpm tauri android build
```

重新生成桌面和 Android 图标：

```bash
pnpm icons
```

### 更新说明

版本变更记录见 [CHANGELOG.md](CHANGELOG.md)。
