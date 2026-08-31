#!/bin/bash

FILE="public/index.html"
PROD_URL="https://fitness-tracker.497457669.workers.dev/api"
EMPTY_URL=""

echo "🚀 开始部署（后端 Worker + 前端 Pages）..."

# 检查是否有已跟踪文件的未提交更改
if ! git diff --quiet; then
    echo "❌ 错误: 有未提交的更改，请先提交或暂存"
    exit 1
fi

# 1. 部署后端 Worker（src/index.js -> Cloudflare Worker）
echo "🔧 [1/2] 部署后端 Worker..."
if ! npx wrangler deploy; then
    echo "❌ 后端 Worker 部署失败，终止"
    exit 1
fi

# 2. 部署前端 Pages（public/ -> Cloudflare Pages）
echo "🌐 [2/2] 部署前端 Pages..."

# 用 node 做文本替换（跨平台：sed -i '' 是 macOS 语法，在 Windows Git Bash 下会失败）
replace_url() {
    local from="$1" to="$2"
    node -e "
const fs = require('fs');
const f = process.argv[1];
let s = fs.readFileSync(f, 'utf8');
const from = \"const API_BASE_URL = '$from'\";
const to = \"const API_BASE_URL = '$to'\";
if (!s.includes(from)) { console.error('未找到目标字符串: ' + from); process.exit(1); }
fs.writeFileSync(f, s.split(from).join(to));
" "$FILE"
}

# 设置生产环境 URL
echo "📝 设置生产环境 API_BASE_URL..."
if ! replace_url "$EMPTY_URL" "$PROD_URL"; then
    echo "❌ 设置 API_BASE_URL 失败，终止"
    exit 1
fi

# 确保部署后恢复URL（即使出错也恢复）
restore_url() {
    echo "🔄 恢复开发环境配置..."
    replace_url "$PROD_URL" "$EMPTY_URL"
    echo "✅ 配置已恢复！"
}

# 捕获退出信号，确保恢复
trap restore_url EXIT

# 部署到 Cloudflare Pages
echo "📤 部署前端中..."
if ! npx wrangler pages deploy public --project-name=fitness; then
    echo "❌ 前端 Pages 部署失败"
    exit 1
fi

echo "✅ 全部部署完成！（后端 Worker + 前端 Pages）"
