-- 为了安全起见，先删除旧表
DROP TABLE IF EXISTS workouts;

-- 新建: 自定义动作表
-- 用于存储用户添加的动作，方便后续从下拉框选择
CREATE TABLE IF NOT EXISTS custom_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  muscle_group TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  -- 确保同一部位下的动作名称是唯一的
  UNIQUE (muscle_group, exercise_name)
);

-- 新建: 训练会话表
-- 这里的每一条记录都代表一次完整的训练，其中可以包含多个动作
CREATE TABLE IF NOT EXISTS workout_sessions (
  session_id INTEGER PRIMARY KEY AUTOINCREMENT,
  muscle_group TEXT NOT NULL,
  session_date TEXT NOT NULL,
  -- 使用 JSON 字符串来存储本次训练的所有动作和对应的组数数据
  exercises_data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- (可选) 为常用动作预置一些数据，提升初次使用体验
INSERT OR IGNORE INTO custom_exercises (muscle_group, exercise_name) VALUES
('chest', '平板卧推'),
('chest', '上斜卧推'),
('chest', '哑铃飞鸟'),
('back', '引体向上'),
('back', '高位下拉'),
('back', '坐姿划船'),
('shoulders', '站姿推举'),
('shoulders', '侧平举'),
('legs', '深蹲'),
('legs', '腿举');
