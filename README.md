# AHNUoHand

AHNUoHand 是安徽师范大学校园助手，面向移动端使用场景，集中提供课表、校历、空教室、电费查询和校园服务入口。

## 功能

- 课表读取、周次切换、周末显示、课程详情和学期设置
- 课表缓存与手动刷新，支持调整每格高度
- 空教室查询、查询缓存以及楼栋和教室收藏
- 电费查询、历史数据缓存和用电趋势分析
- 教务系统、后勤服务等平台的登录管理
- 个人资料、头像、学号和后勤服务学号绑定
- 明暗模式、主题色和底部导航显示方式设置
- Android 返回栈和桌面端窗口交互

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

图标源文件是 `public/icon.svg`。`src-tauri/icons/icon-manifest.json` 按 Tauri 图标配置生成桌面合成图，以及 Android 自适应图标使用的前景层和背景层。

## 版本管理

应用版本只在根目录 `package.json` 的 `version` 字段维护。运行 `pnpm dev`、`pnpm build` 或 `pnpm tauri ...` 时会自动同步 Rust crate 元数据；Tauri 配置直接读取该版本，Android 的 `versionName` 和按 semver 计算的 `versionCode` 也由此生成。个人页显示的版本号同样来自这里。

发布新版本时，只修改 `package.json` 的 `version`，例如 `0.2.0`，然后运行对应的构建命令。

版本变更记录见 [CHANGELOG.md](CHANGELOG.md)。
