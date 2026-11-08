import test from 'node:test';
import assert from 'node:assert/strict';
import { validReps, validWeight, formatInterval, recomputeIntervals, validateWorkoutTiming } from '../public/timing-core.js';

const recorded = (id, seconds) => ({ set_id: id, recorded_at: new Date(Date.UTC(2026, 10, 8, 10, 0, seconds)).toISOString(), weight: 60, reps: 10 });

test('completion validation supports regular and superset inputs without accepting partial entries', () => {
    for (const value of ['10', '8-8-6', ' 12 ']) assert.equal(validReps(value), true);
    for (const value of ['', '0', '-8', '8-', '1.5', 'abc', '8--6']) assert.equal(validReps(value), false);
    for (const value of ['0', '62.5', '25-20-15', '.5']) assert.equal(validWeight(value), true);
    for (const value of ['', '-10', '60-', 'Infinity', '1e3']) assert.equal(validWeight(value), false);
});

test('intervals follow completion order across exercises rather than rendered row order', () => {
    const sets = recomputeIntervals([recorded('third', 240), recorded('first', 0), recorded('second', 120)]);
    assert.equal(sets[0].previous_set_id, 'second');
    assert.equal(sets[0].interval_seconds, 120);
    assert.equal(sets[1].interval_seconds, undefined);
    assert.equal(sets[2].previous_set_id, 'first');
});

test('removing a middle record relinks remaining intervals; removing the first leaves no fabricated interval', () => {
    const linked = recomputeIntervals([recorded('a', 0), recorded('b', 60), recorded('c', 180)]);
    const withoutMiddle = recomputeIntervals(linked.filter(set => set.set_id !== 'b'));
    assert.equal(withoutMiddle[1].previous_set_id, 'a');
    assert.equal(withoutMiddle[1].interval_seconds, 180);
    const withoutFirst = recomputeIntervals(linked.slice(1));
    assert.equal(withoutFirst[0].previous_set_id, undefined);
    assert.equal(withoutFirst[0].interval_seconds, undefined);
});

test('old records remain untimed and timestamp-less rows never become timing anchors', () => {
    const sets = recomputeIntervals([{ weight: 60, reps: 10 }, recorded('a', 60), { set_id: 'empty', weight: 60, reps: '' }]);
    assert.equal(sets[0].recorded_at, undefined);
    assert.equal(sets[1].interval_seconds, undefined);
    assert.doesNotThrow(() => validateWorkoutTiming([{ sets_data: sets }]));
});

test('time formatting supports an hour or more without wrapping minutes or showing negative values', () => {
    assert.equal(formatInterval(138), '02:18');
    assert.equal(formatInterval(3661), '1:01:01');
    assert.equal(formatInterval(-5), '00:00');
});

test('validation accepts independent runs combined in one daily record and cross-action timing', () => {
    const [a, b] = recomputeIntervals([recorded('a', 0), recorded('b', 120)]);
    const [c, d] = recomputeIntervals([recorded('c', 3600), recorded('d', 3780)]);
    assert.doesNotThrow(() => validateWorkoutTiming([{ sets_data: [a, c] }, { sets_data: [b, d] }]));
});

test('validation rejects malformed, dangling, inconsistent and cyclic timing', () => {
    const [a, b] = recomputeIntervals([recorded('a', 0), recorded('b', 120)]);
    for (const rows of [
        [a, { ...b, interval_seconds: -1 }], [a, { ...b, interval_seconds: 121 }],
        [a, { ...b, previous_set_id: 'missing' }], [a, { ...b, set_id: 'a' }],
        [{ ...a, recorded_at: 'not-a-date' }],
        [{ ...a, previous_set_id: 'b', interval_seconds: 0 }, { ...a, set_id: 'b', previous_set_id: 'a', interval_seconds: 0 }],
    ]) assert.throws(() => validateWorkoutTiming([{ sets_data: rows }]));
});
