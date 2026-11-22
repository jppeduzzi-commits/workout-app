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
