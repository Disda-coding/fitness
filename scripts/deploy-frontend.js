// 部署前端到 Cloudflare Pages（生产分支 main）
// 流程：注入生产 API 地址 + 版本号（v{package.json version}-{git 短 hash}）→ wrangler pages deploy → 还原文件
// 还原保证提交到 GitHub 时 API_BASE_URL 为空、版本号保持占位符
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'public', 'index.html');
const original = fs.readFileSync(file, 'utf8');

let version = '0.0.0';
try { version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || version; } catch (e) {}

let hash = 'dev';
try { hash = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) {}

const prodApi = 'https://fitness-tracker.497457669.workers.dev/api';
const injected = original
  .replace("const API_BASE_URL = '';", `const API_BASE_URL = '${prodApi}';`)
  .replace("'__APP_VERSION__'", `'v${version}-${hash}'`);

if (injected === original) {
  console.error('未找到注入点（API_BASE_URL / __APP_VERSION__），中止部署');
  process.exit(1);
}

fs.writeFileSync(file, injected);
console.log(`已注入: API=${prodApi}, version=v${version}-${hash}`);

try {
  execSync('npx wrangler pages deploy public --project-name=fitness --branch=main', { cwd: root, stdio: 'inherit' });
} finally {
  fs.writeFileSync(file, original);
  console.log('已还原 index.html（base_url 清空、版本号占位符）');
}
