# UI 外观与动效升级计划（feature/ui-refresh 分支）

## Summary

基于 main（de89802）创建 `feature/ui-refresh` 分支，对健身追踪 PWA 做一次"运动能量风"的视觉焕新 + 完整动效体系升级。改动集中在 `public/index.html`（样式+少量 HTML）与 `public/sw.js`（缓存版本）、`public/manifest.json`（主题色）。完成后部署到 Cloudflare Pages 的 **preview 分支**（不影响生产 main），用户验收后再合并。

## Current State

- 单文件 PWA：Tailwind CDN + FontAwesome + Noto Sans SC，5 个页面（login/home/training/exercise-management/workout-planner）
- 现有风格：iOS Liquid Glass（dark 默认 + light 主题），CSS 变量位于 `:root` 与 `[data-theme="light"]`（index.html L126-143）
- 现有动效：主题圆形扩散（L49-117）、fadeIn（L600）、spin（L993）、slideUp 模态（L1027）、pulse、tooltip fade（L1218）、loginBounce、pageIn 页面切换（L1463）、blockIn 动作块入场（L1490）、按钮按压 scale（L1469-1481）
- git：仅 main 分支，工作区干净

## Proposed Changes

### 1. 分支操作
```bash
git checkout -b feature/ui-refresh
```

### 2. 外观焕新（index.html）

**配色（能量运动风，dark 为主，light 同步适配）**——只改 CSS 变量值，组件引用不变：
- `--primary`：#FF6B35（能量橙）；`--secondary`：#FF3E6C（活力红粉）；`--accent`：#8B5CF6（紫）
- 新增 `--grad-primary: linear-gradient(135deg,#FF6B35,#FF3E6C)`
- dark 背景加深：`--dark:#0A0E1A`、`--darker:#050810`；卡片背景微调带蓝调
- 部位主题色（新增变量，用于卡片与图标）：chest #FF3E6C / back #3B82F6 / shoulders #8B5CF6 / legs #F59E0B

**组件重设计**：
- `.muscle-card`（L231-287）：渐变图标容器（部位色）、左侧色带、大号部位名 + tabular-nums 数字统计、hover 浮起 + 部位色辉光
- `.card`：统一 20px 圆角、渐变细描边（1px 半透明）、双层阴影层次
- `.btn-primary`（L293-342）：换 `--grad-primary` 渐变 + 按压弹性曲线
- 主页顶部加问候大标题（HTML 小改，如"今天练什么？"，历史数据里取最近部位名动态化可选，默认静态文案）
- 数字统一 `font-variant-numeric: tabular-nums`
- `manifest.json`：theme_color/background_color 同步新背景色

### 3. 完整动效体系（index.html）

1. **页面转场（View Transitions API）**：`showPage()`（L2314）包一层 `document.startViewTransition`（不支持则直接切换）；CSS 上新增默认 `::view-transition-old/new(root)` slide-fade 动画。注意与主题切换的 circle 动画共存：现有 L34-36 全局 `animation:none` 改为默认 slide-fade，主题类 `.dark-to-light/.light-to-dark` 下仍用 circle（互不冲突，二者不同时发生）
2. **骨架屏**：新增 `.skeleton` shimmer 样式；主页 muscle-card 网格与历史列表在数据加载前显示骨架占位（JS 渲染前插入、加载后移除）
3. **数字滚动计数**：`animateNumber(el, to)` 工具函数（requestAnimationFrame ~600ms ease-out），用于主页统计数字
4. **交错入场（stagger）**：`.muscle-card`、`.exercise-block`、历史列表项按 `animation-delay: calc(var(--i) * 60ms)` 依次入场，JS 设置 `--i`
5. **模态弹簧曲线**：slideUp 换 `cubic-bezier(0.34,1.56,0.64,1)` + scale(0.94→1) 入场
6. **微交互统一**：所有按钮/hover/按压走统一 spring 曲线；保存成功按钮短暂 ✓ 成功态
7. **可访问性**：所有新动效纳入现有 `prefers-reduced-motion` 块（L1496）

### 4. 部署与验收
- 提交（base_url 清空，符合规范）并推送 `feature/ui-refresh`
- Preview 部署：`npx wrangler pages deploy public --project-name=fitness --branch=feature/ui-refresh`（部署前 node 临时脚本替换 PROD base_url，部署后恢复；脚本与既有流程一致）
- 生成 `*.fitness-dpa.pages.dev` preview URL 供用户验收；**不合并 main**，待用户确认后再合
- SW 缓存 v7 → v8

## Assumptions & Decisions

- 风格焕新走"运动能量风"（橙→红粉主渐变 + 紫强调），dark 优先，light 同步适配
- 不引入任何 JS 动画库（GSAP 等），纯 CSS + 原生 API，保持单文件轻量
- View Transitions 不支持的浏览器（旧 Safari/Firefox）自动降级为无转场直切
- 不改动任何业务逻辑与数据流；分支上不合并 main，验收通过后另行合并

## Verification

1. 分支创建后 `git branch --show-current` = feature/ui-refresh
2. 本地用浏览器自动化截图验证：dark/light 两主题下主页、训练页、计划计算器、模态弹窗的视觉与动效（骨架屏、stagger、按压反馈）
3. `node --check` 不适用（HTML 内嵌脚本），以浏览器 Console 无报错为准
4. Preview URL 在真机（PWA）验证 SW 更新与动效流畅度
5. 确认 `git status` 干净、base_url 已恢复为空后再交付验收
