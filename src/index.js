/**
 * Fitness Tracker Worker - Upgraded Version
 * - Manages custom exercises with a dropdown.
 * - Saves workouts as sessions (multiple exercises per session).
 * - Allows deleting workout sessions.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono().basePath('/api');

// Configure CORS to allow requests from your frontend
app.use('*', cors({
  origin: '*', // For production, you might want to restrict this to your domain
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
}));

// --- API Endpoints for Custom Exercises ---

// 1. Get all custom exercises for a specific muscle group
app.get('/exercises/:muscle', async (c) => {
  const muscle = c.req.param('muscle');
  if (!muscle) {
    return c.json({ error: 'Muscle group is required' }, 400);
  }
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT exercise_name FROM custom_exercises WHERE muscle_group = ? ORDER BY exercise_name"
    ).bind(muscle).all();
    // Return a simple array of names
    return c.json(results.map(r => r.exercise_name));
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 2. Add a new custom exercise
app.post('/exercises', async (c) => {
  try {
    const { muscle_group, exercise_name } = await c.req.json();
    if (!muscle_group || !exercise_name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    // 'INSERT OR IGNORE' is used to prevent errors if the exercise already exists, fulfilling the UNIQUE constraint gracefully.
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO custom_exercises (muscle_group, exercise_name) VALUES (?, ?)"
    ).bind(muscle_group, exercise_name.trim()).run();
    
    return c.json({ success: true, message: 'Exercise added successfully.' });
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});


// --- API Endpoints for Workout Sessions ---

// 3. Get workout history (all sessions) for a muscle group
app.get('/history/:muscle', async (c) => {
  const muscle = c.req.param('muscle');
  if (!muscle) {
    return c.json({ error: 'Muscle group is required' }, 400);
  }
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT session_id, session_date, exercises_data FROM workout_sessions WHERE muscle_group = ? ORDER BY session_date DESC, session_id DESC"
    ).bind(muscle).all();

    // Before sending the data, parse the JSON string in 'exercises_data' back into an object
    results.forEach(session => {
      try {
        session.exercises_data = JSON.parse(session.exercises_data);
      } catch (jsonError) {
        console.error(`Failed to parse exercises_data for session ${session.session_id}:`, jsonError);
        session.exercises_data = []; // Provide a fallback
      }
    });

    return c.json(results);
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 4. Save a new workout session
app.post('/session', async (c) => {
  try {
    const { muscle_group, exercises_data } = await c.req.json();
    if (!muscle_group || !exercises_data || exercises_data.length === 0) {
      return c.json({ error: 'Session data is incomplete' }, 400);
    }
    const today = new Date().toISOString().slice(0, 10); // Format as YYYY-MM-DD
    
    // Serialize the exercises array into a JSON string for storage
    const exercisesJson = JSON.stringify(exercises_data);

    await c.env.DB.prepare(
      "INSERT INTO workout_sessions (muscle_group, session_date, exercises_data) VALUES (?, ?, ?)"
    )
    .bind(muscle_group, today, exercisesJson)
    .run();

    return c.json({ success: true, message: 'Session recorded successfully!' });
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 5. Delete a specific workout session
app.delete('/session/:id', async (c) => {
  const sessionId = c.req.param('id');
  if (!sessionId) {
    return c.json({ error: 'Session ID is required' }, 400);
  }
  try {
    const { success } = await c.env.DB.prepare(
      "DELETE FROM workout_sessions WHERE session_id = ?"
    ).bind(sessionId).run();

    if (success) {
      return c.json({ success: true, message: 'Session deleted successfully!' });
    } else {
      // This case might happen if the ID doesn't exist, which is fine.
      return c.json({ success: true, message: 'Session already deleted or not found.' });
    }
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

export default app;
