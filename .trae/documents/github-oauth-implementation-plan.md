# GitHub 单点登录接入 - 实施计划

## 当前状态

### 已完成 ✅
- **后端 Auth 路由**：`/auth/github`、`/auth/callback`、`/auth/me`、`/auth/logout` 已实现
- **Auth 中间件**：从 cookie 读取 session token，注入 userId
- **CORS 配置**：已配置 `credentials: true`，允许跨域携带 cookie
- **数据库 Schema**：users、sessions 表已定义，workout_sessions 和 custom_exercises 已添加 user_id
- **用户数据隔离**：所有路由已按 user_id 过滤数据
- **首次登录数据迁移**：首次登录时将 user_id IS NULL 的数据绑定到新用户

### 待完成 ❌
- **前端登录 UI**：user-area 区域为空，需要添加登录按钮/用户头像
- **前端登录状态管理**：页面加载时检查 `/auth/me`，管理登录状态
- **前端 API 调用**：所有 14 处 fetch 调用缺少 `credentials: 'include'`
- **Auth 回调处理**：URL 参数 `?auth=success` / `?auth=error` 的处理
- **数据库迁移执行**：Schema.sql 中的 users/sessions 表需要在远程 D1 执行
- **GitHub OAuth App 注册**：需手动在 GitHub 创建
- **Worker Secrets 设置**：GITHUB_CLIENT_ID 和 GITHUB_CLIENT_SECRET
- **端到端测试**：部署后完整测试登录流程

## 实施步骤

### 第一步：前端登录 UI 和状态管理

在 `public/index.html` 中添加：

1. **user-area 区域填充**：
   - 未登录状态：显示 GitHub 登录按钮（带 GitHub 图标）
   - 已登录状态：显示用户头像 + 用户名 + 登出按钮

2. **登录状态管理 JS**：
   - 添加 `currentUser` 全局变量
   - 添加 `checkAuthStatus()` 函数：调用 `/api/auth/me` 获取登录状态
   - 添加 `loginWithGithub()` 函数：跳转到 `/api/auth/github`
   - 添加 `logout()` 函数：调用 `/api/auth/logout` 并刷新状态
   - 添加 `handleAuthCallback()` 函数：处理 URL 中的 `?auth=success` / `?auth=error`
   - 添加 `updateUserArea()` 函数：根据登录状态渲染 UI

3. **初始化流程**：
   - `DOMContentLoaded` 时先调用 `checkAuthStatus()`
   - 检查 URL 参数处理 auth 回调
   - 然后再加载页面内容

### 第二步：前端 API 调用添加 credentials

修改所有 14 处 fetch 调用，添加 `credentials: 'include'`：

| 行号 | 函数 | 请求类型 |
|------|------|----------|
| 2015 | `loadCommonExercises()` | GET |
| 2072 | 公用动作添加 | POST |
| 2107 | 公用动作更新 | PUT |
| 2134 | 公用动作删除 | DELETE |
| 2292 | `loadAvailableExercises()` | GET |
| 2378 | 自定义动作添加 | POST |
| 2435 | `loadLastWorkout()` | GET |
| 2778 | `saveWorkoutSession()` | POST |
| 2854 | `loadHistory()` | GET |
| 2906 | `deleteSession()` | DELETE |
| 2966 | `loadExercisesForManagement()` | GET |
| 3037 | 动作管理添加 | POST |
| 3067 | 动作管理更新 | PUT |
| 3091 | 动作管理删除 | DELETE |

对于 GET 请求：`fetch(url, { credentials: 'include' })`
对于 POST/PUT/DELETE 请求：在现有 options 对象中添加 `credentials: 'include'`

### 第三步：数据库迁移执行

在远程 D1 数据库执行 Schema 更新：

```bash
npx wrangler d1 execute fitness-data --remote --command="CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, github_id INTEGER NOT NULL UNIQUE, username TEXT NOT NULL, avatar_url TEXT, created_at TEXT DEFAULT (datetime('now', 'localtime')));"

npx wrangler d1 execute fitness-data --remote --command="CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), token TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now', 'localtime')));"

npx wrangler d1 execute fitness-data --remote --command="ALTER TABLE workout_sessions ADD COLUMN user_id INTEGER REFERENCES users(id);"

npx wrangler d1 execute fitness-data --remote --command="ALTER TABLE custom_exercises ADD COLUMN user_id INTEGER REFERENCES users(id);"
```

### 第四步：GitHub OAuth App 注册（手动）

用户需在 https://github.com/settings/developers 创建 OAuth App：
- Application name: `Fitness Tracker`
- Homepage URL: `https://fitness-dpa.pages.dev`
- Authorization callback URL: `https://fitness-tracker.497457669.workers.dev/api/auth/callback`

获取 Client ID 和 Client Secret 后：

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

### 第五步：部署和端到端测试

1. 提交代码到 GitHub（确保 API_BASE_URL 为空）
2. 部署后端到 Cloudflare Workers
3. 部署前端到 Cloudflare Pages
4. 测试完整流程：
   - 点击 GitHub 登录 → 跳转 GitHub 授权 → 回调 → 显示用户信息
   - 刷新页面 → 保持登录状态
   - 保存训练 → 数据绑定到用户
   - 登出 → 清除登录状态
   - 手机浏览器测试

## 注意事项

- Cookie 设置了 `SameSite=Lax`，手机浏览器 OAuth 回调后 cookie 能正常保持
- 跨域请求需要 `credentials: 'include'` + 服务端 CORS `credentials: true`
- 前端部署在 `fitness-dpa.pages.dev`，后端在 `fitness-tracker.497457669.workers.dev`，属于跨域
- 首次登录时自动迁移历史数据，不会丢失
- Session 有效期 1 年，cookie maxAge 同步设置为 1 年
