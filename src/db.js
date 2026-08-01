import { db } from "./firebase";
import { doc, getDoc, getDocFromServer, setDoc, getDocs, deleteDoc, collection, query, where, documentId, arrayUnion, writeBatch } from "firebase/firestore";
import { copy, slugify, titleCase, newSplitId } from "./constants";

// Primary data key is the user's canonical NAME, not Firebase UID.
// UID is anonymous and device-specific — name works across any device.
//
// Firestore paths:
//   programs/{name}                              → { activeSplitId, effortScale, autoLog, exerciseCatalogMigratedAt }
//   programs/{name}/splits/{splitId}             → { id, name, days, program, createdAt, sharedFrom?: {owner, splitId} }
//   programs/{name}/splits/{splitId}/sessions/{dayKey} → { sessions: [] }
//   programs/{name}/splits/{splitId}/drafts/{dayKey}   → { draft: {}, savedAt }
//   programs/{name}/exercises/{exerciseId}       → { id, name, trackingType, exType, createdAt, log: [] }
//     exerciseId is a deterministic slug of the name (see slugify) — same exercise
//     resolves to the same doc no matter which split/day it's logged under.
//   usernames/{name_lower}                       → { name } — for push-to-friend

const can = n => n.trim().charAt(0).toUpperCase() + n.trim().slice(1).toLowerCase();

// ── User metadata ─────────────────────────────────────────────────────────────

export async function fbSaveUserMeta(name, data) {
  try { await setDoc(doc(db, "programs", can(name)), data, { merge: true }); } catch(e) { console.error(e); }
}

// ── Splits — loads from new subcollection; migrates old flat doc on first use ─

export async function fbLoadSplitsForUser(name) {
  const c = can(name);
  try {
    const newSnap = await getDocs(collection(db, "programs", c, "splits"));
    if (!newSnap.empty) {
      const splits = newSnap.docs.map(d => d.data());
      const metaSnap = await getDoc(doc(db, "programs", c));
      const meta = metaSnap.exists() ? metaSnap.data() : {};
      return {
        splits,
        activeSplitId: meta.activeSplitId || splits[0]?.id || null,
        settings: { effortScale: meta.effortScale || (meta.showRIR === false ? "none" : "rir"), autoLog: meta.autoLog !== false },
      };
    }

    // No new-style splits found — check legacy flat doc and migrate
    const oldSnap = await getDocFromServer(doc(db, "programs", c));
    if (!oldSnap.exists()) return { splits: [], activeSplitId: null, settings: null };

    const data = oldSnap.data();
    let oldSplits = [], oldActiveId = null;

    if (Array.isArray(data.splits) && data.splits.length > 0) {
      oldSplits = data.splits;
      oldActiveId = data.activeSplitId || null;
    } else {
      const prog = data.program || data;
      const days = Object.keys(prog).filter(k => prog[k]?.exercises);
      if (days.length > 0) {
        oldSplits = [{ id: "default", name: "Athletic Hypertrophy Split", days, program: copy(prog), createdAt: Date.now() }];
        oldActiveId = "default";
      }
    }
    if (oldSplits.length === 0) return { splits: [], activeSplitId: null, settings: null };

    // Migrate each split into its own subcollection doc, and pull old sessions/drafts
    for (const split of oldSplits) {
      await setDoc(doc(db, "programs", c, "splits", split.id), split);
      for (const dayKey of (split.days || [])) {
        const sessSnap = await getDoc(doc(db, "sessions", `${c}_${dayKey}`));
        if (sessSnap.exists() && sessSnap.data().sessions?.length > 0)
          await setDoc(doc(db, "programs", c, "splits", split.id, "sessions", dayKey), { sessions: sessSnap.data().sessions });
        const draftSnap = await getDoc(doc(db, "drafts", `${c}_${dayKey}`));
        if (draftSnap.exists() && draftSnap.data().draft)
          await setDoc(doc(db, "programs", c, "splits", split.id, "drafts", dayKey),
            { draft: draftSnap.data().draft, savedAt: draftSnap.data().savedAt || null });
      }
    }

    const settingsSnap = await getDoc(doc(db, "settings", c));
    const s = settingsSnap.exists() ? settingsSnap.data() : {};
    const settings = { effortScale: s.effortScale || (s.showRIR === false ? "none" : "rir"), autoLog: s.autoLog !== false };

    await setDoc(doc(db, "programs", c), { activeSplitId: oldActiveId, ...settings });
    return { splits: oldSplits, activeSplitId: oldActiveId, settings };
  } catch(e) {
    console.error("fbLoadSplitsForUser:", e);
    return { splits: [], activeSplitId: null, settings: null };
  }
}

export async function fbSaveSplit(name, split) {
  try { await setDoc(doc(db, "programs", can(name), "splits", split.id), split); } catch(e) { console.error(e); }
}

export async function fbDeleteSplit(name, splitId) {
  try { await deleteDoc(doc(db, "programs", can(name), "splits", splitId)); } catch(e) { console.error(e); }
}

