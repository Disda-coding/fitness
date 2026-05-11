#!/bin/bash

FILE="public/index.html"
PROD_URL="https://fitness-tracker.497457669.workers.dev/api"
EMPTY_URL=""

echo "🚀 开始部署到 Cloudflare Pages..."

# 检查是否有已跟踪文件的未提交更改
if ! git diff --quiet; then
    echo "❌ 错误: 有未提交的更改，请先提交或暂存"
    exit 1
fi

# 设置生产环境 URL
echo "📝 设置生产环境 API_BASE_URL..."
sed -i '' "s|const API_BASE_URL = '$EMPTY_URL'|const API_BASE_URL = '$PROD_URL'|g" "$FILE"

# 确保部署后恢复URL（即使出错也恢复）
restore_url() {
    echo "🔄 恢复开发环境配置..."
    sed -i '' "s|const API_BASE_URL = '$PROD_URL'|const API_BASE_URL = '$EMPTY_URL'|g" "$FILE"
    echo "✅ 配置已恢复！"
}

# 捕获退出信号，确保恢复
trap restore_url EXIT

# 部署到 Cloudflare Pages
echo "📤 部署中..."
npx wrangler pages deploy public --project-name=fitness

echo "✅ 部署完成！"
