// Supabase leaderboard over plain REST (no client library): reads the public
// `scores` table and submits through the `submit_score` function defined in
// supabase/schema.sql. Configured with VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY (.env.production for the deployed game, .env.local
// for development); without them the game simply runs offline.

const URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TIMEOUT = 8000;
export const BOARD_SIZE = 100;

export const leaderboardEnabled = Boolean(URL && KEY);

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(`${URL}/rest/v1/${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: KEY,
        // Legacy anon keys are JWTs and go in Authorization too; the newer
        // sb_publishable_ keys only belong in the apikey header.
        ...(KEY.startsWith("eyJ") && { Authorization: `Bearer ${KEY}` }),
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error(`leaderboard ${response.status}: ${await response.text()}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Top entries, best first: [{ name, score, best_combo }]. */
export function fetchTop(limit = BOARD_SIZE) {
  return request(`scores?select=name,score,best_combo&order=score.desc,created_at.asc&limit=${limit}`);
}

/** Submits a run; resolves with its 1-based rank, or null outside the top 100. */
export function submitScore({ name, score, combo, pumpkins }) {
  return request("rpc/submit_score", {
    method: "POST",
    body: JSON.stringify({ p_name: name, p_score: score, p_combo: combo, p_pumpkins: pumpkins }),
  });
}

const NAME_KEY = "smash-your-pumpkin:name";

export function lastName() {
  try {
    const name = localStorage.getItem(NAME_KEY);
    return /^[A-Z0-9]{3}$/.test(name ?? "") ? name : "AAA";
  } catch {
    return "AAA";
  }
}

export function rememberName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not remembered in private mode.
  }
}