// ── Exercise catalog — global per-user exercise identity + history ───────────

export async function fbLoadExerciseCatalog(name) {
  try {
    const snap = await getDocs(collection(db, "programs", can(name), "exercises"));
    return snap.docs.map(d => d.data());
  } catch(e) { console.error("fbLoadExerciseCatalog:", e); return []; }
}

export async function fbSaveExercise(name, exercise) {
  try { await setDoc(doc(db, "programs", can(name), "exercises", exercise.id), exercise, { merge: true }); } catch(e) { console.error(e); }
}

export async function fbAppendExerciseLog(name, exerciseId, logEntry) {
  try { await setDoc(doc(db, "programs", can(name), "exercises", exerciseId), { log: arrayUnion(logEntry) }, { merge: true }); } catch(e) { console.error(e); }
}

// Full overwrite of an exercise's log array — used when correcting a
// specific historical entry (editing the most recently logged session),
// where arrayUnion's append-only semantics can't remove/replace an entry.
export async function fbSetExerciseLog(name, exerciseId, log) {
  try { await setDoc(doc(db, "programs", can(name), "exercises", exerciseId), { log }, { merge: true }); } catch(e) { console.error(e); }
}

// Batched lookup — Firestore "in" queries are capped at 30 ids per query.
export async function fbLoadExercisesByIds(name, ids) {
  const c = can(name);
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return {};
  const chunks = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
  try {
    const results = await Promise.all(chunks.map(chunk =>
      getDocs(query(collection(db, "programs", c, "exercises"), where(documentId(), "in", chunk)))
    ));
    const map = {};
    results.forEach(snap => snap.docs.forEach(d => { map[d.id] = d.data(); }));
    return map;
  } catch(e) { console.error("fbLoadExercisesByIds:", e); return {}; }
}

