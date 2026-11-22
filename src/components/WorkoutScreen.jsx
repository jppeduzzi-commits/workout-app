import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { TODAY, TODAYFMT, fmtDate, parseDateStr, AUTO_LOG_HOURS, copy, inferMuscleGroup } from "../constants";
import { sumReps } from "../utils";
import { fbLoadSessions, fbSaveSessions, fbLoadDraft, fbSaveDraft, fbClearDraft, fbAppendExerciseLog, fbRecordSubUsage } from "../db";
import ExerciseLogRow from "./ExerciseLogRow";
import AnalysisScreen from "./AnalysisScreen";
import AddModal from "./AddModal";

export default function WorkoutScreen({ userName, splitId, program, days, onBack, initDay, effortScale, autoLog, exerciseCatalog, splits, findExerciseCandidates, onSaveExercise, onCorrectExerciseLog, onRefreshCatalog, onAddExerciseToDay, classifyNewExercise }) {
  const [activeDay, setActiveDay] = useState(initDay);
  const [sessions, setSessions] = useState([]);
  const [current, setCurrent] = useState({});
  // Exercises added mid-session via "+ Add exercise" that are logged for
  // today only — never written into the split's program. Restored from the
  // session/draft they were saved under, cleared once a fresh day is opened.
  const [extraExercises, setExtraExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [autoLoggedMsg, setAutoLoggedMsg] = useState("");
  const [analysisEx, setAnalysisEx] = useState(null);
  const [confirmLog, setConfirmLog] = useState(false);
  const [editingSession, setEditingSession] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingNewExercise, setPendingNewExercise] = useState(null);
  const autoSaveTimer = useRef(null);
  const programDays = days?.length ? days : Object.keys(program);
  const curDay      = program[activeDay];
  const lastSession = sessions[sessions.length - 1] || null;
  // Program-defined exercises plus anything added just for this session —
  // the single source of truth for rendering and for logging/correcting history.
  const allExercises = [...(curDay?.exercises || []), ...extraExercises];

  useEffect(() => {
    if (!userName || !splitId) return;
    setLoading(true); setCurrent({}); setExtraExercises([]); setEditingSession(false);
    // Catalog-backed "last time" data (prevEntry below) is otherwise only
    // fetched once when the app first boots, so a device that keeps the app
    // alive in the background for days (common on Android) can show stale
    // or missing "LAST" numbers even though session history itself — which
    // is always fetched fresh — is fine. Refetch it every time a day is
    // opened so it's never more stale than the session list.
    onRefreshCatalog?.();
    Promise.all([
      fbLoadSessions(userName, splitId, activeDay),
      fbLoadDraft(userName, splitId, activeDay),
    ]).then(([s, { draft, savedAt }]) => {
      setSessions(s);
      // Drafts were historically just a flat entries map; `.entries` is only
      // present on drafts saved by the mid-session "add exercise" feature.
      const draftEntries = draft?.entries || draft || {};
      const draftExtras  = draft?.extraExercises || [];
      const hasMeaningfulData = Object.values(draftEntries).some(e => e?.sets?.some(s => s.weight || s.reps || s.laps));
      const thresholdMs = AUTO_LOG_HOURS * 3600000;
      const shouldAutoLog = autoLog !== false && savedAt && hasMeaningfulData && (Date.now() - savedAt) > thresholdMs;
      if (shouldAutoLog) {
        const d = new Date(savedAt);
        const dateStr = `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
        const nextSessions = [...s, { date: dateStr, entries: draftEntries, extraExercises: draftExtras }];
        fbSaveSessions(userName, splitId, activeDay, nextSessions);
        fbClearDraft(userName, splitId, activeDay);
        setSessions(nextSessions);
        const hoursAgo = Math.round((Date.now() - savedAt) / 3600000);
        setAutoLoggedMsg(`✓ Auto-logged ${activeDay} from ${hoursAgo}h ago`);
        setTimeout(() => setAutoLoggedMsg(""), 5000);
      } else if (hasMeaningfulData) {
        setCurrent(draftEntries);
        setExtraExercises(draftExtras);
      }
      setLoading(false);
    });
  }, [userName, splitId, activeDay]);

  const handleChange = useCallback((exId, val) => {
    setCurrent(c => {
      const next = { ...c, [exId]: val };
      // Don't autosave into the "today" draft while editing a past session —
      // abandoning the edit shouldn't leave stray data that later auto-logs.
      if (!editingSession) {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(async () => {
          await fbSaveDraft(userName, splitId, activeDay, { entries: next, extraExercises });
          setAutoSaved(true);
          setTimeout(() => setAutoSaved(false), 1500);
        }, 800);
      }
      return next;
    });
    setSaved(false);
  }, [userName, splitId, activeDay, editingSession, extraExercises]);

  // "+ Add exercise": AddModal builds the slot, then a scope choice decides
  // whether it's a one-off for today's log or should stick to the program.
  const handleAddExerciseBuilt = (ex) => {
    setShowAddModal(false);
    setPendingNewExercise(ex);
  };

  const confirmAddToday = () => {
    if (!pendingNewExercise) return;
    const next = [...extraExercises, pendingNewExercise];
    setExtraExercises(next);
    if (!editingSession) fbSaveDraft(userName, splitId, activeDay, { entries: current, extraExercises: next });
    setPendingNewExercise(null);
  };

  const confirmAddPermanent = async () => {
    if (!pendingNewExercise) return;
    await onAddExerciseToDay?.(activeDay, pendingNewExercise);
    setPendingNewExercise(null);
  };

  const handleRemoveExtra = (exId) => {
    const next = extraExercises.filter(e => e.id !== exId);
    setExtraExercises(next);
    const nextCurrent = { ...current }; delete nextCurrent[exId];
    setCurrent(nextCurrent);
    if (!editingSession) fbSaveDraft(userName, splitId, activeDay, { entries: nextCurrent, extraExercises: next });
  };

  const catalogById = useMemo(() => {
    const m = {};
    (exerciseCatalog || []).forEach(e => { m[e.id] = e; });
    return m;
  }, [exerciseCatalog]);

  // Global, cross-split history lookup by exerciseId — not scoped to this split/day.
  const getPrev = (exerciseId) => {
    if (!exerciseId) return null;
    const log = catalogById[exerciseId]?.log || [];
    if (log.length === 0) return null;
    const latest = [...log].sort((a, b) => (parseDateStr(b.date)?.getTime() || 0) - (parseDateStr(a.date)?.getTime() || 0))[0];
    const fromOtherSplit = latest.splitId && latest.splitId !== splitId;
    const viaSplit = fromOtherSplit ? (splits || []).find(s => s.id === latest.splitId)?.name || null : null;
    return { sets: latest.sets, note: latest.note, isSub: latest.isSub, subName: latest.subName, repCounter: latest.repCounter, repGoal: latest.repGoal, repTotal: latest.repTotal, _viaSplit: viaSplit };
  };

  // Substitution suggestions for one exercise: your own most-used subs for
  // it specifically (from subCounts, recorded whenever a sub gets logged),
  // then other exercises you already have in the same muscle group.
  const getSubSuggestions = (exerciseId) => {
    if (!exerciseId) return { group: null, recent: [], others: [] };
    const entry = catalogById[exerciseId];
    const group = entry?.muscleGroup || inferMuscleGroup(entry?.name || "");
    const recent = Object.entries(entry?.subCounts || {})
      .filter(([id, count]) => id !== exerciseId && count > 0 && catalogById[id])
      .map(([id, count]) => ({ id, count, name: catalogById[id].name }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const recentIds = new Set(recent.map(r => r.id));
    // "Other" is a catch-all for anything unclassified, not a real muscle
    // group — grouping by it would surface unrelated exercises, so only
    // offer the "other X exercises" browse list for a real group.
    const others = group === "Other" ? [] : (exerciseCatalog || [])
      .filter(e => e.id !== exerciseId && !recentIds.has(e.id) && (e.muscleGroup || inferMuscleGroup(e.name)) === group)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8)
      .map(e => ({ id: e.id, name: e.name }));
    return { group, recent, others };
  };

  const handleSave = async () => {
    setConfirmLog(false);
    setSaving(true);
    const date = TODAY();
    const next = [...sessions, { date, entries: current, extraExercises }];
    await fbSaveSessions(userName, splitId, activeDay, next);
    await fbClearDraft(userName, splitId, activeDay);

    // Mirror each logged exercise into the global catalog log, keyed by
    // resolved identity — substitutions redirect to their own exerciseId.
    // Includes anything added mid-session, not just the program's own list.
    allExercises.forEach((ex, index) => {
      const entry = current[ex.id];
      if (!entry) return;
      const hasData = entry.sets?.some(s => s.weight || s.perf || s.weight2 || s.perf2 || s.bw || s.bw2);
      if (!hasData) return;
      const targetId = entry.subExerciseId || ex.exerciseId;
      if (!targetId) return;
      const logEntry = { date, splitId, dayKey: activeDay, exerciseIndex: index, sets: entry.sets, note: entry.note || null, isSub: entry.isSub || false, subName: entry.subName || null, repCounter: entry.repCounter || false, repGoal: entry.repCounter ? (entry.repGoal || null) : null, repTotal: entry.repCounter ? sumReps(entry.sets) : null };
      fbAppendExerciseLog(userName, targetId, logEntry);
      // Tally this as a real-world "frequent sub" for the original exercise,
      // so next time it's suggested in the substitution dropdown.
      if (entry.isSub && entry.subExerciseId && ex.exerciseId && entry.subExerciseId !== ex.exerciseId) {
        fbRecordSubUsage(userName, ex.exerciseId, entry.subExerciseId);
      }
    });

    setSessions(next); setCurrent({}); setExtraExercises([]);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Reopens only the most recently logged session for this day — pre-filled
  // exactly as submitted, so a forgotten exercise or a typo can be fixed
  // without starting a fresh session.
  const handleEditLastSession = () => {
    if (!lastSession) return;
    setCurrent(copy(lastSession.entries || {}));
    setExtraExercises(copy(lastSession.extraExercises || []));
    setEditingSession(true);
  };

  const handleCancelEdit = () => {
    setCurrent({});
    setExtraExercises([]);
    setEditingSession(false);
  };

  const handleSaveEditedSession = async () => {
    setConfirmLog(false);
    setSaving(true);
    const lastIdx = sessions.length - 1;
    const oldSession = sessions[lastIdx];
    const nextSessions = sessions.map((sess, idx) => idx === lastIdx ? { ...sess, entries: current, extraExercises } : sess);
    await fbSaveSessions(userName, splitId, activeDay, nextSessions);

    // Correct each affected exercise's global log in place — the old entry
    // for this exact session gets removed and the new one added, rather than
    // just appending (which would leave the old, now-wrong numbers behind).
    // oldSession's own extraExercises cover anything that was added when it
    // was originally logged, even if since removed from the current edit.
    const exs = [...allExercises, ...(oldSession.extraExercises || [])].filter((ex, i, arr) => arr.findIndex(e => e.id === ex.id) === i);
    const removalsByExId = {};
    const additionsByExId = {};
    exs.forEach((ex, index) => {
      const oldEntry = oldSession.entries?.[ex.id];
      const newEntry = current[ex.id];
      const oldHasData = oldEntry?.sets?.some(s => s.weight || s.perf || s.weight2 || s.perf2 || s.bw || s.bw2);
      const newHasData = newEntry?.sets?.some(s => s.weight || s.perf || s.weight2 || s.perf2 || s.bw || s.bw2);
      const oldTargetId = oldHasData ? (oldEntry.subExerciseId || ex.exerciseId) : null;
      const newTargetId = newHasData ? (newEntry.subExerciseId || ex.exerciseId) : null;
      if (oldTargetId) {
        (removalsByExId[oldTargetId] = removalsByExId[oldTargetId] || []).push({ splitId, dayKey: activeDay, exerciseIndex: index, date: oldSession.date });
      }
      if (newTargetId) {
        (additionsByExId[newTargetId] = additionsByExId[newTargetId] || []).push({ date: oldSession.date, splitId, dayKey: activeDay, exerciseIndex: index, sets: newEntry.sets, note: newEntry.note || null, isSub: newEntry.isSub || false, subName: newEntry.subName || null, repCounter: newEntry.repCounter || false, repGoal: newEntry.repCounter ? (newEntry.repGoal || null) : null, repTotal: newEntry.repCounter ? sumReps(newEntry.sets) : null });
      }
      // Only tally when the sub actually changed from what was there before —
      // re-saving the same edit repeatedly shouldn't keep inflating the count.
      if (newEntry?.isSub && newEntry.subExerciseId && ex.exerciseId && newEntry.subExerciseId !== ex.exerciseId && newEntry.subExerciseId !== oldEntry?.subExerciseId) {
        fbRecordSubUsage(userName, ex.exerciseId, newEntry.subExerciseId);
      }
    });

    const touchedIds = new Set([...Object.keys(removalsByExId), ...Object.keys(additionsByExId)]);
    for (const exId of touchedIds) {
      const removals = removalsByExId[exId] || [];
      const existingLog = catalogById[exId]?.log || [];
      const filtered = existingLog.filter(le => !removals.some(r =>
        le.splitId === r.splitId && le.dayKey === r.dayKey && le.exerciseIndex === r.exerciseIndex && le.date === r.date
      ));
      const nextLog = [...filtered, ...(additionsByExId[exId] || [])];
      if (onCorrectExerciseLog) await onCorrectExerciseLog(exId, nextLog);
    }

    setSessions(nextSessions); setCurrent({}); setEditingSession(false);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (analysisEx) return <AnalysisScreen ex={analysisEx} log={catalogById[analysisEx.exerciseId]?.log || []} onBack={() => setAnalysisEx(null)} />;

  return (
    <div style={{ fontFamily:"Barlow,sans-serif", display:"flex", flexDirection:"column", height:"100dvh" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px", borderBottom:"1px solid #e8e8e8", background:"#fff", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:20, cursor:"pointer", padding:0 }}>←</button>
          <div>
            <span style={{ fontSize:15, fontWeight:800, color:"#0a0a0a" }}>{userName}</span>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:6, padding:"9px 14px", overflowX:"auto", borderBottom:"1px solid #e8e8e8", background:"#fff", flexShrink:0 }}>
        {programDays.map(dk => (
          <button key={dk} onClick={() => setActiveDay(dk)} style={{ background:activeDay===dk?"#0a0a0a":"#f5f5f5", color:activeDay===dk?"#fff":"#888", border:`1.5px solid ${activeDay===dk?"#0a0a0a":"#e8e8e8"}`, borderRadius:8, padding:"5px 12px", fontSize:11, fontFamily:"inherit", fontWeight:activeDay===dk?700:500, cursor:"pointer", whiteSpace:"nowrap" }}>{dk}</button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 16px", background:"#f5f5f5" }}>
        {!curDay ? (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#bbb" }}>
            <div style={{ fontSize:13 }}>Loading workout...</div>
          </div>
        ) : <>
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
            <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.08em", textTransform:"uppercase" }}>{curDay.subtitle}</div>
            {curDay.goal && (
              <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:4, letterSpacing:"0.06em", textTransform:"uppercase",
                background:curDay.goal==="hypertrophy"?"#f0fdf4":"#eff6ff",
                color:curDay.goal==="hypertrophy"?"#15803d":"#1d4ed8",
                border:`1px solid ${curDay.goal==="hypertrophy"?"#bbf7d0":"#bfdbfe"}` }}>
                {curDay.goal === "hypertrophy" ? "Hypertrophy" : "Athletic"}
              </span>
            )}
          </div>
          <div style={{ fontSize:22, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.03em" }}>{curDay.label}</div>
          <div style={{ display:"flex", gap:12, marginTop:5, flexWrap:"wrap" }}>
            {lastSession && <div style={{ fontSize:11, color:"#bbb" }}>Last: <span style={{ color:"#888", fontWeight:600 }}>{fmtDate(lastSession.date)}</span></div>}
            <div style={{ fontSize:11, color:"#bbb" }}>Today: <span style={{ color:"#888", fontWeight:600 }}>{TODAYFMT()}</span></div>
          </div>
          {autoSaved && <div style={{ fontSize:10, color:"#16a34a", marginTop:4 }}>● Draft saved</div>}
          {autoLoggedMsg && <div style={{ fontSize:11, color:"#16a34a", fontWeight:700, marginTop:6, padding:"6px 10px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8 }}>{autoLoggedMsg}</div>}
          {lastSession && !editingSession && !loading && (
            <button onClick={handleEditLastSession} style={{ display:"block", background:"none", border:"none", color:"#2563eb", fontSize:11, fontWeight:700, cursor:"pointer", padding:0, marginTop:8 }}>
              ✏️ Edit last logged session
            </button>
          )}
          {editingSession && (
            <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"9px 12px", marginTop:8, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
              <span style={{ fontSize:11, color:"#1d4ed8", fontWeight:700 }}>Editing your last logged session — this will update it in place, not create a new one</span>
              <button onClick={handleCancelEdit} style={{ background:"none", border:"none", color:"#1d4ed8", fontSize:11, fontWeight:800, cursor:"pointer", flexShrink:0 }}>Cancel</button>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign:"center", color:"#bbb", padding:40, fontSize:13 }}>Loading...</div>
        ) : <>{allExercises.map(ex => (
          <ExerciseLogRow key={ex.id} ex={ex}
            entry={current[ex.id] || null}
            prevEntry={getPrev(ex.exerciseId)}
            subPrevEntry={getPrev(current[ex.id]?.subExerciseId)}
            subSuggestions={getSubSuggestions(ex.exerciseId)}
            onChange={val => handleChange(ex.id, val)}
            sessions={sessions}
            effortScale={effortScale}
            findExerciseCandidates={findExerciseCandidates}
            onSaveExercise={onSaveExercise}
            classifyNewExercise={classifyNewExercise}
            onViewAnalysis={() => setAnalysisEx(ex)}
            isAdHoc={extraExercises.some(e => e.id === ex.id)}
            onRemove={() => handleRemoveExtra(ex.id)}
          />
        ))}

        <button onClick={() => setShowAddModal(true)} style={{ width:"100%", padding:12, background:"#fff", border:"1.5px dashed #d1d5db", borderRadius:12, color:"#888", fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer", marginBottom:8 }}>
          + Add exercise
        </button>
        </>}

        {!loading && curDay.cardio && (
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#15803d", fontWeight:600, marginBottom:8 }}>
            🏃 Cardio — {curDay.cardio}
          </div>
        )}
        </>}
      </div>

      <div style={{ padding:"12px 14px 16px", background:"#fff", borderTop:"1px solid #e8e8e8", flexShrink:0 }}>
        <button onClick={() => setConfirmLog(true)} disabled={saving} style={{ width:"100%", padding:14, background:saved?"#16a34a":"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontSize:13, fontWeight:800, fontFamily:"inherit", cursor:saving?"wait":"pointer", letterSpacing:"0.06em" }}>
          {saving ? "SAVING..." : saved ? "✓ SESSION SAVED" : editingSession ? "SAVE CHANGES" : "LOG SESSION"}
        </button>
      </div>

      {confirmLog && (
        <div onClick={() => setConfirmLog(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#fff", borderRadius:"18px 18px 0 0", padding:"24px 20px 40px", fontFamily:"Barlow,sans-serif" }}>
            <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a", marginBottom:6 }}>{editingSession ? "Save changes?" : "Log this session?"}</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:20, lineHeight:1.5 }}>
              {editingSession
                ? <>This updates your last logged session for <strong>{curDay?.label}</strong> in place — no new session is created.</>
                : <>This finalizes today's numbers for <strong>{curDay?.label}</strong> and clears your in-progress draft. Once logged, it becomes read-only history.</>
              }
            </div>
            <button onClick={editingSession ? handleSaveEditedSession : handleSave} style={{ width:"100%", padding:13, background:"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer", marginBottom:10 }}>
              {editingSession ? "Save changes" : "Log session"}
            </button>
            <button onClick={() => setConfirmLog(false)} style={{ width:"100%", padding:13, background:"none", border:"1.5px solid #e8e8e8", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#888", cursor:"pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddModal
          onAdd={handleAddExerciseBuilt}
          onClose={() => setShowAddModal(false)}
          findExerciseCandidates={findExerciseCandidates}
          onSaveExercise={onSaveExercise}
          classifyNewExercise={classifyNewExercise}
          defaultEffortScale={effortScale}
        />
      )}

      {pendingNewExercise && (
        <div onClick={() => setPendingNewExercise(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#fff", borderRadius:"18px 18px 0 0", padding:"24px 20px 40px", fontFamily:"Barlow,sans-serif" }}>
            <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a", marginBottom:6 }}>Add "{pendingNewExercise.name}"</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:20, lineHeight:1.5 }}>
              Just log it for today, or add it to <strong>{curDay?.label}</strong> permanently so it shows up every time going forward?
            </div>
            <button onClick={confirmAddToday} style={{ width:"100%", padding:13, background:"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer", marginBottom:10 }}>
              Just for today
            </button>
            <button onClick={confirmAddPermanent} style={{ width:"100%", padding:13, background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, color:"#1d4ed8", cursor:"pointer", marginBottom:10 }}>
              Add to {curDay?.label} permanently
            </button>
            <button onClick={() => setPendingNewExercise(null)} style={{ width:"100%", padding:13, background:"none", border:"1.5px solid #e8e8e8", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#888", cursor:"pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
