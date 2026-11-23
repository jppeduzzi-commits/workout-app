import { roundTo } from "./constants";

// RIR and RPE are separate scales a set can be logged with (never both at
// once — the active scale is an app-wide setting). Internal math (1RM,
// set-2 suggestions) is written in RIR terms, so RPE gets converted:
// RPE 10 (failure) ≈ RIR 0, RPE 6 ≈ RIR 4, etc.
export const effortToRIR = s => {
  if (s.rir != null && s.rir !== "") return parseFloat(s.rir);
  if (s.rpe != null && s.rpe !== "") return Math.max(0, 10 - parseFloat(s.rpe));
  return null;
};

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
    return { weight: suggestedWeight, reps: range.min, projected: projectedReps, belowRange: true };
  }

  if (projectedReps < 1) return null;
  return { weight: w, reps: projectedReps, projected: projectedReps, belowRange: false };
};

// Sum of reps logged across all sets so far — the running total behind the
// rep counter toggle (and the number persisted as repTotal on save).
export const sumReps = sets => (sets || []).reduce((a, s) => a + (parseFloat(s.perf) || 0), 0);

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

// Inverse Epley: reps expected at newWeight, finishing at the same RIR as the
// reference set. A missing RIR counts as 1, same as calc1RM. Returns null when
// the answer is too far out (<1 or >30 reps) for the formula to mean anything.
export const estimateReps = (weight, reps, rir, newWeight) => {
  const w = parseFloat(weight), r = parseFloat(reps), nw = parseFloat(newWeight);
  if (!(w > 0) || !(r > 0) || !(nw > 0)) return null;
  const ri = rir == null ? 1 : parseFloat(rir);
  const est = Math.round(30 * ((w * (1 + (r + ri) / 30)) / nw - 1) - ri);
  return est >= 1 && est <= 30 ? est : null;
};

// Same question for a set that follows one already done today. Built on
// calcSet2Suggestion so the two can never disagree: when that says to drop the
// weight, interpolate between "same weight" and the weight it suggests.
export const estimateNextSetReps = (prev, newWeight, target) => {
  const s = calcSet2Suggestion(prev.weight, prev.perf, effortToRIR(prev), target);
  const w = parseFloat(prev.weight), nw = parseFloat(newWeight);
  if (!s || !(nw > 0)) return null;
  if (s.belowRange && s.weight < w) {
    const est = Math.round(s.projected + (w - nw) * (s.reps - s.projected) / (w - s.weight));
    return est >= 1 && est <= 30 ? est : null;
  }
  return estimateReps(w, s.projected, effortToRIR(prev), nw);
};

const isDropAt = (set, i, ex) => !!set.isDropSet || (ex.hasDrop && i === ex.sets);

// Next-session target: once a working set reaches the top of the rep range,
// add ~5% and estimate the reps at that weight. Null until then.
export const calcNextSession = (sets, ex) => {
  const range = parseRepRange(ex.target);
  if (!range || ex.isSuperset || (ex.trackingType && ex.trackingType !== "reps")) return null;
  let best = null;
  (sets || []).forEach((s, i) => {
    const w = parseFloat(s.weight), r = parseFloat(s.perf);
    if (s.bw || isDropAt(s, i, ex) || !(w > 0) || !(r >= range.max)) return;
    const bw = best ? parseFloat(best.weight) : 0;
    if (w > bw || (w === bw && r > parseFloat(best.perf))) best = s;
  });
  if (!best) return null;
  const w = parseFloat(best.weight);
  let weight = roundTo(w * 1.05, 2.5);
  if (weight <= w) weight = roundTo(w + 2.5, 2.5); // light weights can round back to no increase
  const reps = estimateReps(w, best.perf, effortToRIR(best), weight);
  return { weight, reps, fromWeight: w, fromReps: parseFloat(best.perf), range, belowRange: reps == null || reps < range.min };
};

// Reps to expect for set i at the weight typed in today. Uses the set just
// done today when there is one, otherwise the same set from last time.
export const estimateSet = (sets, prevSets, i, ex) => {
  const s = sets[i];
  if (!s || s.bw || ex.isSuperset || isDropAt(s, i, ex) || !(parseFloat(s.weight) > 0)) return null;
  const usable = x => x && !x.bw && parseFloat(x.weight) > 0 && parseFloat(x.perf) > 0;
  const before = sets[i - 1];
  if (i > 0 && usable(before) && !isDropAt(before, i - 1, ex)) {
    const reps = estimateNextSetReps(before, s.weight, ex.target);
    return reps && { reps, from: `set ${i}: ${before.weight}×${before.perf}` };
  }
  const last = prevSets?.[i];
  if (!usable(last) || isDropAt(last, i, ex)) return null;
  const reps = estimateReps(last.weight, last.perf, effortToRIR(last), s.weight);
  return reps && { reps, from: `last time: ${last.weight}×${last.perf}` };
};
