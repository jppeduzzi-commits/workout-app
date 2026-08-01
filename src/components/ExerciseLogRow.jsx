import { useState } from "react";
import { TRACK, inp, roundTo, titleCase, slugify } from "../constants";
import { parseRepRange, calcSet2Suggestion } from "../utils";
import SetRow from "./SetRow";
import Tag from "./Tag";
import Toggle from "./Toggle";
import DuplicateExerciseModal from "./DuplicateExerciseModal";

function makeRows(ex) {
  const base = ex.isSuperset
    ? { bw:false, weight:"", perf:"", rir:null, bw2:false, weight2:"", perf2:"" }
    : { bw:false, weight:"", perf:"", rir:null, reps:"" };
  return Array.from({ length: ex.hasDrop ? ex.sets + 1 : ex.sets }, () => ({ ...base }));
}

export default function ExerciseLogRow({ ex, entry, prevEntry, subPrevEntry, onChange, readOnly, sessions, onViewAnalysis, showRIR, findExerciseCandidates, onSaveExercise }) {
  const [open, setOpen] = useState(false);
  const [dupCheck, setDupCheck] = useState(null);
  const track    = TRACK.find(t => t.key === ex.trackingType) || TRACK[0];
  const sets     = entry?.sets || makeRows(ex);
  const isSub    = entry?.isSub || false;
  const subName  = entry?.subName || "";
  const logged   = ex.isSuperset
    ? sets.some(s => s.weight || s.perf || s.weight2 || s.perf2)
    : sets.some(s => s.bw || s.weight || s.perf);

  // While substituting, "last time" comes from the substitute's own global
  // history, not the original exercise's — never mixed together.
  const effectivePrev = isSub ? subPrevEntry : prevEntry;
  const prevSets = effectivePrev?.sets || [];
  const prevIsSub   = effectivePrev?.isSub || false;
  const prevSubName = effectivePrev?.subName || "";

  const viaSplit = effectivePrev?._viaSplit || null;

  const resolveSubName = (rawName) => {
    if (!rawName?.trim() || !findExerciseCandidates) { onChange({ ...entry, sets, isSub:true, subName:rawName, subExerciseId:null }); return; }
    const { exact, candidates } = findExerciseCandidates(rawName);
    if (exact) {
      onChange({ ...entry, sets, isSub:true, subName:exact.name, subExerciseId:exact.id });
    } else if (candidates.length > 0) {
      setDupCheck({ rawName, candidates });
    } else {
      const id = slugify(rawName), name = titleCase(rawName);
      onChange({ ...entry, sets, isSub:true, subName:name, subExerciseId:id });
      if (onSaveExercise) onSaveExercise({ id, name, trackingType: ex.trackingType, exType: ex.exType, createdAt: Date.now() });
    }
  };

  const pairWithReps = !ex.isSuperset && !!track.pairWithReps;

  const hasPR = !ex.isSuperset && !isSub && !prevIsSub && track.key === "reps" && prevEntry && sets.some(s => s.weight && s.perf && !s.bw) && (() => {
    const cur  = Math.max(...sets.map(s => (parseFloat(s.weight)||0) * (parseFloat(s.perf)||0)));
    const prev = Math.max(...(prevEntry.sets||[]).map(s => (parseFloat(s.weight)||0) * (parseFloat(s.perf)||0)));
    return cur > prev && prev > 0;
  })();

  const repRange = parseRepRange(ex.target);
  const toppedRange = !ex.isSuperset && !isSub && track.key === "reps" && repRange && sets.some(s => !s.bw && s.perf && parseFloat(s.perf) >= repRange.max);
  const bestSetWeight = (() => {
    if (!toppedRange || !repRange) return null;
    const ws = sets.filter(s => !s.bw && s.weight && s.perf && parseFloat(s.perf) >= repRange.max);
    return ws.length ? Math.max(...ws.map(s => parseFloat(s.weight))) : null;
  })();
  const suggestedNextWeight = bestSetWeight ? roundTo(bestSetWeight * 1.05, 2.5) : null;

  const enrichedSets = sets.map((s, i) => {
    if (!prevSets[i]) return { ...s, _prev:"—", _prevA:"—", _prevB:"—", _prevIsSub:false, _prevRir:null };
    if (ex.isSuperset) {
      const pA = prevSets[i].bw  ? `BW×${prevSets[i].perf||"—"}`  : `${prevSets[i].weight||"—"}×${prevSets[i].perf||"—"}`;
      const pB = prevSets[i].bw2 ? `BW×${prevSets[i].perf2||"—"}` : `${prevSets[i].weight2||"—"}×${prevSets[i].perf2||"—"}`;
      return { ...s, _prev:pA, _prevA:pA, _prevB:pB, _prevIsSub:false, _prevRir:null };
    }
    const weightPart = prevSets[i].bw ? "BW" : (prevSets[i].weight || "—");
    const raw = pairWithReps
      ? `${weightPart}·${prevSets[i].perf||"—"}×${prevSets[i].reps||"—"}`
      : `${weightPart}×${prevSets[i].perf||"—"}`;
    const prevRir = prevSets[i].rir != null && prevSets[i].rir !== "" ? prevSets[i].rir : null;
    return { ...s, _prev:raw, _prevIsSub:prevIsSub, _prevRir:prevRir };
  });

  const showAnalysisBtn = ((!ex.exType || ex.exType === "compound") || ex.exType === "isolation" || ex.exType === "carries" || ex.exType === "plyometric") && track.key === "reps";

  const updSet = (i, f, v) => {
    const n = sets.map((s,idx) => idx===i ? {...s,[f]:v} : s);
    onChange({...entry, sets:n});
  };
  const addSet = () => {
    const newRow = ex.isSuperset
      ? {bw:false, weight:"", perf:"", rir:null, bw2:false, weight2:"", perf2:""}
      : {bw:false, weight:"", perf:"", rir:null, reps:""};
    onChange({...entry, sets:[...sets, newRow]});
  };
  const delSet = i => onChange({...entry, sets:sets.filter((_,idx) => idx!==i)});

  const getSuggestion = i => {
    if (track.key !== "reps") return null;
    const isDrop = ex.hasDrop && i === ex.sets;
    if (isDrop || i >= ex.sets - 1) return null;
    const s = sets[i];
    if (!s || !s.weight || !s.perf || s.bw) return null;
    return calcSet2Suggestion(s.weight, s.perf, s.rir, ex.target);
  };

  const isReps = track.key === "reps";
  const gridCols = pairWithReps
    ? "20px 1fr 1fr 1fr 56px"
    : (isReps && showRIR ? "20px 1fr 1fr 52px 56px" : "20px 1fr 1fr 56px");
  const headers  = ["#", "WEIGHT", track.label.toUpperCase(), pairWithReps && "REPS", isReps && showRIR && "RIR", "LAST"].filter(Boolean);

  return (
    <div style={{ background:"#fff", border:`1.5px solid ${open?"#33333333":"#e8e8e8"}`, borderRadius:12, marginBottom:8, overflow:"hidden" }}>
      <div onClick={() => setOpen(o=>!o)} style={{ display:"flex", alignItems:"center", gap:10, padding:"13px 14px", cursor:"pointer" }}>
        <div style={{ width:7, height:7, borderRadius:"50%", background:logged?"#16a34a":"#e8e8e8", flexShrink:0 }} />
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:14, fontWeight:700, color:"#0a0a0a" }}>{ex.name}</span>
            {hasPR && <Tag color="#16a34a" bg="#dcfce7">PR</Tag>}
            {isSub && <Tag color="#ea580c" bg="#fff7ed">Sub</Tag>}
            {!isSub && prevIsSub && <Tag color="#f59e0b" bg="#fffbeb">Last: sub</Tag>}
            {toppedRange && <Tag color="#2563eb" bg="#eff6ff">↑ Add weight</Tag>}
          </div>
          <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>
            {ex.isSuperset ? `${ex.sets} sets · Superset` : `${ex.sets} sets${ex.hasDrop?" + drop":""} · ${ex.target} ${track.label.toLowerCase()}`}
          </div>
          {prevIsSub && prevSubName && !open && (
            <div style={{ fontSize:10, color:"#f59e0b", marginTop:3, fontWeight:600 }}>↻ Last session: {prevSubName}</div>
          )}
          {!prevIsSub && viaSplit && !open && (
            <div style={{ fontSize:10, color:"#888", marginTop:3, fontWeight:600 }}>↻ Last logged via "{viaSplit}"</div>
          )}
          {toppedRange && !open && (
            <div style={{ fontSize:10, color:"#2563eb", marginTop:3, fontWeight:600 }}>
              Hit {repRange.max} reps — go heavier next session{suggestedNextWeight ? ` (~${suggestedNextWeight}lbs, round to nearest increment)` : ""}
            </div>
          )}
        </div>
        <span style={{ color:"#bbb", fontSize:18 }}>{open ? "−" : "+"}</span>
      </div>

      {open && (
        <div style={{ padding:"0 14px 14px", borderTop:"1px solid #e8e8e8" }}>
          {ex.notes && <div style={{ fontSize:11, color:"#bbb", margin:"10px 0 10px", fontStyle:"italic" }}>{ex.notes}</div>}

          {toppedRange && (
            <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"10px 12px", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#1d4ed8", marginBottom:3 }}>↑ You hit the top of your rep range ({repRange.max} reps)</div>
              <div style={{ fontSize:11, color:"#3b82f6", marginBottom:suggestedNextWeight?4:0 }}>Increase the weight next session — you've earned it.</div>
              {suggestedNextWeight && (
                <div style={{ fontSize:11, color:"#1d4ed8", fontWeight:700 }}>Rough target: ~{suggestedNextWeight}lbs (+5%) · Round to your nearest available increment</div>
              )}
            </div>
          )}

          {prevIsSub && (
            <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"8px 12px", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#92400e", marginBottom:2 }}>↻ Last session was a substitution</div>
              {prevSubName
                ? <div style={{ fontSize:11, color:"#92400e" }}>You did <strong>{prevSubName}</strong> instead — numbers below are from that exercise, not {ex.name}</div>
                : <div style={{ fontSize:11, color:"#92400e" }}>Numbers below are from a different exercise, not {ex.name}</div>
              }
            </div>
          )}

          {!prevIsSub && viaSplit && (
            <div style={{ background:"#f9fafb", border:"1px solid #eeeeee", borderRadius:8, padding:"8px 12px", marginBottom:10 }}>
              <div style={{ fontSize:11, color:"#888" }}>↻ Last logged via <strong>"{viaSplit}"</strong> — numbers below are from that workout, not this one</div>
            </div>
          )}

          {!readOnly && (
            <div style={{ marginBottom:12 }}>
              <Toggle on={isSub} onToggle={() => onChange({...entry, sets, isSub:!isSub, subName:"", subExerciseId:null})} label="Mark as substitution" />
              {isSub && (
                <input value={subName} onChange={e=>onChange({...entry, sets, isSub:true, subName:e.target.value})} onBlur={e=>resolveSubName(e.target.value)} placeholder="What did you do instead? e.g. DB Shoulder Press" style={{ ...inp, marginTop:8, fontSize:12 }} />
              )}
            </div>
          )}
          {readOnly && isSub && subName && (
            <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:7, padding:"6px 10px", fontSize:12, color:"#ea580c", marginBottom:10 }}>
              Sub: {subName}
            </div>
          )}

          {ex.isSuperset ? (
            <>
              <div style={{ fontSize:11, color:"#888", marginBottom:12, lineHeight:1.7 }}>
                <span style={{ fontWeight:800, color:"#0a0a0a" }}>A</span> {ex.supersetNameA}&nbsp;&nbsp;·&nbsp;&nbsp;<span style={{ fontWeight:800, color:"#0a0a0a" }}>B</span> {ex.supersetNameB}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"26px 1fr 1fr 56px", gap:"0 6px", marginBottom:4 }}>
                {["", "WEIGHT", "REPS", "LAST"].map(h => <div key={h} style={{ fontSize:10, color:"#bbb", fontWeight:700 }}>{h}</div>)}
              </div>
              {enrichedSets.map((s, i) => (
                <div key={i} style={{ marginBottom:10 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"26px 1fr 1fr 56px", gap:"0 6px", alignItems:"center", marginBottom:4 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:"#0a0a0a" }}>{i+1}A</div>
                    <input disabled={readOnly} value={s.weight||""} onChange={e=>updSet(i,"weight",e.target.value)} placeholder="lbs" style={{ ...inp, padding:"5px 7px", fontSize:12, background:"#f8f8f8", border:"1px solid #e8e8e8" }} />
                    <input disabled={readOnly} value={s.perf||""} onChange={e=>updSet(i,"perf",e.target.value)} placeholder="reps" style={{ ...inp, padding:"5px 7px", fontSize:12, background:"#f8f8f8", border:"1px solid #e8e8e8" }} />
                    <div style={{ fontSize:11, textAlign:"right", color:"#bbb", paddingLeft:2 }}>{s._prevA||"—"}</div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"26px 1fr 1fr 56px", gap:"0 6px", alignItems:"center" }}>
                    <div style={{ fontSize:11, fontWeight:800, color:"#555" }}>{i+1}B</div>
                    <input disabled={readOnly} value={s.weight2||""} onChange={e=>updSet(i,"weight2",e.target.value)} placeholder="lbs" style={{ ...inp, padding:"5px 7px", fontSize:12, background:"#f8f8f8", border:"1px solid #e8e8e8" }} />
                    <input disabled={readOnly} value={s.perf2||""} onChange={e=>updSet(i,"perf2",e.target.value)} placeholder="reps" style={{ ...inp, padding:"5px 7px", fontSize:12, background:"#f8f8f8", border:"1px solid #e8e8e8" }} />
                    <div style={{ fontSize:11, textAlign:"right", color:"#bbb", paddingLeft:2 }}>{s._prevB||"—"}</div>
                  </div>
                  {!readOnly && sets.length > 1 && (
                    <button onClick={() => delSet(i)} style={{ background:"none", border:"none", color:"#d0d0d0", fontSize:10, cursor:"pointer", padding:"3px 0 0", fontFamily:"inherit" }}>Remove set</button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
              <div style={{ display:"grid", gridTemplateColumns:gridCols, gap:"0 6px", marginBottom:6 }}>
                {headers.map(h => (
                  <div key={h} style={{ fontSize:10, color:"#bbb", fontWeight:700, marginBottom:4 }}>{h}</div>
                ))}
              </div>
              {enrichedSets.map((s, i) => {
                const isDrop   = ex.hasDrop && i === ex.sets;
                const suggestion = !isDrop ? getSuggestion(i) : null;
                return (
                  <SetRow key={i} s={s} i={i} isDrop={isDrop} track={track} readOnly={readOnly}
                    showRIR={showRIR}
                    suggestion={suggestion}
                    onUpdate={(f,v) => updSet(i,f,v)}
                    onDelete={() => delSet(i)}
                  />
                );
              })}
            </>
          )}

          {ex.hasDrop && (
            <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:7, padding:"6px 10px", fontSize:11, color:"#92400e", marginBottom:8 }}>
              ↓ Drop set = 50% weight, go to failure
            </div>
          )}

          {!readOnly && (
            <button onClick={addSet} style={{ width:"100%", padding:8, background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:8, color:"#bbb", fontSize:12, fontFamily:"inherit", fontWeight:600, cursor:"pointer", marginBottom:8 }}>
              + Add set
            </button>
          )}

          {showAnalysisBtn && (
            <button onClick={onViewAnalysis} style={{ width:"100%", padding:10, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, color:"#15803d", fontSize:12, fontFamily:"inherit", fontWeight:700, cursor:"pointer", marginBottom:8 }}>
              📊 Performance Analysis & Targets →
            </button>
          )}

          {effectivePrev?.note && (
            <div style={{ background:"#f9fafb", border:"1px solid #eeeeee", borderRadius:8, padding:"9px 11px", marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#aaa", letterSpacing:"0.07em", marginBottom:4 }}>LAST SESSION NOTE</div>
              <div style={{ fontSize:12, color:"#555", lineHeight:1.55, fontStyle:"italic" }}>{effectivePrev.note}</div>
            </div>
          )}
          {!readOnly && (
            <textarea value={entry?.note||""} onChange={e=>onChange({...entry, sets, note:e.target.value})} placeholder="Session note..." rows={2} style={{ ...inp, resize:"none", fontFamily:"inherit", fontSize:12 }} />
          )}
        </div>
      )}

      {dupCheck && (
        <DuplicateExerciseModal
          rawName={dupCheck.rawName}
          candidates={dupCheck.candidates}
          onMerge={candidate => { onChange({ ...entry, sets, isSub:true, subName:candidate.name, subExerciseId:candidate.id }); setDupCheck(null); }}
          onKeepSeparate={() => {
            const id = slugify(dupCheck.rawName), name = titleCase(dupCheck.rawName);
            onChange({ ...entry, sets, isSub:true, subName:name, subExerciseId:id });
            if (onSaveExercise) onSaveExercise({ id, name, trackingType: ex.trackingType, exType: ex.exType, createdAt: Date.now() });
            setDupCheck(null);
          }}
          onClose={() => setDupCheck(null)}
        />
      )}
    </div>
  );
}