// One-time migration: tags every exercise slot across every split with a stable
// exerciseId, then backfills historical sessions into each exercise's global log.
// Gated by programs/{name}.exerciseCatalogMigratedAt so it only ever runs once.
export async function fbMigrateExerciseCatalog(name, splits) {
  const c = can(name);
  try {
    const metaSnap = await getDoc(doc(db, "programs", c));
    if (metaSnap.exists() && metaSnap.data().exerciseCatalogMigratedAt) return;

    const existing = await fbLoadExerciseCatalog(name);
    const catalogMap = {}; // id -> catalog entry (in-memory, updated locally as we mint new ones)
    existing.forEach(e => { catalogMap[e.id] = e; });

    const newEntries = {};    // id -> entry, only the ones we mint during this pass
    const taggedSplits = [];  // every split, with all slots tagged (regardless of whether any changed)
    const dirtySplitIds = new Set(); // subset that actually need a Firestore write

    for (const split of splits) {
      let changed = false;
      const prog = copy(split.program || {});
      for (const dayKey of Object.keys(prog)) {
        const exs = prog[dayKey]?.exercises || [];
        exs.forEach(slot => {
          if (slot.exerciseId) return;
          const id = slugify(slot.name);
          if (!catalogMap[id]) {
            const entry = { id, name: titleCase(slot.name) || slot.name, trackingType: slot.trackingType || "reps", exType: slot.exType || "compound", createdAt: Date.now(), log: [] };
            catalogMap[id] = entry;
            newEntries[id] = entry;
          }
          slot.exerciseId = id;
          changed = true;
        });
      }
      taggedSplits.push({ ...split, program: prog });
      if (changed) dirtySplitIds.add(split.id);
    }

    // Write new catalog entries + tagged splits in one batch.
    const batch1 = writeBatch(db);
    Object.values(newEntries).forEach(entry => batch1.set(doc(db, "programs", c, "exercises", entry.id), entry));
    taggedSplits.filter(s => dirtySplitIds.has(s.id)).forEach(split => batch1.set(doc(db, "programs", c, "splits", split.id), split));
    await batch1.commit();

    // Historical backfill: walk every split/day's logged sessions and append
    // each entry into its resolved exercise's global log.
    const logAppends = {}; // exerciseId -> [logEntry, ...]
    for (const split of taggedSplits) {
      for (const dayKey of Object.keys(split.program || {})) {
        const exs = split.program[dayKey]?.exercises || [];
        const slotById = {}; exs.forEach((s, i) => { slotById[s.id] = { ...s, index: i }; });
        const sessSnap = await getDoc(doc(db, "programs", c, "splits", split.id, "sessions", dayKey));
        const sessions = sessSnap.exists() ? (sessSnap.data().sessions || []) : [];
        sessions.forEach(session => {
          Object.keys(session.entries || {}).forEach(slotId => {
            const slot = slotById[slotId];
            if (!slot || !slot.exerciseId) return;
            const entry = session.entries[slotId];
            const logEntry = { date: session.date, splitId: split.id, dayKey, exerciseIndex: slot.index, sets: entry.sets || [], note: entry.note || null, isSub: entry.isSub || false, subName: entry.subName || null };
            (logAppends[slot.exerciseId] = logAppends[slot.exerciseId] || []).push(logEntry);
          });
        });
      }
    }

    const batch2 = writeBatch(db);
    Object.keys(logAppends).forEach(exerciseId => {
      batch2.set(doc(db, "programs", c, "exercises", exerciseId), { log: arrayUnion(...logAppends[exerciseId]) }, { merge: true });
    });
    batch2.set(doc(db, "programs", c), { exerciseCatalogMigratedAt: Date.now() }, { merge: true });
    await batch2.commit();
  } catch(e) { console.error("fbMigrateExerciseCatalog:", e); }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function fbLoadSessions(name, splitId, dayKey) {
  try {
    const snap = await getDocFromServer(doc(db, "programs", can(name), "splits", splitId, "sessions", dayKey));
    return snap.exists() ? (snap.data().sessions || []) : [];
  } catch(e) { console.error("fbLoadSessions:", e); return []; }
}

export async function fbSaveSessions(name, splitId, dayKey, sessions) {
  try { await setDoc(doc(db, "programs", can(name), "splits", splitId, "sessions", dayKey), { sessions }); } catch(e) { console.error(e); }
}

// ── Drafts ────────────────────────────────────────────────────────────────────

export async function fbLoadDraft(name, splitId, dayKey) {
  try {
    const snap = await getDoc(doc(db, "programs", can(name), "splits", splitId, "drafts", dayKey));
    if (!snap.exists()) return { draft: {}, savedAt: null };
    return { draft: snap.data().draft || {}, savedAt: snap.data().savedAt || null };
  } catch { return { draft: {}, savedAt: null }; }
}

export async function fbSaveDraft(name, splitId, dayKey, draft) {
  try { await setDoc(doc(db, "programs", can(name), "splits", splitId, "drafts", dayKey), { draft, savedAt: Date.now() }); } catch(e) { console.error(e); }
}

export async function fbClearDraft(name, splitId, dayKey) {
  try { await setDoc(doc(db, "programs", can(name), "splits", splitId, "drafts", dayKey), { draft: {} }); } catch(e) { console.error(e); }
}

// ── Push Split to Friend — live link, not a one-time copy ────────────────────

export async function fbPushSplitToUser(ownerName, targetName, split) {
  const c = can(targetName);
  const owner = can(ownerName);
  try {
    const existingSnap = await getDocs(collection(db, "programs", c, "splits"));
    const existing = existingSnap.docs.map(d => d.data());
    const match = existing.find(s => s.name.toLowerCase() === split.name.toLowerCase());
    // Relink an existing same-named split if it's still linked to THIS owner+split,
    // or if it's never been linked/offloaded at all (a copy from before live-sharing
    // existed, or a same-named split they made themselves — safe to upgrade in place).
    // Only refuse to relink when they've explicitly offloaded — that's the one case
    // where clobbering their now-independent copy would actually lose their edits.
    const isLinkedToMe = match?.sharedFrom?.owner === owner && match?.sharedFrom?.splitId === split.id;
    const neverTouched  = match && !match.sharedFrom && !match.offloadedFrom;
    const canRelink = isLinkedToMe || neverTouched;
    const targetId = canRelink ? match.id : newSplitId();
    const target = { ...copy(split), id: targetId, sharedFrom: { owner, splitId: split.id } };
    await setDoc(doc(db, "programs", c, "splits", targetId), target);
  } catch(e) { console.error("fbPushSplitToUser:", e); }
}

// Fetches the owner's split fresh from the server — used to overlay a shared
// split's content on load so edits propagate to anyone it was shared with.
export async function fbLoadSplitFresh(ownerName, splitId) {
  try {
    const snap = await getDocFromServer(doc(db, "programs", can(ownerName), "splits", splitId));
    return snap.exists() ? snap.data() : null;
  } catch(e) { console.error("fbLoadSplitFresh:", e); return null; }
}

// Detaches a shared split into a fully independent copy — no more overlay-on-load.
// Leaves a permanent offloadedFrom marker so a future re-share from the same name
// knows this was a deliberate detach, not just a split that predates live-sharing,
// and won't silently relink over the recipient's independent edits.
export async function fbOffloadSplit(name, splitId) {
  try {
    const snap = await getDoc(doc(db, "programs", can(name), "splits", splitId));
    const prevSharedFrom = snap.exists() ? snap.data().sharedFrom : null;
    await setDoc(doc(db, "programs", can(name), "splits", splitId), { sharedFrom: null, offloadedFrom: prevSharedFrom || true }, { merge: true });
  } catch(e) { console.error(e); }
}

// ── Username registry (optional, for future features) ─────────────────────────

export async function fbRegisterUsername(uid, name) {
  try { await setDoc(doc(db, "usernames", can(name).toLowerCase()), { uid, name: can(name) }); } catch(e) { console.error(e); }
}
