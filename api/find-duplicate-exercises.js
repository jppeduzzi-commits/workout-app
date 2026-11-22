// Vercel Serverless Function. Given a user's full exercise catalog names,
// finds groups that are actually the same exercise typed differently
// (pluralization, abbreviation, word order, minor spelling) — a one-shot
// cleanup pass, as opposed to classify-exercise's one-name-at-a-time check
// used when adding/substituting going forward.
//
// Calls Anthropic directly with an API key (ANTHROPIC_API_KEY, same Vercel
// env var as classify-exercise). Never exposed to the client.

const { z } = require("zod");

const schema = z.object({
  groups: z.array(z.array(z.string()).min(2)).describe(
    "Each inner array lists exercise names (verbatim from the input list) that are all the same exercise, just worded differently. Only genuine duplicates — not merely similar or related exercises. Every name appears in at most one group. Omit names that have no duplicate."
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
  const names = Array.isArray(body?.names) ? body.names.filter(Boolean).slice(0, 500) : [];

  if (names.length < 2) { res.status(200).json({ groups: [] }); return; }

  try {
    const { generateObject } = await import("ai");
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema,
      prompt: `Here is a list of exercise names from one person's workout log:\n${names.map(n => `- ${n}`).join("\n")}\n\nFind groups of names in this list that refer to the exact same exercise, just written differently (pluralization, abbreviations like "DB" for "Dumbbell", word order, minor typos, equipment synonyms). Be conservative: only group names that are genuinely the same movement, not just similar or in the same muscle group.`,
    });
    res.status(200).json(object);
  } catch (e) {
    console.error("find-duplicate-exercises:", e);
    res.status(502).json({ error: "duplicate scan failed" });
  }
};
