/**
 * Fitness Tracker Worker - Upgraded Version
 * - GitHub OAuth single sign-on
 * - User-scoped data isolation
 * - Session management with 1-year cookie
 * - Manages custom exercises with a dropdown.
 * - Saves workouts as sessions (multiple exercises per session).
 * - Allows deleting workout sessions.
 * - Manages common exercises (shared across all muscle groups).
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const app = new Hono().basePath('/api');

const FRONTEND_URL = 'https://fitness-dpa.pages.dev';
const SESSION_COOKIE_NAME = 'session_token';
const SESSION_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// CORS with credentials support
app.use('*', cors({
  origin: [
    FRONTEND_URL,
    'https://fitness-dpa.pages.dev',
    'http://localhost:8788',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

// --- Auth Middleware (optional, sets userId) ---
app.use('*', async (c, next) => {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  let userId = null;

  if (sessionToken) {
    try {
      const now = new Date().toISOString();
      const { results } = await c.env.DB.prepare(
        "SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?"
      ).bind(sessionToken, now).all();

      if (results.length > 0) {
        userId = results[0].user_id;
      }
    } catch (e) {
      console.error('Session lookup error:', e);
    }
  }

  c.set('userId', userId);
  await next();
});

// --- Require Auth Middleware (blocks unauthenticated requests) ---
const requireAuth = async (c, next) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  await next();
};

// --- Auth Routes ---

// GitHub OAuth: redirect to GitHub
app.get('/auth/github', (c) => {
  const clientId = c.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: 'GitHub OAuth not configured' }, 500);
  }

  const redirectUri = `${new URL(c.req.url).origin}/api/auth/callback`;
  const state = generateToken();

  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user&state=${state}`;

  // Store state in a short-lived cookie for CSRF protection
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return c.redirect(githubAuthUrl);
});

// GitHub OAuth callback
app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const savedState = getCookie(c, 'oauth_state');

  if (!code || !state || state !== savedState) {
    return c.redirect(`${FRONTEND_URL}?auth=error`);
  }

  // Clear state cookie
  deleteCookie(c, 'oauth_state', { path: '/' });

  try {
    const clientId = c.env.GITHUB_CLIENT_ID;
    const clientSecret = c.env.GITHUB_CLIENT_SECRET;

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      console.error('GitHub token error:', tokenData.error);
      return c.redirect(`${FRONTEND_URL}?auth=error`);
    }

    const accessToken = tokenData.access_token;

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'Fitness-Tracker',
      },
    });

    const githubUser = await userResponse.json();
    if (!githubUser.id) {
      console.error('GitHub user fetch error:', githubUser);
      return c.redirect(`${FRONTEND_URL}?auth=error`);
    }

    // Create or update user in DB
    const { results: existingUsers } = await c.env.DB.prepare(
      "SELECT id FROM users WHERE github_id = ?"
    ).bind(githubUser.id).all();

    let userId;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      await c.env.DB.prepare(
        "UPDATE users SET username = ?, avatar_url = ? WHERE github_id = ?"
      ).bind(githubUser.login, githubUser.avatar_url, githubUser.id).run();
    } else {
      const result = await c.env.DB.prepare(
        "INSERT INTO users (github_id, username, avatar_url) VALUES (?, ?, ?)"
      ).bind(githubUser.id, githubUser.login, githubUser.avatar_url).run();
      userId = result.meta.last_row_id;

      await c.env.DB.prepare(
        "UPDATE workout_sessions SET user_id = ? WHERE user_id IS NULL"
      ).bind(userId).run();
      await c.env.DB.prepare(
        "UPDATE custom_exercises SET user_id = ? WHERE user_id IS NULL"
      ).bind(userId).run();
    }

    // Create session
    const sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

    await c.env.DB.prepare(
      "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
    ).bind(userId, sessionToken, expiresAt).run();

    // Set session cookie
    setCookie(c, SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return c.redirect(`${FRONTEND_URL}?auth=success`);
  } catch (e) {
    console.error('OAuth callback error:', e);
    return c.redirect(`${FRONTEND_URL}?auth=error`);
  }
});

// Get current user info
app.get('/auth/me', async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ user: null });
  }

  try {
    const { results } = await c.env.DB.prepare(
      "SELECT id, username, avatar_url FROM users WHERE id = ?"
    ).bind(userId).all();

    if (results.length > 0) {
      return c.json({ user: results[0] });
    }
    return c.json({ user: null });
  } catch (e) {
    console.error(e);
    return c.json({ user: null });
  }
});

// Logout
app.post('/auth/logout', async (c) => {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);

  if (sessionToken) {
    try {
      await c.env.DB.prepare(
        "DELETE FROM sessions WHERE token = ?"
      ).bind(sessionToken).run();
    } catch (e) {
      console.error(e);
    }
  }

  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/', secure: true, sameSite: 'None' });
  return c.json({ success: true });
});

// --- API Endpoints for Custom Exercises ---

// 1. Get all exercises for a specific muscle group (custom + common) with frequency
app.get('/exercises/:muscle', requireAuth, async (c) => {
  const muscle = c.req.param('muscle');
  const userId = c.get('userId');
  if (!muscle) {
    return c.json({ error: 'Muscle group is required' }, 400);
  }
  try {
    const { results: customResults } = await c.env.DB.prepare(
      "SELECT exercise_name FROM custom_exercises WHERE muscle_group = ? AND (user_id = ? OR user_id IS NULL) ORDER BY exercise_name"
    ).bind(muscle, userId).all();

    const { results: commonResults } = await c.env.DB.prepare(
      "SELECT exercise_name FROM common_exercises ORDER BY exercise_name"
    ).all();

    const coreExercises = ['卷腹', '平板支撑', '俄罗斯转体', '悬垂举腿', '仰卧抬腿'];

    const existingCommonNames = commonResults.map(r => r.exercise_name);
    const mergedCommonResults = [...commonResults];
    coreExercises.forEach(coreEx => {
      if (!existingCommonNames.includes(coreEx)) {
        mergedCommonResults.push({ exercise_name: coreEx });
      }
    });

    const { results: sessionResults } = await c.env.DB.prepare(
      "SELECT exercises_data FROM workout_sessions WHERE muscle_group = ? AND (user_id = ? OR user_id IS NULL)"
    ).bind(muscle, userId).all();

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
    const common = mergedCommonResults.map(r => r.exercise_name);

    // Sort by frequency (descending), then alphabetically
    const sortByFrequency = (a, b) => {
      const freqA = frequency[a] || 0;
      const freqB = frequency[b] || 0;
      if (freqA !== freqA) return freqB - freqA;
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
app.post('/exercises', requireAuth, async (c) => {
  try {
    const userId = c.get('userId');
    const { muscle_group, exercise_name } = await c.req.json();
    if (!muscle_group || !exercise_name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO custom_exercises (muscle_group, exercise_name, user_id) VALUES (?, ?, ?)"
    ).bind(muscle_group, exercise_name.trim(), userId).run();

    return c.json({ success: true, message: 'Exercise added successfully.' });
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 3. Update exercise name (for both custom and common exercises)
app.put('/exercises', requireAuth, async (c) => {
  try {
    const userId = c.get('userId');
    const { muscle_group, old_name, new_name } = await c.req.json();
    if (!old_name || !new_name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const trimmedNewName = new_name.trim();

    if (muscle_group) {
      const customResult = await c.env.DB.prepare(
        "UPDATE custom_exercises SET exercise_name = ? WHERE muscle_group = ? AND exercise_name = ? AND (user_id = ? OR user_id IS NULL)"
      ).bind(trimmedNewName, muscle_group, old_name, userId).run();

      if (customResult.success && customResult.meta.changes > 0) {
        return c.json({ success: true, message: 'Custom exercise updated successfully.' });
      }
    }

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
app.delete('/exercises', requireAuth, async (c) => {
  try {
    const userId = c.get('userId');
    const { muscle_group, exercise_name } = await c.req.json();
    if (!muscle_group || !exercise_name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const { success } = await c.env.DB.prepare(
      "DELETE FROM custom_exercises WHERE muscle_group = ? AND exercise_name = ? AND (user_id = ? OR user_id IS NULL)"
    ).bind(muscle_group, exercise_name, userId).run();

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
app.post('/common-exercises', requireAuth, async (c) => {
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
app.put('/common-exercises', requireAuth, async (c) => {
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
app.delete('/common-exercises', requireAuth, async (c) => {
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
app.get('/last-workout/:muscle/:exercise', requireAuth, async (c) => {
  const muscle = c.req.param('muscle');
  const exercise = c.req.param('exercise');
  const userId = c.get('userId');
  if (!muscle || !exercise) {
    return c.json({ error: 'Muscle group and exercise are required' }, 400);
  }
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT exercises_data, session_date FROM workout_sessions WHERE muscle_group = ? AND (user_id = ? OR user_id IS NULL) ORDER BY session_date DESC, session_id DESC LIMIT 5"
    ).bind(muscle, userId).all();

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
app.get('/history/:muscle', requireAuth, async (c) => {
  const muscle = c.req.param('muscle');
  const userId = c.get('userId');
  if (!muscle) {
    return c.json({ error: 'Muscle group is required' }, 400);
  }
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT session_id, session_date, exercises_data FROM workout_sessions WHERE muscle_group = ? AND (user_id = ? OR user_id IS NULL) ORDER BY session_date DESC, session_id DESC"
    ).bind(muscle, userId).all();

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

// 11. Save a new workout session
app.post('/session', requireAuth, async (c) => {
  try {
    const userId = c.get('userId');
    const { muscle_group, exercises_data } = await c.req.json();
    if (!muscle_group || !exercises_data || exercises_data.length === 0) {
      return c.json({ error: 'Session data is incomplete' }, 400);
    }
    const today = new Date().toISOString().slice(0, 10); // Format as YYYY-MM-DD

    // Serialize the exercises array into a JSON string for storage
    const exercisesJson = JSON.stringify(exercises_data);

    await c.env.DB.prepare(
      "INSERT INTO workout_sessions (muscle_group, session_date, exercises_data, user_id) VALUES (?, ?, ?, ?)"
    )
    .bind(muscle_group, today, exercisesJson, userId)
    .run();

    return c.json({ success: true, message: 'Session recorded successfully!' });
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// 12. Delete a specific workout session
app.delete('/session/:id', requireAuth, async (c) => {
  const sessionId = c.req.param('id');
  const userId = c.get('userId');
  if (!sessionId) {
    return c.json({ error: 'Session ID is required' }, 400);
  }
  try {
    const { success } = await c.env.DB.prepare(
      "DELETE FROM workout_sessions WHERE session_id = ? AND (user_id = ? OR user_id IS NULL)"
    ).bind(sessionId, userId).run();

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
