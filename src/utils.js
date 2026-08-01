import { roundTo } from "./constants";

// Epley formula with RIR adjustment
export const calc1RM = (weight, reps, rir = 1) => {
  const w = parseFloat(weight), r = parseFloat(reps), ri = parseFloat(rir) ?? 1;
  if (!w || !r || w <= 0 || r <= 0) return null;
  const eff = r + ri;
  if (eff <= 1) return Math.round(w);
  return Math.round(w * (1 + eff / 30));
};

export const parseRepRange = target => {
  if (!target) return null;
  const m = target.match(/(\d+)[–\-—](\d+)/);
  if (m) return { min: parseInt(m[1]), max: parseInt(m[2]) };
  const s = target.match(/^(\d+)$/);
  if (s) return { min: parseInt(s[1]), max: parseInt(s[1]) };
  return null;
};

// Set 2 suggestion — rep range is the contract.
//
// Projects set 2 reps at same weight (RIR-based fatigue drop).
// If projected reps fall BELOW range.min, drop weight to keep set 2 in range.
//
// Weight reduction uses practical fatigue %, NOT Epley inverse.
// Epley tells you what weight gives X reps FRESH — useless here since
// you're fatigued from set 1. Two compounding factors:
//   · How close to failure set 1 was (lower RIR → more fatigue → bigger drop)
//   · How many reps short of range.min the projection falls (more shortfall → bigger drop)
export const calcSet2Suggestion = (weight, reps, rir, target) => {
  const w = parseFloat(weight), r = parseFloat(reps);
  if (!w || !r || r < 1) return null;
  const ri = (rir === null || rir === undefined) ? 1 : parseFloat(rir);

  const drop = ri <= 2 ? 2 : ri === 3 ? 1 : 0;
  const projectedReps = Math.round(r - drop);
  const range = parseRepRange(target);

  if (range && projectedReps < range.min) {
    const shortfall = range.min - projectedReps;
    const baseDrop = ri <= 0 ? 0.08 : ri <= 1 ? 0.04 : ri <= 2 ? 0.02 : 0.01;
    const shortfallDrop = shortfall * 0.02;
    const totalDrop = Math.min(baseDrop + shortfallDrop, 0.20);
    const suggestedWeight = roundTo(w * (1 - totalDrop), 2.5);
    return { weight: suggestedWeight, reps: range.min, belowRange: true };
  }

  if (projectedReps < 1) return null;
  return { weight: w, reps: projectedReps, belowRange: false };
};

// Levenshtein-based similarity, 0..1, for exercise-name duplicate detection.
const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i-1] === b[j-1] ? d[i-1][j-1] : 1 + Math.min(d[i-1][j], d[i][j-1], d[i-1][j-1]);
    }
  }
  return d[m][n];
};

export const nameSimilarity = (a, b) => {
  const x = (a || "").trim().toLowerCase(), y = (b || "").trim().toLowerCase();
  if (!x || !y) return 0;
  if (x === y) return 1;
  const maxLen = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / maxLen;
};

export const calcNextSession = (weight, reps, target, exType) => {
  const range = parseRepRange(target);
  if (!range || !weight || !reps) return null;
  const w = parseFloat(weight), r = parseFloat(reps);
  if (r < range.max) return null;
  const newWeight = roundTo(w * 1.05, 2.5);
  return { weight: newWeight, reps: range.min, note: `Hit top of range (${range.max} reps) — ready to add weight` };
};
