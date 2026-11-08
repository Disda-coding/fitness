// Only scripts/dev.js --demo serves this file, on a separate origin (port 4174).
// These fixtures never ship with public/ and cannot reach the production API.
(() => {
    const fixtures = {
        chest: [
            ['杠铃卧推', [[40, 15], [50, 12], [60, 10], [65, 8], [70, 6], [65, 8], [60, 10], [50, 12]]],
            ['上斜哑铃卧推', [[22.5, 12], [25, 10], [25, 8]]],
            ['哑铃飞鸟', [[12.5, 12], [15, 10], ['15-12.5-10', '8-8-8']]],
            ['绳索下压', [[20, 12], [25, 10], [25, 10]]],
        ],
        back: [
            ['高位下拉', [[40, 12], [45, 10], [50, 8]]],
            ['坐姿划船', [[35, 12], [40, 10], [40, 10]]],
            ['哑铃弯举', [[10, 12], [12.5, 10], [12.5, 8]]],
        ],
        shoulders: [
            ['哑铃推举', [[15, 12], [17.5, 10], [20, 8]]],
            ['哑铃侧平举', [[5, 15], [7.5, 12], [7.5, 12]]],
            ['绳索面拉', [[15, 15], [20, 12], [20, 12]]],
        ],
        legs: [
            ['杠铃深蹲', [[60, 10], [70, 8], [80, 6]]],
            ['腿举', [[100, 12], [120, 10], [140, 8]]],
            ['罗马尼亚硬拉', [[40, 12], [50, 10], [60, 8]]],
        ],
    };
    const marker = 'fitness_demo_fixtures_v4';
    const daysAgo = days => {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString();
    };
    function seed() {
        const custom = [];
        const workouts = [];
        for (const [muscle, exercises] of Object.entries(fixtures)) {
            exercises.forEach(([name], index) => custom.push({
                uid: `demo-${muscle}-${index}`, muscle_group: muscle,
                exercise_name: name, updated_at: daysAgo(3), deleted: 0,
            }));
            for (const days of [3, 7]) {
                const date = daysAgo(days);
                let sequence = 0;
                let previousId;
                const startedAt = Date.parse(`${date.slice(0, 10)}T08:00:00.000Z`);
                workouts.push({
                    uid: `demo-session-${muscle}-${days}`, muscle_group: muscle,
                    session_date: date.slice(0, 10), updated_at: date, deleted: 0,
                    exercises_data: exercises.map(([name, sets]) => ({
                        exercise_name: name,
                        sets_data: sets.map(([weight, reps]) => {
                            const id = `demo-${muscle}-${days}-set-${sequence}`;
                            const set = { weight, reps, set_id: id, recorded_at: new Date(startedAt + sequence * 120000).toISOString() };
                            if (previousId) {
                                set.previous_set_id = previousId;
                                set.interval_seconds = 120;
                            }
                            previousId = id;
                            sequence++;
                            return set;
                        }),
                    })),
                });
            }
            localStorage.removeItem(`currentSessionData_${muscle}`);
            localStorage.removeItem(`exerciseCache_${muscle}`);
        }
        localStorage.setItem('sync_custom_exercises_v1', JSON.stringify(custom));
        localStorage.setItem('sync_workouts_v1', JSON.stringify(workouts));
        localStorage.setItem('sync_common_exercises_v1', JSON.stringify([
            { exercise_name: '平板支撑', updated_at: daysAgo(3), deleted: 0 },
        ]));
        localStorage.setItem('sync_meta_v1', '{}');
        localStorage.removeItem('sync_last_time_v1');
        localStorage.removeItem('sync_watermark_v1');
        localStorage.setItem('currentSessionData_chest', JSON.stringify([
            { exercise_name: '杠铃卧推', sets_data: [
                { weight: '60', reps: '10', set_id: 'demo-recorded-1', recorded_at: new Date(Date.now() - 154000).toISOString() },
                { weight: '65', reps: '8', set_id: 'demo-recorded-2', recorded_at: new Date(Date.now() - 34000).toISOString(), previous_set_id: 'demo-recorded-1', interval_seconds: 120 },
                { weight: '65', reps: '' },
            ] },
            { exercise_name: '上斜哑铃卧推', sets_data: [{ weight: '25', reps: '' }, { weight: '25', reps: '' }, { weight: '25', reps: '' }] },
            { exercise_name: '哑铃飞鸟', sets_data: [{ weight: '15', reps: '' }, { weight: '15', reps: '' }, { weight: '15', reps: '' }] },
            { exercise_name: '绳索下压', sets_data: [{ weight: '25', reps: '' }, { weight: '25', reps: '' }, { weight: '25', reps: '' }] },
        ]));
        localStorage.setItem(marker, '1');
    }
    if (!localStorage.getItem(marker)) seed();

    // Use the same recording UI, with authentication and remote sync disabled.
    checkAuthStatus = async () => {
        currentUser = { offline: true, username: '演示数据', avatar_url: null };
    };
    syncManager.sync = async () => {
        updateSyncButtonUI('offline');
        document.getElementById('sync-status-text').textContent = '演示数据 · 仅本地保存';
        return false;
    };
    updateUserArea = () => {
        document.getElementById('user-area').textContent = '演示数据';
    };
    loginWithGithub = () => showModal('演示模式', '此页面使用示例数据，可自由填写、添加动作和保存训练。');

    const reset = document.createElement('button');
    reset.className = 'demo-reset';
    reset.textContent = '重置';
    reset.title = '重置演示数据';
    reset.setAttribute('aria-label', '重置演示数据');
    reset.style.cssText = 'min-width:44px;min-height:44px;border:0;background:none;color:var(--muted);font-size:12px;cursor:pointer';
    reset.onclick = () => { seed(); location.reload(); };
    document.querySelector('.shell-actions').prepend(reset);

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(async () => {
            await showTrainingPage('chest', '胸部训练');
            const note = document.createElement('p');
            note.textContent = '演示数据 · 填写第三组次数，或向下滚动比较计时样式';
            note.style.cssText = 'font-size:11px;color:var(--muted);margin:0 0 12px';
            document.querySelector('.training-tabs').before(note);
            const picker = document.createElement('div');
            picker.className = 'timer-demo-picker';
            picker.innerHTML = '<p><span>计时器样式预览</span><span>切换样式保留当前计时</span></p><div></div>';
            const styles = [['header', 'A 顶栏收纳'], ['capsule', 'B 顶部胶囊'], ['dock', 'C 底部操作栏']];
            const selected = new URL(location.href).searchParams.get('timer') || localStorage.getItem('demo_timer_skin') || 'header';
            function selectStyle(value) {
                window.setTimer.setSkin(value);
                localStorage.setItem('demo_timer_skin', value);
                const url = new URL(location.href);
                url.searchParams.set('timer', value);
                history.replaceState(null, '', url);
                picker.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.skin === value)));
            }
            for (const [value, label] of styles) {
                const button = document.createElement('button');
                button.textContent = label;
                button.dataset.skin = value;
                button.onclick = () => selectStyle(value);
                picker.lastElementChild.append(button);
            }
            document.getElementById('interval-card').before(picker);
            selectStyle(styles.some(([value]) => value === selected) ? selected : 'header');
        }, 0);
    });
})();
