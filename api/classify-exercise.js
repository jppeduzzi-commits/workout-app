// Vercel Serverless Function. Classifies an exercise name's muscle group and
// checks whether it's likely the same exercise as one already in the user's
// catalog under a different name (e.g. "DB Curl" vs "Dumbbell Bicep Curl") —
// the thing a fixed keyword list or plain string-similarity check can't do.
//
// Calls Anthropic directly with an API key (set as the ANTHROPIC_API_KEY env
// var in the Vercel project — Settings → Environment Variables). No Vercel
// AI Gateway, no Firebase — just this function and a key, never exposed to
// the client.

const { generateObject } = require("ai");
const { createAnthropic } = require("@ai-sdk/anthropic");
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

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const name = (body?.name || "").trim();
  const existingNames = Array.isArray(body?.existingNames) ? body.existingNames.filter(Boolean).slice(0, 300) : [];

  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  try {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema,
      prompt: `Exercise name: "${name}"\n\nExisting exercise names already in this person's log (for duplicate detection only):\n${existingNames.length ? existingNames.map(n => `- ${n}`).join("\n") : "(none yet)"}`,
    });
    res.status(200).json(object);
  } catch (e) {
    console.error("classify-exercise:", e);
    res.status(502).json({ error: "classification failed" });
  }
};
