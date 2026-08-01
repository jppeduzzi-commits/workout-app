import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { TODAY, TODAYFMT, fmtDate, parseDateStr, AUTO_LOG_HOURS } from "../constants";
import { fbLoadSessions, fbSaveSessions, fbLoadDraft, fbSaveDraft, fbClearDraft, fbAppendExerciseLog } from "../db";
import ExerciseLogRow from "./ExerciseLogRow";
import AnalysisScreen from "./AnalysisScreen";

export default function WorkoutScreen({ userName, splitId, program, days, onBack, initDay, effortScale, autoLog, exerciseCatalog, splits, findExerciseCandidates, onSaveExercise }) {
  const [activeDay, setActiveDay] = useState(initDay);
  const [sessions, setSessions] = useState([]);
  const [current, setCurrent] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [autoLoggedMsg, setAutoLoggedMsg] = useState("");
  const [analysisEx, setAnalysisEx] = useState(null);
  const [confirmLog, setConfirmLog] = useState(false);
  const autoSaveTimer = useRef(null);
  const programDays = days?.length ? days : Object.keys(program);
  const curDay      = program[activeDay];
  const lastSession = sessions[sessions.length - 1] || null;

  useEffect(() => {
    if (!userName || !splitId) return;
    setLoading(true); setCurrent({});
    Promise.all([
      fbLoadSessions(userName, splitId, activeDay),
      fbLoadDraft(userName, splitId, activeDay),
    ]).then(([s, { draft, savedAt }]) => {
      setSessions(s);
      const hasMeaningfulData = Object.values(draft).some(e => e?.sets?.some(s => s.weight || s.reps || s.laps));
      const thresholdMs = AUTO_LOG_HOURS * 3600000;
      const shouldAutoLog = autoLog !== false && savedAt && hasMeaningfulData && (Date.now() - savedAt) > thresholdMs;
      if (shouldAutoLog) {
        const d = new Date(savedAt);
        const dateStr = `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
        const nextSessions = [...s, { date: dateStr, entries: draft }];
        fbSaveSessions(userName, splitId, activeDay, nextSessions);
        fbClearDraft(userName, splitId, activeDay);
        setSessions(nextSessions);
        const hoursAgo = Math.round((Date.now() - savedAt) / 3600000);
        setAutoLoggedMsg(`✓ Auto-logged ${activeDay} from ${hoursAgo}h ago`);
        setTimeout(() => setAutoLoggedMsg(""), 5000);
      } else {
        if (hasMeaningfulData) setCurrent(draft);
      }
      setLoading(false);
    });
  }, [userName, splitId, activeDay]);

  const handleChange = useCallback((exId, val) => {
    setCurrent(c => {
      const next = { ...c, [exId]: val };
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(async () => {
        await fbSaveDraft(userName, splitId, activeDay, next);
        setAutoSaved(true);
        setTimeout(() => setAutoSaved(false), 1500);
      }, 800);
      return next;
    });
    setSaved(false);
  }, [userName, splitId, activeDay]);

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
    return { sets: latest.sets, note: latest.note, isSub: latest.isSub, subName: latest.subName, _viaSplit: viaSplit };
  };

  const handleSave = async () => {
    setConfirmLog(false);
    setSaving(true);
    const date = TODAY();
    const next = [...sessions, { date, entries: current }];
    await fbSaveSessions(userName, splitId, activeDay, next);
    await fbClearDraft(userName, splitId, activeDay);

    // Mirror each logged exercise into the global catalog log, keyed by
    // resolved identity — substitutions redirect to their own exerciseId.
    const exs = curDay?.exercises || [];
    exs.forEach((ex, index) => {
      const entry = current[ex.id];
      if (!entry) return;
      const hasData = entry.sets?.some(s => s.weight || s.perf || s.weight2 || s.perf2 || s.bw || s.bw2);
      if (!hasData) return;
      const targetId = entry.subExerciseId || ex.exerciseId;
      if (!targetId) return;
      const logEntry = { date, splitId, dayKey: activeDay, exerciseIndex: index, sets: entry.sets, note: entry.note || null, isSub: entry.isSub || false, subName: entry.subName || null };
      fbAppendExerciseLog(userName, targetId, logEntry);
    });

    setSessions(next); setCurrent({});
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
        </div>

        {loading ? (
          <div style={{ textAlign:"center", color:"#bbb", padding:40, fontSize:13 }}>Loading...</div>
        ) : curDay.exercises.map(ex => (
          <ExerciseLogRow key={ex.id} ex={ex}
            entry={current[ex.id] || null}
            prevEntry={getPrev(ex.exerciseId)}
            subPrevEntry={getPrev(current[ex.id]?.subExerciseId)}
            onChange={val => handleChange(ex.id, val)}
            sessions={sessions}
            effortScale={effortScale}
            findExerciseCandidates={findExerciseCandidates}
            onSaveExercise={onSaveExercise}
            onViewAnalysis={() => setAnalysisEx(ex)}
          />
        ))}

        {curDay.cardio && (
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#15803d", fontWeight:600, marginBottom:8 }}>
            🏃 Cardio — {curDay.cardio}
          </div>
        )}
        </>}
      </div>

      <div style={{ padding:"12px 14px 16px", background:"#fff", borderTop:"1px solid #e8e8e8", flexShrink:0 }}>
        <button onClick={() => setConfirmLog(true)} disabled={saving} style={{ width:"100%", padding:14, background:saved?"#16a34a":"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontSize:13, fontWeight:800, fontFamily:"inherit", cursor:saving?"wait":"pointer", letterSpacing:"0.06em" }}>
          {saving ? "SAVING..." : saved ? "✓ SESSION SAVED" : "LOG SESSION"}
        </button>
      </div>

      {confirmLog && (
        <div onClick={() => setConfirmLog(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#fff", borderRadius:"18px 18px 0 0", padding:"24px 20px 40px", fontFamily:"Barlow,sans-serif" }}>
            <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a", marginBottom:6 }}>Log this session?</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:20, lineHeight:1.5 }}>
              This finalizes today's numbers for <strong>{curDay?.label}</strong> and clears your in-progress draft. Once logged, it becomes read-only history.
            </div>
            <button onClick={handleSave} style={{ width:"100%", padding:13, background:"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer", marginBottom:10 }}>
              Log session
            </button>
            <button onClick={() => setConfirmLog(false)} style={{ width:"100%", padding:13, background:"none", border:"1.5px solid #e8e8e8", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#888", cursor:"pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
