import { db } from "./firebase";
import { doc, getDoc, getDocFromServer, setDoc, getDocs, deleteDoc, collection } from "firebase/firestore";
import { copy } from "./constants";

// ── User Profile ──────────────────────────────────────────────────────────────
// users/{uid}: { name, activeSplitId, showRIR, autoLog, autoLogHours, createdAt }

export async function fbLoadProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) { console.error("fbLoadProfile:", e); return null; }
}

export async function fbSaveProfile(uid, data) {
  try { await setDoc(doc(db, "users", uid), data, { merge: true }); } catch (e) { console.error(e); }
}

// ── Username Registry ─────────────────────────────────────────────────────────
// usernames/{name_lowercase}: { uid }  — enables push-to-friend by name

export async function fbRegisterUsername(uid, name) {
  try { await setDoc(doc(db, "usernames", name.toLowerCase()), { uid }); } catch (e) { console.error(e); }
}

export async function fbLookupUidByName(name) {
  try {
    const snap = await getDoc(doc(db, "usernames", name.toLowerCase()));
    return snap.exists() ? snap.data().uid : null;
  } catch (e) { console.error(e); return null; }
}

// ── Splits ────────────────────────────────────────────────────────────────────
// users/{uid}/splits/{splitId}: { id, name, days, program, createdAt }
// Each split is isolated — corrupting one can never affect another.

export async function fbLoadSplits(uid) {
  try {
    const snap = await getDocs(collection(db, "users", uid, "splits"));
    return snap.docs.map(d => d.data());
  } catch (e) { console.error("fbLoadSplits:", e); return []; }
}

export async function fbSaveSplit(uid, split) {
  try { await setDoc(doc(db, "users", uid, "splits", split.id), split); } catch (e) { console.error(e); }
}

export async function fbDeleteSplit(uid, splitId) {
  try { await deleteDoc(doc(db, "users", uid, "splits", splitId)); } catch (e) { console.error(e); }
}

// ── Sessions ──────────────────────────────────────────────────────────────────
// users/{uid}/splits/{splitId}/sessions/{dayKey}: { sessions: [] }

export async function fbLoadSessions(uid, splitId, dayKey) {
  try {
    const snap = await getDocFromServer(doc(db, "users", uid, "splits", splitId, "sessions", dayKey));
    return snap.exists() ? (snap.data().sessions || []) : [];
  } catch (e) { console.error("fbLoadSessions:", e); return []; }
}

export async function fbSaveSessions(uid, splitId, dayKey, sessions) {
  try { await setDoc(doc(db, "users", uid, "splits", splitId, "sessions", dayKey), { sessions }); } catch (e) { console.error(e); }
}

// ── Drafts ────────────────────────────────────────────────────────────────────
// users/{uid}/splits/{splitId}/drafts/{dayKey}: { draft: {}, savedAt }

export async function fbLoadDraft(uid, splitId, dayKey) {
  try {
    const snap = await getDoc(doc(db, "users", uid, "splits", splitId, "drafts", dayKey));
    if (!snap.exists()) return { draft: {}, savedAt: null };
    return { draft: snap.data().draft || {}, savedAt: snap.data().savedAt || null };
  } catch { return { draft: {}, savedAt: null }; }
}

export async function fbSaveDraft(uid, splitId, dayKey, draft) {
  try { await setDoc(doc(db, "users", uid, "splits", splitId, "drafts", dayKey), { draft, savedAt: Date.now() }); } catch (e) { console.error(e); }
}

export async function fbClearDraft(uid, splitId, dayKey) {
  try { await setDoc(doc(db, "users", uid, "splits", splitId, "drafts", dayKey), { draft: {} }); } catch (e) { console.error(e); }
}

// ── One-time Migration from Legacy Structure ──────────────────────────────────
// Old: programs/{name}, sessions/{name}_{dayKey}, drafts/{name}_{dayKey}, settings/{name}
// New: users/{uid}/splits/{splitId}/sessions/{dayKey} etc.
// Runs once on first onboard. Returns true if old data was found and migrated.

export async function fbMigrateFromLegacy(uid, name) {
  const canonical = name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase();
  try {
    const progSnap = await getDocFromServer(doc(db, "programs", canonical));

    if (!progSnap.exists()) {
      // No legacy data — write a fresh profile
      await setDoc(doc(db, "users", uid), {
        name: canonical, activeSplitId: null,
        showRIR: true, autoLog: true, autoLogHours: 4,
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, "usernames", canonical.toLowerCase()), { uid });
      return false;
    }

    const data = progSnap.data();
    let splitsDoc;
    if (Array.isArray(data.splits)) {
      splitsDoc = data;
    } else {
      const program = data.program || data;
      const days = Object.keys(program).filter(k => program[k]?.exercises);
      splitsDoc = {
        activeSplitId: "default",
        splits: [{ id: "default", name: "Athletic Hypertrophy Split", days, program: copy(program) }],
      };
    }

    const settingsSnap = await getDoc(doc(db, "settings", canonical));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};

    await setDoc(doc(db, "users", uid), {
      name: canonical,
      activeSplitId: splitsDoc.activeSplitId || splitsDoc.splits[0]?.id || null,
      showRIR: settings.showRIR !== false,
      autoLog: settings.autoLog !== false,
      autoLogHours: settings.autoLogHours || 4,
      createdAt: new Date().toISOString(),
    });
    await setDoc(doc(db, "usernames", canonical.toLowerCase()), { uid });

    for (const split of splitsDoc.splits) {
      await setDoc(doc(db, "users", uid, "splits", split.id), split);
      for (const dayKey of (split.days || [])) {
        const sessSnap = await getDoc(doc(db, "sessions", `${canonical}_${dayKey}`));
        if (sessSnap.exists()) {
          const sessions = sessSnap.data().sessions || [];
          if (sessions.length > 0)
            await setDoc(doc(db, "users", uid, "splits", split.id, "sessions", dayKey), { sessions });
        }
        const draftSnap = await getDoc(doc(db, "drafts", `${canonical}_${dayKey}`));
        if (draftSnap.exists() && draftSnap.data().draft)
          await setDoc(doc(db, "users", uid, "splits", split.id, "drafts", dayKey), {
            draft: draftSnap.data().draft, savedAt: draftSnap.data().savedAt || null,
          });
      }
    }

    return true;
  } catch (e) {
    console.error("fbMigrateFromLegacy:", e);
    try {
      await setDoc(doc(db, "users", uid), {
        name: canonical, activeSplitId: null,
        showRIR: true, autoLog: true, autoLogHours: 4,
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, "usernames", canonical.toLowerCase()), { uid });
    } catch {}
    return false;
  }
}

// ── Push Split to Friend ──────────────────────────────────────────────────────
// One-way: Josh pushes his split to AJ. Overwrites by name match to preserve
// AJ's session history (same split name = same split, keep existing ID).

export async function fbPushSplitToUser(targetUid, split) {
  try {
    const existingSnap = await getDocs(collection(db, "users", targetUid, "splits"));
    const existing = existingSnap.docs.map(d => d.data());
    const match = existing.find(s => s.name.toLowerCase() === split.name.toLowerCase());
    const targetSplit = match
      ? { ...copy(split), id: match.id }
      : copy(split);
    await setDoc(doc(db, "users", targetUid, "splits", targetSplit.id), targetSplit);
  } catch (e) { console.error("fbPushSplitToUser:", e); }
}
