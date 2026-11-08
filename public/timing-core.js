// Shared by the browser and Worker. Existing weight/reps-only records remain valid.
export const timingKeys = ['set_id', 'recorded_at', 'previous_set_id', 'interval_seconds'];

export function validReps(value) {
    return String(value ?? '').trim().split('-').every(part => /^\d+$/.test(part) && Number(part) > 0 && Number.isSafeInteger(Number(part)));
}

export function validWeight(value) {
    return String(value ?? '').trim().split('-').every(part => /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(part) && Number.isFinite(Number(part)) && Number(part) >= 0);
}

export function formatInterval(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const remaining = seconds % 60;
    return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

export function timingFields(set) {
    return Object.fromEntries(timingKeys.filter(key => set[key] !== undefined).map(key => [key, set[key]]));
}

// Rebuild only the current draft, never relink separately saved sessions when merged.
export function recomputeIntervals(sets) {
    const result = sets.map(set => {
        const copy = { ...set };
        delete copy.previous_set_id;
        delete copy.interval_seconds;
        return copy;
    });
    const recorded = result.filter(set => set.recorded_at && Number.isFinite(Date.parse(set.recorded_at)))
        .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
    recorded.forEach((set, index) => {
        if (!index) return;
        const previous = recorded[index - 1];
        set.previous_set_id = previous.set_id;
        set.interval_seconds = Math.floor((Date.parse(set.recorded_at) - Date.parse(previous.recorded_at)) / 1000);
    });
    return result;
}

export function validateWorkoutTiming(exercises) {
    if (!Array.isArray(exercises)) return;
    const timed = [];
    const ids = new Map();
    const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
    for (const exercise of exercises) {
        for (const set of Array.isArray(exercise?.sets_data) ? exercise.sets_data : []) {
            if (!set || typeof set !== 'object' || !timingKeys.some(key => key in set)) continue;
            if (!validId(set.set_id) || ids.has(set.set_id)) throw new Error('Invalid or duplicate set_id');
            ids.set(set.set_id, set);
            if (set.recorded_at !== undefined && (typeof set.recorded_at !== 'string'
                || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(set.recorded_at) || !Number.isFinite(Date.parse(set.recorded_at)))) {
                throw new Error('Invalid recorded_at');
            }
            const hasPrevious = set.previous_set_id !== undefined;
            const hasInterval = set.interval_seconds !== undefined;
            if (hasPrevious !== hasInterval || (hasPrevious && (!validId(set.previous_set_id)
                || !set.recorded_at || !Number.isSafeInteger(set.interval_seconds) || set.interval_seconds < 0))) {
                throw new Error('Invalid interval metadata');
            }
            timed.push(set);
        }
    }
    for (const set of timed) {
        if (!set.previous_set_id) continue;
        const previous = ids.get(set.previous_set_id);
        if (!previous?.recorded_at || previous === set) throw new Error('Missing interval source');
        const expected = Math.floor((Date.parse(set.recorded_at) - Date.parse(previous.recorded_at)) / 1000);
        if (expected < 0 || expected !== set.interval_seconds) throw new Error('Inconsistent interval_seconds');
    }
    // Equal timestamps are legal, but references must not form a cycle.
    const done = new Set();
    for (const set of timed) {
        const path = new Set();
        let current = set;
        while (current && !done.has(current.set_id)) {
            if (path.has(current.set_id)) throw new Error('Cyclic interval metadata');
            path.add(current.set_id);
            current = ids.get(current.previous_set_id);
        }
        for (const id of path) done.add(id);
    }
}
