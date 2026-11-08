import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import app from '../src/index.js';

// Run the actual Worker SQL against SQLite, with a small D1-compatible async adapter.
function database() {
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync(new URL('../Schema.sql', import.meta.url), 'utf8'));
    db.exec(`CREATE TABLE user_meta (user_id INTEGER, key TEXT, value TEXT, updated_at TEXT, PRIMARY KEY(user_id,key));
        INSERT INTO users (id, github_id, username) VALUES (7,7,'member'),(8,8,'other');
        INSERT INTO sessions (user_id, token, expires_at) VALUES (7,'member-token','2099-01-01'),(8,'other-token','2099-01-01');`);
    return {
        db,
        prepare(sql) {
            let args = [];
            return {
                bind(...values) { args = values; return this; },
                async all() { return { results: db.prepare(sql).all(...args) }; },
                async run() { const result = db.prepare(sql).run(...args); return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } }; },
            };
        },
    };
}
const first = { set_id: 'set-a', weight: 60, reps: 10, recorded_at: '2026-11-08T10:00:00.000Z' };
const next = { set_id: 'set-b', weight: 25, reps: 12, recorded_at: '2026-11-08T10:02:18.000Z', previous_set_id: 'set-a', interval_seconds: 138 };
const exercises = [{ exercise_name: '卧推', sets_data: [first] }, { exercise_name: '飞鸟', sets_data: [next] }];
function sync(DB, workouts, token = 'member-token', extra = {}) {
    return app.request('https://fitness.example/api/sync', { method: 'POST', headers: { Cookie: `session_token=${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ workouts, ...extra }) }, { DB });
}

test('timing survives real SQL sync insert, pull and incremental update, scoped to owner', async () => {
    const DB = database();
    try {
        const workout = { uid: 'timed-session', muscle_group: 'chest', session_date: '2026-11-08', updated_at: '2026-11-08T11:00:00.000Z', deleted: 0, exercises_data: exercises };
        assert.equal((await sync(DB, [workout])).status, 200);
        assert.deepEqual(JSON.parse(DB.db.prepare('SELECT exercises_data FROM workout_sessions WHERE uid=?').get(workout.uid).exercises_data), exercises);
        const pulled = await (await sync(DB, [])).json();
        assert.deepEqual(pulled.workouts[0].exercises_data, exercises);
        assert.equal((await (await sync(DB, [], 'other-token')).json()).workouts.length, 0);
        const updated = structuredClone(workout);
        updated.updated_at = '2026-11-08T12:00:00.000Z';
        updated.exercises_data[1].sets_data[0].reps = 15;
        assert.equal((await sync(DB, [updated], 'member-token', { since: '2026-11-08T11:00:00.000Z' })).status, 200);
        const after = JSON.parse(DB.db.prepare('SELECT exercises_data FROM workout_sessions WHERE uid=?').get(workout.uid).exercises_data);
        assert.equal(after[1].sets_data[0].reps, 15);
        assert.equal(after[1].sets_data[0].interval_seconds, 138);
    } finally { DB.db.close(); }
});

test('invalid timing is rejected before workout writes and legacy records remain accepted', async () => {
    const DB = database();
    try {
        const bad = structuredClone(exercises);
        bad[1].sets_data[0].interval_seconds = -1;
        const response = await sync(DB, [{ uid: 'bad', muscle_group: 'chest', exercises_data: bad }]);
        assert.equal(response.status, 400);
        assert.equal(DB.db.prepare('SELECT count(*) AS n FROM workout_sessions').get().n, 0);
        const legacy = [{ exercise_name: '卧推', sets_data: [{ weight: 60, reps: 10 }] }];
        assert.equal((await sync(DB, [{ uid: 'legacy', muscle_group: 'chest', exercises_data: legacy }])).status, 200);
        assert.deepEqual((await (await sync(DB, [])).json()).workouts[0].exercises_data, legacy);
    } finally { DB.db.close(); }
});

test('direct session endpoint also validates and retains optional timing', async () => {
    const DB = database();
    const submit = exercises_data => app.request('https://fitness.example/api/session', {
        method: 'POST', headers: { Cookie: 'session_token=member-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: 'direct-session', muscle_group: 'chest', exercises_data }),
    }, { DB });
    try {
        const invalid = structuredClone(exercises);
        invalid[1].sets_data[0].previous_set_id = 'missing';
        assert.equal((await submit(invalid)).status, 400);
        assert.equal(DB.db.prepare('SELECT count(*) AS n FROM workout_sessions').get().n, 0);
        assert.equal((await submit(exercises)).status, 200);
        assert.deepEqual(JSON.parse(DB.db.prepare('SELECT exercises_data FROM workout_sessions WHERE uid=?').get('direct-session').exercises_data), exercises);
    } finally { DB.db.close(); }
});
