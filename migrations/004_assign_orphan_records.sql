-- 一次性数据迁移：将匿名(user_id IS NULL)历史记录归属给唯一注册用户
-- 背景：数据隔离加固后(user_id = ?)，匿名记录对所有用户不可见；
--       本部署为单人应用（users 仅 1 行），归属不会造成跨用户泄漏。
-- 注意：多用户环境禁止执行本脚本（无法判定匿名记录归属）。
-- 幂等：已归属记录不受影响；无匿名记录时 0 行变更。
-- 执行：npx wrangler d1 execute fitness-data --remote --file=migrations/004_assign_orphan_records.sql -y

UPDATE custom_exercises
SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)
WHERE user_id IS NULL;

UPDATE workout_sessions
SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)
WHERE user_id IS NULL;
