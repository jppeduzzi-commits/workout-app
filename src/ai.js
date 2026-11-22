// Thin client for the exercise-classification serverless function. Never
// calls the AI Gateway directly — the API route holds that connection.
// Resilient by design: any failure (network, cold start, gateway outage)
// just returns null so callers fall back to the local keyword heuristic
// instead of blocking exercise creation on an AI call.
export async function classifyExerciseRaw(name, existingNames) {
  try {
    const res = await fetch("/api/classify-exercise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, existingNames: existingNames || [] }),
    });
    if (!res.ok) return null;
    return await res.json(); // { muscleGroup, duplicateOf }
  } catch (e) {
    console.error("classifyExerciseRaw:", e);
    return null;
  }
}

// One-shot scan over the whole catalog's names for existing duplicates typed
// differently (e.g. "Inverted Row" / "Inverted Rows") — a cleanup pass, not
// the per-name check used when adding/substituting. Returns [] on any
// failure so a broken/unreachable function just shows "no duplicates found"
// rather than erroring the whole settings screen.
export async function findDuplicateExerciseGroups(names) {
  try {
    const res = await fetch("/api/find-duplicate-exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: names || [] }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.groups) ? data.groups : [];
  } catch (e) {
    console.error("findDuplicateExerciseGroups:", e);
    return [];
  }
}
