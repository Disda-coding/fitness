/**
 * Fitness Tracker Worker - Upgraded Version
 * - Manages custom exercises with a dropdown.
 * - Saves workouts as sessions (multiple exercises per session).
 * - Allows deleting workout sessions.
 * - Manages common exercises (shared across all muscle groups).
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono().basePath('/api');

// Configure CORS to allow requests from your frontend
app.use('*', cors({
  origin: '*', // For production, you might want to restrict this to your domain
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// --- API Endpoints for Custom Exercises ---

// 1. Get all exercises for a specific muscle group (custom + common) with frequency
app.get('/exercises/:muscle', async (c) => {
  const muscle = c.req.param('muscle');
  if (!muscle) {
    return c.json({ error: 'Muscle group is required' }, 400);
  }
  try {
    // Get custom exercises
    const { results: customResults } = await c.env.DB.prepare(
      "SELECT exercise_name FROM custom_exercises WHERE muscle_group = ? ORDER BY exercise_name"
    ).bind(muscle).all();
    
    // Get common exercises
    const { results: commonResults } = await c.env.DB.prepare(
      "SELECT exercise_name FROM common_exercises ORDER BY exercise_name"
    ).all();
    
    // Get exercise frequency from workout history for this muscle group
    const { results: sessionResults } = await c.env.DB.prepare(
      "SELECT exercises_data FROM workout_sessions WHERE muscle_group = ?"
    ).bind(muscle).all();
    
    // Count exercise frequency
    const frequency = {};
    sessionResults.forEach(session => {
      try {
        const exercises = JSON.parse(session.exercises_data);
        exercises.forEach(ex => {
          const name = ex.exercise_name;
          frequency[name] = (frequency[name] || 0) + 1;
        });
      } catch (e) {
        // Skip invalid data
      }
    });
    
    const custom = customResults.map(r => r.exercise_name);
    const common = commonResults.map(r => r.exercise_name);
    
    // Sort by frequency (descending), then alphabetically
    const sortByFrequency = (a, b) => {
      const freqA = frequency[a] || 0;
      const freqB = frequency[b] || 0;
      if (freqA !== freqB) return freqB - freqA;
      return a.localeCompare(b);
    };
    
    const customSorted = [...custom].sort(sortByFrequency);
    const commonSorted = [...common].sort(sortByFrequency);
    const allSorted = [...customSorted, ...commonSorted];
    
    return c.json({ 
      custom: customSorted, 
      common: commonSorted, 
      all: allSorted,
      frequency 
    });
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
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO custom_exercises (muscle_group, exercise_name) VALUES (?, ?)"
    ).bind(muscle_group, exercise_name.trim()).run();
    
    return c.json({ success: true, message: 'Exercise added successfully.' });
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 3. Update exercise name (for both custom and common exercises)
app.put('/exercises', async (c) => {
  try {
    const { muscle_group, old_name, new_name } = await c.req.json();
    if (!old_name || !new_name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const trimmedNewName = new_name.trim();
    
    // First try to update in custom_exercises
    if (muscle_group) {
      const customResult = await c.env.DB.prepare(
        "UPDATE custom_exercises SET exercise_name = ? WHERE muscle_group = ? AND exercise_name = ?"
      ).bind(trimmedNewName, muscle_group, old_name).run();
      
      if (customResult.success && customResult.meta.changes > 0) {
        return c.json({ success: true, message: 'Custom exercise updated successfully.' });
      }
    }
    
    // If not found in custom, try to update in common_exercises
    const commonResult = await c.env.DB.prepare(
      "UPDATE common_exercises SET exercise_name = ? WHERE exercise_name = ?"
    ).bind(trimmedNewName, old_name).run();
    
    if (commonResult.success && commonResult.meta.changes > 0) {
      return c.json({ success: true, message: 'Common exercise updated successfully.' });
    }
    
    return c.json({ error: 'Exercise not found' }, 404);
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 4. Delete a custom exercise
app.delete('/exercises', async (c) => {
  try {
    const { muscle_group, exercise_name } = await c.req.json();
    if (!muscle_group || !exercise_name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const { success } = await c.env.DB.prepare(
      "DELETE FROM custom_exercises WHERE muscle_group = ? AND exercise_name = ?"
    ).bind(muscle_group, exercise_name).run();
    
    if (success) {
      return c.json({ success: true, message: 'Exercise deleted successfully.' });
    } else {
      return c.json({ error: 'Failed to delete exercise' }, 500);
    }
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// --- API Endpoints for Common Exercises ---

// 5. Get all common exercises
app.get('/common-exercises', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT exercise_name FROM common_exercises ORDER BY exercise_name"
    ).all();
    
    return c.json(results.map(r => r.exercise_name));
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 6. Add a new common exercise
app.post('/common-exercises', async (c) => {
  try {
    const { exercise_name } = await c.req.json();
    if (!exercise_name) {
      return c.json({ error: 'Exercise name is required' }, 400);
    }
    
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO common_exercises (exercise_name) VALUES (?)"
    ).bind(exercise_name.trim()).run();
    
    return c.json({ success: true, message: 'Common exercise added successfully.' });
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 7. Update a common exercise
app.put('/common-exercises', async (c) => {
  try {
    const { old_name, new_name } = await c.req.json();
    if (!old_name || !new_name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const { success, meta } = await c.env.DB.prepare(
      "UPDATE common_exercises SET exercise_name = ? WHERE exercise_name = ?"
    ).bind(new_name.trim(), old_name).run();
    
    if (success && meta.changes > 0) {
      return c.json({ success: true, message: 'Common exercise updated successfully.' });
    } else {
      return c.json({ error: 'Exercise not found or no changes made' }, 404);
    }
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 8. Delete a common exercise
app.delete('/common-exercises', async (c) => {
  try {
    const { exercise_name } = await c.req.json();
    if (!exercise_name) {
      return c.json({ error: 'Exercise name is required' }, 400);
    }
    
    const { success, meta } = await c.env.DB.prepare(
      "DELETE FROM common_exercises WHERE exercise_name = ?"
    ).bind(exercise_name).run();
    
    if (success && meta.changes > 0) {
      return c.json({ success: true, message: 'Common exercise deleted successfully.' });
    } else {
      return c.json({ error: 'Exercise not found' }, 404);
    }
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// --- API Endpoints for Workout Sessions ---

// 9. Get last workout data for a specific exercise in a muscle group
app.get('/last-workout/:muscle/:exercise', async (c) => {
  const muscle = c.req.param('muscle');
  const exercise = c.req.param('exercise');
  if (!muscle || !exercise) {
    return c.json({ error: 'Muscle group and exercise are required' }, 400);
  }
  try {
    // Get the most recent session containing this exercise
    const { results } = await c.env.DB.prepare(
      "SELECT exercises_data, session_date FROM workout_sessions WHERE muscle_group = ? ORDER BY session_date DESC, session_id DESC LIMIT 5"
    ).bind(muscle).all();
    
    // Find the exercise in the sessions
    for (const session of results) {
      try {
        const exercises = JSON.parse(session.exercises_data);
        const found = exercises.find(ex => ex.exercise_name === exercise);
        if (found && found.sets_data && found.sets_data.length > 0) {
          return c.json({ 
            sets_data: found.sets_data, 
            session_date: session.session_date 
          });
        }
      } catch (e) {
        // Skip invalid data
      }
    }
    
    return c.json({ sets_data: null, session_date: null });
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 10. Get workout history (all sessions) for a muscle group
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

// 10. Save a new workout session
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

// 11. Delete a specific workout session
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
      return c.json({ success: true, message: 'Session already deleted or not found.' });
    }
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

export default app;
