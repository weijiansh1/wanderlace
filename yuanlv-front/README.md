# 缘旅前端

基于 React + Vite + Tailwind CSS 构建的移动端旅行应用。

## 环境要求

- Node.js >= 18
- npm / pnpm / yarn（推荐 pnpm，项目含 pnpm overrides 配置）

---

## 安装依赖

> **注意**：`react` 和 `react-dom` 在 `peerDependencies` 中标记为 optional，需要手动安装。

**使用 pnpm（推荐）**
```bash
pnpm install
pnpm add react@18.3.1 react-dom@18.3.1
```

**使用 npm**
```bash
npm install
npm install react@18.3.1 react-dom@18.3.1
```

**使用 yarn**
```bash
yarn install
yarn add react@18.3.1 react-dom@18.3.1
```

---

## 开发模式运行

`package.json` 中只配置了 `build` 脚本，直接用 npx 启动 Vite 开发服务器：

```bash
# pnpm
pnpm exec vite

# npm
npx vite

# yarn
yarn vite
```

启动后访问：**http://localhost:5173**

> 在桌面浏览器中，页面会渲染为 430×850px 手机容器（居中显示），模拟移动端效果。

---

## 构建生产包

```bash
# pnpm
pnpm build

# npm
npm run build

# yarn
yarn build
```

构建产物输出到 `dist/` 目录，可直接部署到任意静态服务器。

**本地预览构建结果：**
```bash
npx vite preview
```

---

## 项目结构

```
src/
├── main.tsx              # 应用入口
├── App.tsx               # 根组件 + Router
├── routes.tsx            # 路由定义
├── views/
│   ├── Journey.tsx       # 缘旅页（主旅行页，含地图与旅途状态）
│   ├── Community.tsx     # 发现页（社区动态）
│   └── Memory.tsx        # 记忆页（旅途时间线）
├── components/
│   └── Layout.tsx        # 底部导航栏布局
└── api/                  # 接口层（保留请求封装，便于后续服务对接）
```

---

## 功能说明

| 功能 | 说明 |
|------|------|
| 开启旅途 | 进入旅行模式，自动计时、记录距离 |
| 主页 ↔ 旅行 | 旅行中可点击「主页」返回，主页有「继续旅途」卡片可恢复进度 |
| 地图 | 旅行时以地图为背景，实时显示 GPS 轨迹、锚点、胶囊标记 |
| 锚点 | 旅途中自动生成，同步显示在地图上 |
| 结束旅途 | AI 生成旅行散文，导出电子手帐 |

---

## 注意事项

- **GPS 权限**：旅行页地图需要浏览器定位权限，首次访问时请允许。若拒绝，地图会等待真实定位，不再渲染演示轨迹。
- **地图 Key**：通过 `VITE_MAPBOX_ACCESS_TOKEN` 配置；如需替换，请修改本地环境变量。
- **接口地址**：如需后续接入新服务，可通过 `VITE_API_BASE_URL` 指向目标接口；当前仓库只保留前端代码。
