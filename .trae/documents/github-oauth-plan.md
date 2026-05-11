# GitHub 单点登录接入计划

## 概述
为健身追踪器接入 GitHub OAuth 登录，将训练数据绑定到 GitHub 账号，登录状态保持一年，支持手机和电脑。

## 前置条件（需手动操作）
1. 在 GitHub 注册 OAuth App：https://github.com/settings/developers
   - Application name: `Fitness Tracker`
   - Homepage URL: `https://fitness-dpa.pages.dev`
   - Authorization callback URL: `https://fitness-tracker.497457669.workers.dev/api/auth/callback`
   - 获取 Client ID 和 Client Secret
2. 将 Client Secret 设置为 Worker Secret：
   ```bash
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```
3. 将 Client ID 也设置为 Worker Secret：
   ```bash
   npx wrangler secret put GITHUB_CLIENT_ID
   ```

## 实现步骤

### 第一步：数据库 Schema 更新
在 D1 数据库中添加用户表，并为现有表添加 user_id 字段：

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER NOT NULL UNIQUE,
  username TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 为 workout_sessions 添加 user_id
ALTER TABLE workout_sessions ADD COLUMN user_id INTEGER REFERENCES users(id);

-- 为 custom_exercises 添加 user_id
ALTER TABLE custom_exercises ADD COLUMN user_id INTEGER REFERENCES users(id);
```

通过 `npx wrangler d1 execute fitness-data --remote --command="..."` 执行。

### 第二步：后端 Auth 路由（src/index.js）

新增以下路由：

1. **`GET /api/auth/github`** - 发起 GitHub OAuth
   - 构造 GitHub 授权 URL（包含 client_id、redirect_uri、scope=read:user）
   - 302 重定向到 GitHub

2. **`GET /api/auth/callback`** - GitHub 回调
   - 用 code 换取 access_token（POST https://github.com/login/oauth/access_token）
   - 用 access_token 获取用户信息（GET https://api.github.com/user）
   - 在 users 表中创建或更新用户
   - 将现有无 user_id 的数据绑定到该用户（首次登录迁移）
   - 生成 session token（随机字符串），存入 httpOnly cookie
   - 在 D1 中存储 session（sessions 表 或 直接用 cookie 中的 user_id + 签名）
   - 302 重定向回前端首页

3. **`GET /api/auth/me`** - 获取当前登录用户
   - 从 cookie 中读取 session token
   - 返回用户信息（username, avatar_url）

4. **`POST /api/auth/logout`** - 登出
   - 清除 cookie

**Session 策略：**
- 使用 httpOnly + Secure + SameSite=Lax cookie
- Cookie 有效期 1 年（max-age=31536000）
- Cookie 内容：`session_token`（随机 64 字符十六进制字符串）
- 新增 `sessions` 表存储 session token 与 user_id 的映射

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
```

### 第三步：后端 Auth 中间件（src/index.js）

- 为所有 `/api/` 路由（除 auth 相关）添加可选认证中间件
- 从 cookie 中读取 session token，查询 sessions 表获取 user_id
- 将 user_id 注入到 context 中（`c.set('userId', userId)`）
- 未登录时 userId 为 null，允许查看但操作时需要登录
- 修改现有路由，按 user_id 过滤数据

### 第四步：修改现有路由支持用户隔离

- `GET /api/exercises/:muscle` - 按 user_id 过滤自定义动作
- `POST /api/exercises` - 创建时关联 user_id
- `GET /api/history/:muscle` - 按 user_id 过滤历史
- `POST /api/session` - 创建时关联 user_id
- `DELETE /api/session/:id` - 验证 user_id 所有权
- `GET /api/last-workout/:muscle/:exercise` - 按 user_id 过滤

### 第五步：前端登录 UI（index.html）

1. **主页 header 添加登录按钮/用户头像**
   - 未登录：显示 "GitHub 登录" 按钮
   - 已登录：显示用户头像 + 用户名 + 登出按钮

2. **登录流程**
   - 点击登录按钮 → 跳转 `/api/auth/github`
   - GitHub 授权后回调 → 后端设置 cookie → 重定向回首页
   - 首页加载时调用 `/api/auth/me` 检查登录状态

3. **登录状态管理**
   - 页面加载时检查登录状态
   - 存储用户信息到 JS 变量
   - 未登录时仍可查看页面，但保存训练时提示登录

4. **训练保存时的登录检查**
   - 保存训练前检查是否已登录
   - 未登录时提示登录

### 第六步：前端 API 调用添加 credentials

所有 fetch 调用添加 `credentials: 'include'`，确保 cookie 随请求发送。

### 第七步：首次登录数据迁移

当用户首次通过 GitHub 登录时：
- 后端检测到该 GitHub 用户首次登录
- 将所有 `user_id IS NULL` 的 workout_sessions 和 custom_exercises 关联到该用户
- 这样历史数据不会丢失

### 第八步：测试与部署

1. 本地测试 OAuth 流程
2. 部署后端到 Cloudflare Workers
3. 部署前端到 Cloudflare Pages
4. 端到端测试登录、数据绑定、登出流程

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/index.js` | 添加 auth 路由、session 管理、认证中间件、修改现有路由支持 user_id |
| `public/index.html` | 添加登录 UI、登录状态管理、API 调用添加 credentials |
| `Schema.sql` | 添加 users 和 sessions 表定义 |

## 注意事项

- GitHub OAuth Client Secret 必须通过 `wrangler secret` 设置，不能硬编码
- Cookie 必须设置 httpOnly + Secure + SameSite=Lax
- 手机浏览器需要 SameSite=Lax（不是 Strict）才能在 OAuth 回调后保持 cookie
- 前端部署在 pages.dev，后端在 workers.dev，属于跨域，需要 CORS 配置允许 credentials
