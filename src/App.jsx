import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { newSplitId, slugify, titleCase } from "./constants";
import { nameSimilarity } from "./utils";
import { classifyExerciseRaw, findDuplicateExerciseGroups } from "./ai";
import {
  fbLoadSplitsForUser, fbSaveUserMeta,
  fbSaveSplit, fbDeleteSplit,
  fbPushSplitToUser, fbRegisterUsername,
  fbMigrateExerciseCatalog, fbLoadExerciseCatalog, fbSaveExercise, fbSetExerciseLog, fbDeleteExercise,
  fbLoadSplitFresh, fbOffloadSplit,
} from "./db";
import OnboardScreen from "./components/OnboardScreen";
import HomeScreen from "./components/HomeScreen";
import SettingsScreen from "./components/SettingsScreen";
import DaySelectScreen from "./components/DaySelectScreen";
import PerformanceScreen from "./components/PerformanceScreen";
import EditorScreen from "./components/EditorScreen";
import WorkoutScreen from "./components/WorkoutScreen";

const font = <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />;
const LS_NAME = "stack_user_name";
const can = n => n.trim().charAt(0).toUpperCase() + n.trim().slice(1).toLowerCase();

export default function App() {
  const [screen, setScreen]               = useState("loading");
  const [userName, setUserName]           = useState(null);
  const [splits, setSplits]               = useState([]);
  const [activeSplitId, setActiveSplitId] = useState(null);
  const [settings, setSettings]           = useState({ effortScale: "rir", autoLog: true });
  const [loadingSplits, setLoadingSplits] = useState(false);
  const [activeDay, setActiveDay]         = useState(null);
  const [exerciseCatalog, setExerciseCatalog] = useState([]);
  const [sharedNotice, setSharedNotice] = useState(null);

  const activeSplit   = splits.find(s => s.id === activeSplitId) || splits[0] || null;
  const activeProgram = activeSplit?.program || {};
  const activeDays    = activeSplit?.days || [];

  // Shared splits are a live link, not a one-time copy — on every load, pull the
  // owner's current content and overlay it. Recipient's own sessions/drafts
  // (keyed under their own splitId) are never touched by this.
  const overlaySharedSplits = async (name, splitsList) => {
    const shared = splitsList.filter(s => s.sharedFrom);
    if (shared.length === 0) return splitsList;
    const fetched = await Promise.all(shared.map(s => fbLoadSplitFresh(s.sharedFrom.owner, s.sharedFrom.splitId).then(fresh => ({ s, fresh }))));
    let next = splitsList;
    const notices = [];
    for (const { s, fresh } of fetched) {
      if (!fresh) {
        await fbOffloadSplit(name, s.id);
        notices.push(`"${s.name}" is no longer shared — showing your last synced copy.`);
        next = next.map(x => x.id === s.id ? { ...x, sharedFrom: null } : x);
        continue;
      }
      const merged = { ...s, name: fresh.name, days: fresh.days, program: fresh.program };
      if (JSON.stringify(merged) !== JSON.stringify(s)) {
        await fbSaveSplit(name, merged);
        next = next.map(x => x.id === s.id ? merged : x);
      }
    }
    if (notices.length > 0) setSharedNotice(notices.join(" "));
    return next;
  };

  const refreshCatalog = (name) => fbLoadExerciseCatalog(name).then(catalog => { setExerciseCatalog(catalog); return catalog; });

  // Asks the AI classification endpoint for a muscle group + possible
  // duplicate match against the user's own catalog, resolving a returned
  // duplicate name back to the actual catalog entry (by its deterministic
  // slug id) so callers get the same shape findExerciseCandidates returns.
  // Resilient: any failure just yields nulls, so callers fall back to the
  // local keyword heuristic rather than blocking on the AI call.
  const classifyNewExercise = async (name) => {
    const result = await classifyExerciseRaw(name, exerciseCatalog.map(e => e.name));
    if (!result) return { muscleGroup: null, duplicateEntry: null };
    const duplicateEntry = result.duplicateOf ? (exerciseCatalog.find(e => e.id === slugify(result.duplicateOf)) || null) : null;
    return { muscleGroup: result.muscleGroup || null, duplicateEntry };
  };

  // Backfill pass over existing exercises that predate AI classification —
  // only touches entries still missing a muscleGroup (never overwrites a
  // manual correction), and runs in the background without blocking load.
  // Deliberately NOT gated by a permanent "ran once" flag: a per-exercise
  // failure (API down, no credit yet, etc.) should retry on the next load
  // rather than being marked done forever after a single failed attempt —
  // once an exercise actually gets a muscleGroup, the check above skips it,
  // so this is naturally self-limiting without needing an account-level gate.
  const backfillMuscleGroups = async (name, catalog) => {
    const names = catalog.map(e => e.name);
    for (const entry of catalog) {
      if (entry.muscleGroup) continue;
      const result = await classifyExerciseRaw(entry.name, names.filter(n => n !== entry.name));
      if (!result?.muscleGroup) continue;
      await fbSaveExercise(name, { id: entry.id, muscleGroup: result.muscleGroup });
      setExerciseCatalog(prev => prev.map(e => e.id === entry.id ? { ...e, muscleGroup: result.muscleGroup } : e));
    }
  };

  const loadSplits = (name) => {
    setLoadingSplits(true);
    return fbLoadSplitsForUser(name).then(async ({ splits: s, activeSplitId: id, settings: st }) => {
      const overlaid = await overlaySharedSplits(name, s);
      setSplits(overlaid);
      setActiveSplitId(id);
      if (st) setSettings(st);
      if (overlaid.length > 0) await fbMigrateExerciseCatalog(name, overlaid);
      const catalog = await refreshCatalog(name);
      setLoadingSplits(false);

      if (catalog.some(e => !e.muscleGroup)) backfillMuscleGroups(name, catalog);
    });
  };

  // Resolves a raw exercise name against the catalog: exact-normalized match
  // resolves silently, otherwise the caller shows a DuplicateExerciseModal with
  // candidates and decides merge/new/as-typed — this function never auto-decides.
  const findExerciseCandidates = (rawName) => {
    const id = slugify(rawName);
    const exact = exerciseCatalog.find(e => e.id === id);
    if (exact) return { exact, candidates: [] };
    const name = titleCase(rawName);
    const candidates = exerciseCatalog
      .map(e => ({ entry: e, score: nameSimilarity(name, e.name) }))
      .filter(c => c.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(c => c.entry);
    return { exact: null, candidates };
  };

  const handleSaveExercise = async (exercise) => {
    await fbSaveExercise(userName, exercise);
    setExerciseCatalog(prev => {
      const i = prev.findIndex(e => e.id === exercise.id);
      if (i === -1) return [...prev, exercise];
      // Merge, don't replace — callers only ever pass the few fields they're
      // editing (name/type/muscle group/etc.), and a full replace would wipe
      // the entry's log and subCounts out of local state until next reload.
      const next = [...prev]; next[i] = { ...prev[i], ...exercise }; return next;
    });
  };

  // Corrects one exercise's global log in place — used when editing the most
  // recently logged session, where the old (now-wrong) entry needs replacing
  // rather than a new one appended.
  const handleCorrectExerciseLog = async (exerciseId, log) => {
    await fbSetExerciseLog(userName, exerciseId, log);
    setExerciseCatalog(prev => prev.map(e => e.id === exerciseId ? { ...e, log } : e));
  };

  // Folds one or more duplicate exercise entries (same movement, typed
  // differently — "Inverted Row" / "Inverted Rows") into a single surviving
  // entry: combines their logged history and sub-usage counts, repoints
  // every program slot and every other exercise's subCounts that referenced
  // a duplicate, then deletes the duplicates. The split/catalog edits land
  // together so a failure partway through never leaves slots pointing at an
  // exerciseId that's about to stop existing.
  const handleMergeExercises = async (primaryId, duplicateIds) => {
    const primary = exerciseCatalog.find(e => e.id === primaryId);
    const duplicates = duplicateIds.map(id => exerciseCatalog.find(e => e.id === id)).filter(Boolean);
    if (!primary || duplicates.length === 0) return;

    const mergedLog = [...(primary.log || []), ...duplicates.flatMap(d => d.log || [])];
    const mergedSubCounts = { ...(primary.subCounts || {}) };
    duplicates.forEach(d => Object.entries(d.subCounts || {}).forEach(([id, count]) => {
      mergedSubCounts[id] = (mergedSubCounts[id] || 0) + count;
    }));
    delete mergedSubCounts[primaryId]; // in case a duplicate had somehow recorded the primary as its own sub

    // Any other exercise that recorded a duplicate as a frequent sub needs
    // that count redirected to the primary instead.
    const subRedirects = [];
    exerciseCatalog.forEach(e => {
      if (e.id === primaryId || duplicateIds.includes(e.id)) return;
      const sc = e.subCounts || {};
      if (!duplicateIds.some(id => sc[id])) return;
      const next = { ...sc };
      duplicateIds.forEach(id => { if (next[id]) { next[primaryId] = (next[primaryId] || 0) + next[id]; delete next[id]; } });
      subRedirects.push({ id: e.id, subCounts: next });
    });

    // Repoint every program slot across every split that pointed at a
    // duplicate, so future logging goes to the merged entry.
    const updatedSplits = splits.map(split => {
      let changed = false;
      const program = { ...split.program };
      Object.keys(program).forEach(dayKey => {
        const exs = (program[dayKey]?.exercises || []).map(slot => {
          if (!duplicateIds.includes(slot.exerciseId)) return slot;
          changed = true;
          return { ...slot, exerciseId: primaryId };
        });
        program[dayKey] = { ...program[dayKey], exercises: exs };
      });
      return changed ? { ...split, program } : split;
    });

    await fbSaveExercise(userName, { id: primaryId, log: mergedLog, subCounts: mergedSubCounts });
    for (const r of subRedirects) await fbSaveExercise(userName, { id: r.id, subCounts: r.subCounts });
    for (const split of updatedSplits) {
      const original = splits.find(s => s.id === split.id);
      if (split !== original) await fbSaveSplit(userName, split);
    }
    for (const id of duplicateIds) await fbDeleteExercise(userName, id);

    setSplits(updatedSplits);
    setExerciseCatalog(prev => prev
      .filter(e => !duplicateIds.includes(e.id))
      .map(e => {
        if (e.id === primaryId) return { ...e, log: mergedLog, subCounts: mergedSubCounts };
        const redirect = subRedirects.find(r => r.id === e.id);
        return redirect ? { ...e, subCounts: redirect.subCounts } : e;
      }));
  };

  // Load splits + settings whenever we know the user's name
  useEffect(() => {
    if (!userName) return;
    loadSplits(userName);
  }, [userName]);

  const handleRefresh = () => { if (userName) loadSplits(userName); };

  // Auth: anonymous Firebase auth just for Firestore security rules.
  // User identity comes from localStorage name, NOT from the Firebase UID.
  useEffect(() => {
    const cached = localStorage.getItem(LS_NAME);
    if (cached) {
      setUserName(can(cached));
      setScreen("home");
    }

    const unsub = onAuthStateChanged(auth, fbUser => {
      if (fbUser) {
        const name = localStorage.getItem(LS_NAME);
        if (name) fbRegisterUsername(fbUser.uid, name);
        if (!cached) setScreen(s => s === "loading" ? "onboard" : s);
      } else {
        signInAnonymously(auth);
      }
    });

    const timeout = setTimeout(() => setScreen(s => s === "loading" ? "onboard" : s), 5000);
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  const handleOnboard = (name) => {
    const c = can(name);
    localStorage.setItem(LS_NAME, c);
    setUserName(c);  // triggers split load effect, which migrates old data automatically
    setScreen("home");
  };

  const handleChangeName = (name) => {
    const c = can(name);
    localStorage.setItem(LS_NAME, c);
    setUserName(c);
    setScreen("home");
  };

  const handleSwitchSplit = (splitId) => {
    setActiveSplitId(splitId);
    setActiveDay(null);
    fbSaveUserMeta(userName, { activeSplitId: splitId });
  };

  const handleCreateSplit = (name) => {
    const id = newSplitId();
    const s = { id, name, days: [], program: {}, createdAt: Date.now() };
    setSplits(prev => [...prev, s]);
    setActiveSplitId(id);
    setActiveDay(null);
    fbSaveSplit(userName, s);
    fbSaveUserMeta(userName, { activeSplitId: id });
  };

  const handleSaveSplit = async (updatedSplit) => {
    await fbSaveSplit(userName, updatedSplit);
    setSplits(prev => prev.map(s => s.id === updatedSplit.id ? updatedSplit : s));
  };

  // Permanently adds an exercise (built via AddModal mid-session) onto a day's
  // program going forward — same effect as adding it in the split editor,
  // just triggered from the workout screen instead.
  const handleAddExerciseToDay = async (dayKey, slot) => {
    if (!activeSplit) return;
    const day = activeSplit.program[dayKey] || { exercises: [] };
    const updated = { ...activeSplit, program: { ...activeSplit.program, [dayKey]: { ...day, exercises: [...(day.exercises || []), slot] } } };
    await handleSaveSplit(updated);
  };

  const handleReorderDays = (newDays) => {
    if (!activeSplit) return;
    const updated = { ...activeSplit, days: newDays };
    setSplits(prev => prev.map(s => s.id === activeSplit.id ? updated : s));
    fbSaveSplit(userName, updated);
  };

  const handleDeleteSplit = (splitId) => {
    const remaining = splits.filter(s => s.id !== splitId);
    setSplits(remaining);
    if (activeSplitId === splitId) {
      const next = remaining[0]?.id || null;
      setActiveSplitId(next);
      fbSaveUserMeta(userName, { activeSplitId: next });
    }
    fbDeleteSplit(userName, splitId);
  };

  const handleUpdateSetting = (key, val) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    fbSaveUserMeta(userName, { [key]: val });
  };

  const handlePushSplitToUser = async (targetName, split) => {
    await fbPushSplitToUser(userName, targetName, split);
  };

  const handleOffloadSplit = async (splitId) => {
    await fbOffloadSplit(userName, splitId);
    setSplits(prev => prev.map(s => s.id === splitId ? { ...s, sharedFrom: null } : s));
  };

  const handleSignOut = () => {
    localStorage.removeItem(LS_NAME);
    window.location.reload();
  };

  if (screen === "loading") return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100dvh", fontFamily:"Barlow,sans-serif", background:"#f5f5f5" }}>
      {font}<div style={{ fontSize:48, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.04em" }}>STACK</div>
    </div>
  );

  if (screen === "onboard") return <OnboardScreen onSave={handleOnboard} />;

  if (screen === "home") return (
    <div style={{ height:"100dvh" }}>{font}
      <HomeScreen
        userName={userName}
        splits={splits}
        activeSplitId={activeSplitId}
        loadingSplits={loadingSplits}
        onSelectSplit={id => { handleSwitchSplit(id); setScreen("dayselect"); }}
        onCreateSplit={name => { handleCreateSplit(name); setScreen("dayselect"); }}
        onSettings={() => setScreen("settings")}
        onPerformance={() => setScreen("performance")}
        onDeleteSplit={handleDeleteSplit}
        onRefresh={handleRefresh}
        sharedNotice={sharedNotice}
        onDismissSharedNotice={() => setSharedNotice(null)}
      />
    </div>
  );

  if (screen === "settings") return (
    <div style={{ height:"100dvh" }}>{font}
      <SettingsScreen
        userName={userName}
        settings={settings}
        onUpdate={handleUpdateSetting}
        onBack={() => setScreen("home")}
        onChangeName={handleChangeName}
        onSignOut={handleSignOut}
        exerciseCatalog={exerciseCatalog}
        onFindDuplicateExercises={() => findDuplicateExerciseGroups(exerciseCatalog.map(e => e.name))}
        onMergeExercises={handleMergeExercises}
      />
    </div>
  );

  if (screen === "dayselect") return (
    <div style={{ height:"100dvh" }}>{font}
      <DaySelectScreen
        activeSplit={activeSplit}
        activeDays={activeDays}
        activeProgram={activeProgram}
        userName={userName}
        onSelectDay={dk => { setActiveDay(dk); setScreen("workout"); }}
        onEditor={() => setScreen("editor")}
        onReorderDays={handleReorderDays}
        onBack={() => setScreen("home")}
        onShareSplit={handlePushSplitToUser}
        onOffloadSplit={handleOffloadSplit}
      />
    </div>
  );

  if (screen === "performance") return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>{font}
      <PerformanceScreen
        userName={userName}
        splitId={activeSplit?.id || null}
        program={activeProgram}
        exerciseCatalog={exerciseCatalog}
        onBack={() => setScreen("home")}
      />
    </div>
  );

  if (screen === "editor") return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>{font}
      <EditorScreen
        split={activeSplit}
        onSave={handleSaveSplit}
        onBack={() => setScreen("dayselect")}
        findExerciseCandidates={findExerciseCandidates}
        onSaveExercise={handleSaveExercise}
        classifyNewExercise={classifyNewExercise}
        defaultEffortScale={settings.effortScale}
      />
    </div>
  );

  return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>{font}
      {loadingSplits ? (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100dvh", fontFamily:"Barlow,sans-serif", color:"#bbb" }}>Loading...</div>
      ) : (
        <WorkoutScreen
          userName={userName}
          splitId={activeSplit?.id || null}
          program={activeProgram}
          days={activeDays}
          effortScale={settings.effortScale}
          autoLog={settings.autoLog}
          onBack={() => setScreen("dayselect")}
          initDay={activeDay}
          exerciseCatalog={exerciseCatalog}
          splits={splits}
          findExerciseCandidates={findExerciseCandidates}
          onSaveExercise={handleSaveExercise}
          onCorrectExerciseLog={handleCorrectExerciseLog}
          onRefreshCatalog={() => refreshCatalog(userName)}
          onAddExerciseToDay={handleAddExerciseToDay}
          classifyNewExercise={classifyNewExercise}
        />
      )}
    </div>
  );
}
