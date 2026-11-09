import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeExercise, summarizeSession } from '../public/timing-core.js';

const at = seconds => new Date(Date.UTC(2026, 0, 1, 8, 0, seconds)).toISOString();

test('summarizeExercise uses only intra-exercise intervals', () => {
    const sets = [
        { set_id: 'a', recorded_at: at(0) },
        { set_id: 'b', recorded_at: at(90), previous_set_id: 'a', interval_seconds: 90 },
        // 跨动作：上一组属于别的动作，不计入本动作平均
        { set_id: 'c', recorded_at: at(300), previous_set_id: 'x', interval_seconds: 210 },
        { set_id: 'd', recorded_at: at(390), previous_set_id: 'c', interval_seconds: 90 },
    ];
    const summary = summarizeExercise(sets);
    assert.equal(summary.recorded_sets, 4);
    assert.equal(summary.duration_seconds, 390);
    assert.equal(summary.interval_count, 2);
    assert.equal(summary.avg_interval_seconds, 90, '只有同动作内的 90s 参与平均');
    assert.equal(summary.first_recorded_at, at(0));
    assert.equal(summary.last_recorded_at, at(390));
});

test('summarizeExercise reports no average for a single recorded set', () => {
    const summary = summarizeExercise([{ set_id: 'a', recorded_at: at(10), weight: 60, reps: 5 }]);
    assert.equal(summary.recorded_sets, 1);
    assert.equal(summary.duration_seconds, 0);
    assert.equal(summary.avg_interval_seconds, null);
    assert.equal(summary.interval_count, 0);
});

test('summarizeExercise ignores unrecorded and legacy sets', () => {
    const summary = summarizeExercise([
        { set_id: 'a', weight: 60, reps: 10 },
        { set_id: 'b', recorded_at: 'not-a-date' },
        null,
    ]);
    assert.equal(summary.recorded_sets, 0);
    assert.equal(summary.duration_seconds, 0);
    assert.equal(summary.avg_interval_seconds, null);
    assert.equal(summary.first_recorded_at, null);
});

test('summarizeSession spans the whole session across exercises', () => {
    const exercises = [
        { exercise_name: '卧推', sets_data: [
            { set_id: 'a', recorded_at: at(0) },
            { set_id: 'b', recorded_at: at(120), previous_set_id: 'a', interval_seconds: 120 },
        ] },
        { exercise_name: '飞鸟', sets_data: [
            { set_id: 'c', recorded_at: at(600), previous_set_id: 'b', interval_seconds: 480 },
            { set_id: 'd', recorded_at: at(780), previous_set_id: 'c', interval_seconds: 180 },
        ] },
    ];
    const summary = summarizeSession(exercises);
    assert.equal(summary.recorded_sets, 4);
    assert.equal(summary.duration_seconds, 780);
    assert.equal(summary.first_recorded_at, at(0));
    assert.equal(summary.last_recorded_at, at(780));
});

test('summarizeSession tolerates empty and malformed input', () => {
    assert.equal(summarizeSession([]).duration_seconds, 0);
    assert.equal(summarizeSession(undefined).recorded_sets, 0);
    assert.equal(summarizeSession([{ exercise_name: 'x' }, { exercise_name: 'y', sets_data: [] }]).duration_seconds, 0);
    assert.equal(summarizeSession([{ sets_data: [{ recorded_at: null }] }]).recorded_sets, 0);
});
