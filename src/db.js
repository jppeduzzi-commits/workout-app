import { db } from "./firebase";
import { doc, getDoc, getDocFromServer, setDoc, getDocs, deleteDoc, collection } from "firebase/firestore";
import { copy } from "./constants";

// Primary data key is the user's canonical NAME, not Firebase UID.
// UID is anonymous and device-specific — name works across any device.
//
// Firestore paths:
//   programs/{name}                              → { activeSplitId, showRIR, autoLog, autoLogHours }
//   programs/{name}/splits/{splitId}             → { id, name, days, program, createdAt }
//   programs/{name}/splits/{splitId}/sessions/{dayKey} → { sessions: [] }
//   programs/{name}/splits/{splitId}/drafts/{dayKey}   → { draft: {}, savedAt }
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
        settings: { showRIR: meta.showRIR !== false, autoLog: meta.autoLog !== false, autoLogHours: meta.autoLogHours || 4 },
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
    const settings = { showRIR: s.showRIR !== false, autoLog: s.autoLog !== false, autoLogHours: s.autoLogHours || 4 };

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

// ── Push Split to Friend ──────────────────────────────────────────────────────

export async function fbPushSplitToUser(targetName, split) {
  const c = can(targetName);
  try {
    const existingSnap = await getDocs(collection(db, "programs", c, "splits"));
    const existing = existingSnap.docs.map(d => d.data());
    const match = existing.find(s => s.name.toLowerCase() === split.name.toLowerCase());
    const target = match ? { ...copy(split), id: match.id } : copy(split);
    await setDoc(doc(db, "programs", c, "splits", target.id), target);
  } catch(e) { console.error("fbPushSplitToUser:", e); }
}

// ── Username registry (optional, for future features) ─────────────────────────

export async function fbRegisterUsername(uid, name) {
  try { await setDoc(doc(db, "usernames", can(name).toLowerCase()), { uid, name: can(name) }); } catch(e) { console.error(e); }
}
