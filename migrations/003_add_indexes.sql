-- 查询性能索引：消除跨用户全表扫描，大幅降低 D1 rows_read（读取配额消耗）
-- 执行一次：npx wrangler d1 execute fitness-data --remote --file=migrations/003_add_indexes.sql
-- 注意：uid/updated_at 的索引已在 002_add_sync_fields.sql 中创建

-- 训练记录：按用户+肌群+日期查询（/history、/exercises、/last-workout 等接口的主查询路径）
CREATE INDEX IF NOT EXISTS idx_ws_user_muscle_date ON workout_sessions(user_id, muscle_group, session_date, session_id);

-- 训练记录：增量同步拉取（WHERE user_id = ? AND updated_at > ?）
CREATE INDEX IF NOT EXISTS idx_ws_user_updated ON workout_sessions(user_id, updated_at);

-- 自定义动作：按用户+肌群查询（/exercises、/sync push 逐条比对）
CREATE INDEX IF NOT EXISTS idx_ce_user_muscle ON custom_exercises(user_id, muscle_group);
