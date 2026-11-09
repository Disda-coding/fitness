import { validReps, validWeight, formatInterval, timingFields, recomputeIntervals, summarizeExercise, summarizeSession } from './timing-core.js';

const container = document.getElementById('current-session-container');
const card = document.getElementById('interval-card');
// The pill must take over the moment the timer itself is hidden, not when the
// whole card (which keeps extra padding below the digits) has scrolled away.
const timerFace = card.querySelector('.interval-face') || card;
const headerTimer = document.getElementById('interval-header');
const capsuleTimer = document.getElementById('interval-capsule');
const dockTimer = document.getElementById('interval-dock');
let latest = null;
let firstRecorded = null;
let compact = false;
let observer;
let idleTimer = null;
// Production uses A. Only the isolated local demo exposes a style selector.
let skin = 'header';
let rendering = false;
// 次数填完后 5s 没有操作就当作这组结束，立即开始算下一组的组间歇。
const IDLE_COMMIT_MS = 5000;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function rows() { return [...container.querySelectorAll('.set-item')]; }
function ensureRow(row) {
    if (!row._timing) row._timing = { set_id: generateUUID(), legacy: false, edited: false };
    return row._timing;
}
function exerciseOf(row) { return row.closest('.exercise-block')?.querySelector('.exercise-select')?.value || ''; }
function effectiveWeight(row) {
    let weight = '';
    for (const sibling of row.closest('.sets-container').querySelectorAll('.set-item')) {
        const value = sibling.querySelector('.set-weight').value.trim();
        if (value) weight = value;
        if (sibling === row) return weight;
    }
    return weight;
}
function isValidRow(row) {
    const name = exerciseOf(row);
    return name && name !== 'add_new' && validWeight(effectiveWeight(row)) && validReps(row.querySelector('.set-reps').value);
}
function commit(row) {
    const state = ensureRow(row);
    if (!isValidRow(row)) {
        delete state.recorded_at;
        delete state.previous_set_id;
        delete state.interval_seconds;
        state.legacy = false;
    } else if (!state.recorded_at && !state.legacy && state.edited) {
        // 用最后一次输入的时间，而不是触发提交的时刻，避免把停手后的空等算进组间歇。
        state.recorded_at = new Date(row._lastEditAt || Date.now()).toISOString();
    }
    row._lastEditAt = 0;
    refresh();
    saveSessionToLocalStorage();
}

function clearIdle() {
    clearTimeout(idleTimer);
    idleTimer = null;
}
function scheduleIdle(row) {
    clearIdle();
    idleTimer = setTimeout(() => {
        idleTimer = null;
        if (!row.isConnected) return;
        commit(row);
    }, IDLE_COMMIT_MS);
}

function refresh() {
    if (rendering) return;
    rendering = true;
    const allRows = rows();
    const linked = recomputeIntervals(allRows.map(ensureRow));
    latest = null;
    firstRecorded = null;
    allRows.forEach((row, index) => {
        row._timing = linked[index];
        const recorded = Boolean(row._timing.recorded_at);
        row.classList.toggle('set-recorded', recorded);
        row.querySelector('span:first-child').title = recorded ? '已记录' : '';
        if (recorded && (!firstRecorded || row._timing.recorded_at < firstRecorded)) firstRecorded = row._timing.recorded_at;
        if (recorded && (!latest || row._timing.recorded_at >= latest.recorded_at)) {
            latest = { ...row._timing, exercise: exerciseOf(row), number: [...row.parentElement.children].indexOf(row) + 1 };
        }
    });
    rendering = false;
    render();
}

function render() {
    const active = document.body.dataset.page === 'training-page';
    const elapsed = latest ? Math.max(0, Math.floor((Date.now() - Date.parse(latest.recorded_at)) / 1000)) : 0;
    const time = latest ? formatInterval(elapsed) : '--:--';
    document.querySelectorAll('[data-interval-time]').forEach(el => { if (el.textContent !== time) el.textContent = time; });
    const detail = document.getElementById('interval-detail');
    const detailText = latest ? `${latest.exercise} · 第 ${latest.number} 组已记录` : '填好次数并结束编辑，即开始计时';
    if (detail.textContent !== detailText) detail.textContent = detailText;
    const previousText = latest?.interval_seconds !== undefined
        ? `上一段 ${formatInterval(latest.interval_seconds)}` : latest ? '下一组记录完成时，保存这段时间' : '每次记录之间的时间，包含休息与训练';
    const previous = document.getElementById('interval-previous');
    if (previous.textContent !== previousText) previous.textContent = previousText;
    const total = document.getElementById('interval-total');
    if (total) {
        const totalText = firstRecorded
            ? `本次训练 ${formatInterval(Math.floor((Date.now() - Date.parse(firstRecorded)) / 1000))}`
            : '本次训练 --:--';
        if (total.textContent !== totalText) total.textContent = totalText;
    }
    const keyboard = document.body.classList.contains('keyboard-open');
    let placement = (compact || keyboard) && latest && active ? skin : 'none';
    if (keyboard || (skin === 'dock' && (window.innerWidth >= 1024 || document.getElementById('training-page').dataset.view === 'history'))) {
        placement = placement === 'none' ? 'none' : 'header';
    }
    document.body.dataset.timerPlacement = placement;
    document.body.dataset.timerSkin = skin;
    headerTimer.hidden = placement !== 'header';
    capsuleTimer.hidden = placement !== 'capsule';
    dockTimer.hidden = placement !== 'dock';
    card.classList.toggle('timer-stowed', placement !== 'none');
    card.setAttribute('aria-hidden', String(placement !== 'none'));
    const mobileTitle = document.getElementById('mobile-page-title');
    if (active) {
        const fullTitle = document.getElementById('training-title').textContent;
        mobileTitle.textContent = placement === 'header' ? fullTitle.replace('训练', '') : fullTitle;
        mobileTitle.setAttribute('aria-label', fullTitle);
    }
}

