import { useState } from "react";
import { TRACK, EX_TYPES, inp, uid, titleCase, slugify } from "../constants";
import DuplicateExerciseModal from "./DuplicateExerciseModal";

export default function AddModal({ onAdd, onClose, findExerciseCandidates, onSaveExercise, defaultEffortScale }) {
  const [step, setStep] = useState(0);
  const [ex, setEx] = useState({ id:uid(), name:"", isSuperset:false, supersetNameA:"", supersetNameB:"", sets:3, hasDrop:false, trackingType:"reps", exType:"compound", effortScale: defaultEffortScale || "rir", target:"", notes:"" });
  const [dupCheck, setDupCheck] = useState(null); // { rawName, candidates } while the modal is open
  const track = TRACK.find(t => t.key === ex.trackingType) || TRACK[0];
  const canNext = [
    ex.isSuperset ? (ex.supersetNameA.trim().length > 0 && ex.supersetNameB.trim().length > 0) : ex.name.trim().length > 0,
    true, true, true, true,
  ];

  const toggleSuperset = () => setEx(x => {
    const on = !x.isSuperset;
    return { ...x, isSuperset:on, supersetNameA: on ? (x.name||x.supersetNameA) : x.supersetNameA, name: on ? (x.supersetNameA||x.name) : x.supersetNameA };
  });

  const steps = [
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>What's the exercise called?</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>Type the full name</div>
      <input
        value={ex.isSuperset ? ex.supersetNameA : ex.name}
        onChange={e => {
          const v = e.target.value;
          ex.isSuperset
            ? setEx(x => ({ ...x, supersetNameA:v, name:`${v} / ${x.supersetNameB}` }))
            : setEx(x => ({ ...x, name:v }));
        }}
        placeholder={ex.isSuperset ? "First exercise name" : "e.g. Cable Lateral Raise"}
        autoFocus
        style={{ ...inp, marginBottom:14 }}
      />
      <label onClick={toggleSuperset} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", marginBottom: ex.isSuperset ? 14 : 0 }}>
        <div style={{ width:36, height:20, borderRadius:10, background:ex.isSuperset?"#0a0a0a":"#d1d5db", position:"relative", transition:"background .2s", flexShrink:0 }}>
          <div style={{ position:"absolute", top:2, left:ex.isSuperset?18:2, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
        </div>
        <span style={{ fontSize:13, color:"#555", fontWeight:600 }}>Superset — pair with another exercise</span>
      </label>
      {ex.isSuperset && (
        <input
          value={ex.supersetNameB}
          onChange={e => setEx(x => ({ ...x, supersetNameB:e.target.value, name:`${x.supersetNameA} / ${e.target.value}` }))}
          placeholder="Second exercise name"
          style={{ ...inp }}
        />
      )}
    </div>,
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>What type of exercise is it?</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>This determines what analysis is shown</div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {EX_TYPES.map(t => (
          <button key={t.key} onClick={() => setEx(x=>({...x, exType:t.key}))} style={{ padding:"11px 14px", textAlign:"left", background:ex.exType===t.key?"#0a0a0a":"#fff", color:ex.exType===t.key?"#fff":"#0a0a0a", border:`1.5px solid ${ex.exType===t.key?"#0a0a0a":"#e8e8e8"}`, borderRadius:10, fontFamily:"inherit", cursor:"pointer", fontSize:13, fontWeight:700 }}>{t.label}</button>
        ))}
      </div>
    </div>,
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>How many sets?</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>Working sets only</div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => setEx(x=>({...x, sets:n}))} style={{ width:46, height:46, borderRadius:10, background:ex.sets===n?"#0a0a0a":"#f5f5f5", color:ex.sets===n?"#fff":"#0a0a0a", border:`1.5px solid ${ex.sets===n?"#0a0a0a":"#e8e8e8"}`, fontSize:17, fontWeight:800, fontFamily:"inherit", cursor:"pointer" }}>{n}</button>
        ))}
      </div>
      <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
        <input type="checkbox" checked={ex.hasDrop} onChange={e=>setEx(x=>({...x, hasDrop:e.target.checked}))} style={{ width:15, height:15 }} />
        <span style={{ fontSize:13, color:"#888", fontWeight:600 }}>Include a drop set</span>
      </label>
    </div>,
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>How is it tracked?</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>What do you count per set?</div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {TRACK.map(t => (
          <button key={t.key} onClick={() => setEx(x=>({...x, trackingType:t.key}))} style={{ padding:"11px 14px", textAlign:"left", background:ex.trackingType===t.key?"#0a0a0a":"#fff", color:ex.trackingType===t.key?"#fff":"#0a0a0a", border:`1.5px solid ${ex.trackingType===t.key?"#0a0a0a":"#e8e8e8"}`, borderRadius:10, fontFamily:"inherit", cursor:"pointer", fontSize:13, fontWeight:700 }}>
            {t.label}<span style={{ fontSize:11, fontWeight:400, marginLeft:8, opacity:0.6 }}>{t.ph}</span>
            {t.pairWithReps && <span style={{ fontSize:11, fontWeight:400, marginLeft:8, opacity:0.6 }}>+ Reps</span>}
          </button>
        ))}
      </div>
    </div>,
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>Set the target</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>Goal per set</div>
      <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>TARGET {track.label.toUpperCase()}</label>
      <input value={ex.target} onChange={e=>setEx(x=>({...x, target:e.target.value}))} placeholder={track.ph} style={{ ...inp, marginBottom:12 }} />
      <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>EFFORT TRACKING</label>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        {[{k:"rir",l:"RIR"},{k:"rpe",l:"RPE"},{k:"none",l:"None"}].map(o => (
          <button key={o.k} onClick={() => setEx(x=>({...x, effortScale:o.k}))}
            style={{ flex:1, padding:"8px 0", background:ex.effortScale===o.k?"#0a0a0a":"#f5f5f5", color:ex.effortScale===o.k?"#fff":"#888", border:`1.5px solid ${ex.effortScale===o.k?"#0a0a0a":"#e8e8e8"}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>
            {o.l}
          </button>
        ))}
      </div>
      <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>NOTES (optional)</label>
      <textarea value={ex.notes} onChange={e=>setEx(x=>({...x, notes:e.target.value}))} placeholder="Any cues..." rows={2} style={{ ...inp, resize:"none", fontFamily:"inherit", fontSize:12 }} />
    </div>,
  ];

  const applyResolved = (fields) => { setEx(x => ({ ...x, ...fields })); setStep(s => s + 1); };

  const handleNextFromNameStep = () => {
    if (!canNext[0]) return;
    if (!findExerciseCandidates) { setStep(s => s + 1); return; }
    const { exact, candidates } = findExerciseCandidates(ex.name);
    if (exact) {
      applyResolved({ exerciseId: exact.id, name: exact.name, trackingType: exact.trackingType, exType: exact.exType });
    } else if (candidates.length > 0) {
      setDupCheck({ rawName: ex.name, candidates });
    } else {
      applyResolved({ exerciseId: slugify(ex.name), name: titleCase(ex.name) });
    }
  };

  const finalizeAndAdd = () => {
    if (onSaveExercise && ex.exerciseId) {
      onSaveExercise({ id: ex.exerciseId, name: ex.name, trackingType: ex.trackingType, exType: ex.exType, createdAt: Date.now() });
    }
    onAdd(ex);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"flex-end", zIndex:50 }}>
      <div style={{ background:"#fff", borderRadius:"18px 18px 0 0", padding:"22px 18px 28px", width:"100%" }}>
        <div style={{ display:"flex", gap:6, marginBottom:20 }}>
          {steps.map((_,i) => <div key={i} style={{ height:5, borderRadius:3, background:i<=step?"#0a0a0a":"#e8e8e8", flex:i===step?2:1, transition:"all .2s" }} />)}
        </div>
        {steps[step]}
        <div style={{ display:"flex", gap:10, marginTop:18 }}>
          <button onClick={step===0?onClose:()=>setStep(s=>s-1)} style={{ padding:"11px 18px", background:"#f5f5f5", border:"1.5px solid #e8e8e8", borderRadius:10, color:"#888", fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            {step===0 ? "Cancel" : "← Back"}
          </button>
          {step < steps.length-1
            ? <button onClick={() => step === 0 ? handleNextFromNameStep() : (canNext[step] && setStep(s=>s+1))} style={{ flex:1, padding:11, background:canNext[step]?"#0a0a0a":"#e8e8e8", color:"#fff", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:"pointer" }}>Next →</button>
            : <button onClick={finalizeAndAdd} style={{ flex:1, padding:11, background:"#16a34a", color:"#fff", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:"pointer" }}>Add Exercise ✓</button>
          }
        </div>
      </div>

      {dupCheck && (
        <DuplicateExerciseModal
          rawName={dupCheck.rawName}
          candidates={dupCheck.candidates}
          onMerge={candidate => { applyResolved({ exerciseId: candidate.id, name: candidate.name, trackingType: candidate.trackingType, exType: candidate.exType }); setDupCheck(null); }}
          onKeepSeparate={() => { applyResolved({ exerciseId: slugify(dupCheck.rawName), name: titleCase(dupCheck.rawName) }); setDupCheck(null); }}
          onClose={() => setDupCheck(null)}
        />
      )}
    </div>
  );
}
