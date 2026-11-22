// Vercel Serverless Function. Classifies an exercise name's muscle group and
// checks whether it's likely the same exercise as one already in the user's
// catalog under a different name (e.g. "DB Curl" vs "Dumbbell Bicep Curl") —
// the thing a fixed keyword list or plain string-similarity check can't do.
//
// Auth: uses Vercel AI Gateway via OIDC (no API key needed once the project
// is linked and AI Gateway is enabled — see `vercel env pull`). Never called
// directly from the browser with a key; this function is the only thing
// that talks to the gateway.

const { generateObject } = require("ai");
const { z } = require("zod");

const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Legs", "Arms", "Core", "Other"];

const schema = z.object({
  muscleGroup: z.enum(MUSCLE_GROUPS).describe("The single primary muscle group this exercise trains"),
  duplicateOf: z.string().nullable().describe(
    "If this exercise is very likely the same movement as one of the provided existing names (just a different name for it, a brand/equipment variant, or an abbreviation), return that exact existing name verbatim. Otherwise null. Only match genuinely the same exercise, not merely a similar one — e.g. 'Incline DB Press' is NOT the same as 'Flat DB Press'."
  ),
});

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const name = (body?.name || "").trim();
  const existingNames = Array.isArray(body?.existingNames) ? body.existingNames.filter(Boolean).slice(0, 300) : [];

  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  try {
    const { object } = await generateObject({
      model: "anthropic/claude-haiku-4.5",
      schema,
      prompt: `Exercise name: "${name}"\n\nExisting exercise names already in this person's log (for duplicate detection only):\n${existingNames.length ? existingNames.map(n => `- ${n}`).join("\n") : "(none yet)"}`,
      providerOptions: { gateway: { tags: ["feature:exercise-classify"] } },
    });
    res.status(200).json(object);
  } catch (e) {
    console.error("classify-exercise:", e);
    res.status(502).json({ error: "classification failed" });
  }
};