function stickyEdge() {
    const header = document.querySelector('.shell-header').getBoundingClientRect();
    const pageHeader = document.querySelector('#training-page .page-header');
    return window.innerWidth > 640 ? header.height + pageHeader.offsetHeight : header.height;
}
function observeCard() {
    observer?.disconnect();
    const edge = stickyEdge();
    document.documentElement.style.setProperty('--timer-edge', `${edge}px`);
    observer = new IntersectionObserver(entries => {
        const entry = entries[0];
        compact = entry.boundingClientRect.bottom <= edge;
        render();
    }, { rootMargin: `-${edge}px 0px 0px 0px`, threshold: [0, 1] });
    observer.observe(timerFace);
}

container.addEventListener('input', event => {
    const row = event.target.closest('.set-item');
    if (!row) return;
    row._lastEditAt = Date.now();
    if (event.target.matches('.set-reps')) {
        ensureRow(row).edited = true;
        // 次数填完后 5s 没有任何操作，就当作这组结束，直接开始下一组的组间计时。
        scheduleIdle(row);
    }
});
container.addEventListener('focusout', event => {
    if (event.target.matches('.set-reps, .set-weight')) {
        clearIdle();
        commit(event.target.closest('.set-item'));
    }
});
container.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('.set-reps, .set-weight')) {
        event.preventDefault();
        event.target.blur();
    }
});
// All input rows (new, batch-added and restored) use the same completion handling.
window.setTimer = {
    refresh,
    restoreRow(row, data) {
        const fields = timingFields(data);
        // A refresh during an unfinished edit must not resurrect a cleared completion.
        if (!isValidRow(row) || (fields.recorded_at && !Number.isFinite(Date.parse(fields.recorded_at)))) {
            delete fields.recorded_at;
            delete fields.previous_set_id;
            delete fields.interval_seconds;
        }
        row._timing = { ...fields, set_id: data.set_id || generateUUID(), legacy: !fields.recorded_at && validReps(data.reps), edited: false };
    },
    fieldsFor(row) { return timingFields(ensureRow(row)); },
    commitFocused() {
        const active = document.activeElement;
        if (container.contains(active) && active.matches('.set-reps, .set-weight')) commit(active.closest('.set-item'));
    },
    navigationChanged() { clearIdle(); compact = false; refresh(); requestAnimationFrame(observeCard); },
    setSkin(value) { skin = ['header', 'capsule', 'dock'].includes(value) ? value : 'header'; render(); requestAnimationFrame(observeCard); },
    summaryFor(sets) { return summarizeExercise(sets); },
    sessionSummary(exercises) { return summarizeSession(exercises); },
    format: formatInterval,
    // 当前训练里某个动作块已记录部分的统计（新增动作时展示上一个动作用）。
    blockSummary(block) {
        if (!block) return null;
        const sets = [...block.querySelectorAll('.set-item')].map(row => ensureRow(row));
        const summary = summarizeExercise(sets);
        if (!summary.recorded_sets) return null;
        return { exercise: block.querySelector('.exercise-select')?.value || '', ...summary };
    },
    sessionElapsed() {
        return firstRecorded ? Math.floor((Date.now() - Date.parse(firstRecorded)) / 1000) : null;
    },
    historySuffix(set, exerciseName, exercises) {
        if (!Number.isSafeInteger(set.interval_seconds) || set.interval_seconds < 0) return '';
        const previous = exercises?.find(exercise => exercise.sets_data?.some(item => item.set_id === set.previous_set_id));
        const cross = previous && previous.exercise_name !== exerciseName ? `（跨动作：${escapeHtml(previous.exercise_name)}）` : '';
        return `<span class="set-interval"> · 组间 ${formatInterval(set.interval_seconds)}${cross}</span>`;
    },
};
window.addEventListener('resize', () => { render(); observeCard(); });
window.addEventListener('pageshow', render);
document.addEventListener('visibilitychange', render);
new MutationObserver(render).observe(document.body, { attributes: true, attributeFilter: ['class'] });
setInterval(() => { if (!document.hidden) render(); }, 1000);
observeCard();
