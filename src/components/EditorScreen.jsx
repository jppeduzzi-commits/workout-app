import { useState, useRef, useCallback, useEffect } from "react";
import { copy, inp } from "../constants";
import EditorExRow from "./EditorExRow";
import AddModal from "./AddModal";

export default function EditorScreen({ split, onSave, onBack, findExerciseCandidates, onSaveExercise }) {
  const [splitName, setSplitName]       = useState(split?.name || "");
  const [editingSplitName, setEditingSplitName] = useState(false);
  const [editDays, setEditDays]         = useState(() => [...(split?.days || [])]);
  const [activeDay, setActiveDay]       = useState(() => (split?.days || [])[0] || null);
  const [prog, setProg]                 = useState(() => copy(split?.program || {}));
  const [renamingDay, setRenamingDay]   = useState(null);
  const [renameDayInput, setRenameDayInput] = useState("");
  const [showAdd, setShowAdd]           = useState(false);
  const [showAddDay, setShowAddDay]     = useState(false);
  const [newDayName, setNewDayName]     = useState("");
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [dragId, setDragId]             = useState(null);
  const [overIdx, setOverIdx]           = useState(null);
  const refs = useRef({});
  const curDay = activeDay && prog[activeDay];
  const exs    = curDay?.exercises || [];
  const setExs = useCallback(n => setProg(p => ({ ...p, [activeDay]: { ...p[activeDay], exercises: n } })), [activeDay]);

  useEffect(() => {
    if (!dragId) return;
    const move = cy => { let f = exs.length - 1; for (let i = 0; i < exs.length; i++) { const el = refs.current[exs[i].id]; if (!el) continue; const r = el.getBoundingClientRect(); if (cy < r.top + r.height / 2) { f = i; break; } } setOverIdx(f); };
    const mm  = e => move(e.clientY);
    const tm  = e => { e.preventDefault(); move(e.touches[0].clientY); };
    const end = () => {
      if (dragId !== null && overIdx !== null) {
        const from = exs.findIndex(x => x.id === dragId);
        if (from !== -1 && from !== overIdx) { const n = [...exs]; const [item] = n.splice(from, 1); n.splice(overIdx, 0, item); setExs(n); }
      }
      setDragId(null); setOverIdx(null);
    };
    window.addEventListener("mousemove", mm); window.addEventListener("touchmove", tm, { passive: false }); window.addEventListener("mouseup", end); window.addEventListener("touchend", end);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("touchmove", tm); window.removeEventListener("mouseup", end); window.removeEventListener("touchend", end); };
  }, [dragId, overIdx, exs, setExs]);

  const display = dragId ? (() => {
    const from = exs.findIndex(x => x.id === dragId);
    if (from === -1 || overIdx === null || from === overIdx) return exs;
    const n = [...exs]; const [item] = n.splice(from, 1); n.splice(overIdx, 0, item); return n;
  })() : exs;

  const handleAddDay = () => {
    const name = newDayName.trim();
    if (!name) return;
    setEditDays(d => [...d, name]);
    setProg(p => ({ ...p, [name]: { label: name, subtitle: "", exercises: [] } }));
    setActiveDay(name);
    setNewDayName(""); setShowAddDay(false);
  };

  const handleDeleteDay = (dk) => {
    const remaining = editDays.filter(x => x !== dk);
    setEditDays(remaining);
    setProg(p => { const n = { ...p }; delete n[dk]; return n; });
    if (activeDay === dk) setActiveDay(remaining[0] || null);
  };

  const handleRenameDay = (oldKey, newKey) => {
    const trimmed = newKey.trim();
    if (!trimmed || trimmed === oldKey) { setRenamingDay(null); return; }
    setEditDays(d => d.map(dk => dk === oldKey ? trimmed : dk));
    setProg(p => {
      const n = { ...p };
      n[trimmed] = n[oldKey];
      delete n[oldKey];
      return n;
    });
    if (activeDay === oldKey) setActiveDay(trimmed);
    setRenamingDay(null);
  };

  const doSave = async () => {
    setSaving(true);
    await onSave({ ...split, name: splitName.trim() || split.name, days: editDays, program: prog });
    setSaving(false); setSaved(true);
    setTimeout(() => { setSaved(false); onBack(); }, 900);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", fontFamily:"Barlow,sans-serif" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderBottom:"1px solid #e8e8e8", background:"#fff", flexShrink:0 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:20, cursor:"pointer", padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a" }}>Edit Program</div>
          <div style={{ fontSize:11, color:"#bbb" }}>Hold ⠿ to drag exercises</div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"14px", paddingBottom:100 }}>

        {/* Split name */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, color:"#bbb", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Split name</div>
          {editingSplitName ? (
            <input autoFocus value={splitName} onChange={e => setSplitName(e.target.value)}
              onBlur={() => setEditingSplitName(false)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingSplitName(false); }}
              style={{ ...inp, fontSize:15, fontWeight:800 }} />
          ) : (
            <button onClick={() => setEditingSplitName(true)}
              style={{ background:"none", border:"1.5px solid #e8e8e8", borderRadius:8, padding:"9px 12px", cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:8, width:"100%" }}>
              <span style={{ fontSize:15, fontWeight:800, color:"#0a0a0a", flex:1, textAlign:"left" }}>{splitName || "Unnamed split"}</span>
              <span style={{ fontSize:11, color:"#bbb" }}>Rename</span>
            </button>
          )}
        </div>

        {/* Day tabs */}
        <div style={{ fontSize:10, color:"#bbb", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Workout days</div>
        <div style={{ fontSize:10, color:"#bbb", marginBottom:8 }}>Tap the active day to rename it</div>
        <div style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:10, flexWrap:"nowrap", paddingBottom:4 }}>
          {editDays.map(dk => (
            <div key={dk} style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
              <button
                onClick={() => {
                  if (activeDay === dk) {
                    setRenamingDay(dk);
                    setRenameDayInput(dk);
                    setShowAddDay(false);
                  } else {
                    setActiveDay(dk);
                    setRenamingDay(null);
                  }
                }}
                style={{ background:activeDay===dk?"#0a0a0a":"#f5f5f5", color:activeDay===dk?"#fff":"#888", border:`1.5px solid ${activeDay===dk?"#0a0a0a":"#e8e8e8"}`, borderTopLeftRadius:8, borderBottomLeftRadius:8, borderTopRightRadius:0, borderBottomRightRadius:0, padding:"5px 10px", fontSize:11, fontFamily:"inherit", fontWeight:activeDay===dk?700:500, cursor:"pointer", whiteSpace:"nowrap", borderRight:"none" }}>
                {dk}
              </button>
              <button onClick={() => handleDeleteDay(dk)} style={{ background:activeDay===dk?"#333":"#f5f5f5", color:activeDay===dk?"#aaa":"#ccc", border:`1.5px solid ${activeDay===dk?"#0a0a0a":"#e8e8e8"}`, borderTopRightRadius:8, borderBottomRightRadius:8, borderTopLeftRadius:0, borderBottomLeftRadius:0, padding:"5px 7px", fontSize:12, cursor:"pointer", lineHeight:1 }}>×</button>
            </div>
          ))}
        </div>

        {/* Rename day input */}
        {renamingDay && (
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <input autoFocus value={renameDayInput} onChange={e => setRenameDayInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleRenameDay(renamingDay, renameDayInput); if (e.key === "Escape") setRenamingDay(null); }}
              placeholder="New day name"
              style={{ ...inp, flex:1 }} />
            <button onClick={() => handleRenameDay(renamingDay, renameDayInput)} style={{ padding:"7px 14px", background:"#0a0a0a", color:"#fff", border:"none", borderRadius:8, fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>Rename</button>
            <button onClick={() => setRenamingDay(null)} style={{ padding:"7px 10px", background:"none", border:"1.5px solid #e8e8e8", borderRadius:8, color:"#bbb", fontFamily:"inherit", fontSize:13, cursor:"pointer" }}>✕</button>
          </div>
        )}

        {/* Add day input */}
        {!renamingDay && (showAddDay ? (
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <input value={newDayName} onChange={e => setNewDayName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddDay()} placeholder="Day name (e.g. Push Day)" autoFocus style={{ ...inp, flex:1 }} />
            <button onClick={handleAddDay} style={{ padding:"7px 14px", background:"#0a0a0a", color:"#fff", border:"none", borderRadius:8, fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>Add</button>
            <button onClick={() => { setShowAddDay(false); setNewDayName(""); }} style={{ padding:"7px 10px", background:"none", border:"1.5px solid #e8e8e8", borderRadius:8, color:"#bbb", fontFamily:"inherit", fontSize:13, cursor:"pointer" }}>✕</button>
          </div>
        ) : (
          <button onClick={() => { setShowAddDay(true); setRenamingDay(null); }} style={{ width:"100%", padding:"8px 11px", background:"transparent", border:"1.5px dashed #d0d0d0", borderRadius:9, color:"#aaa", fontSize:12, fontFamily:"inherit", fontWeight:600, cursor:"pointer", marginBottom:14, textAlign:"left" }}>+ Add workout day</button>
        ))}

        {curDay ? <>
          {display.map(ex => (
            <EditorExRow key={ex.id} ex={ex}
              onUpdate={u => setExs(exs.map(e => e.id === ex.id ? u : e))}
              onDelete={() => setExs(exs.filter(e => e.id !== ex.id))}
              onGripStart={setDragId}
              elRef={el => refs.current[ex.id] = el}
              isDragging={dragId === ex.id}
              findExerciseCandidates={findExerciseCandidates}
              onSaveExercise={onSaveExercise}
            />
          ))}
          <button onClick={() => setShowAdd(true)} style={{ width:"100%", padding:11, background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:10, color:"#bbb", fontSize:12, fontFamily:"inherit", fontWeight:600, cursor:"pointer", marginTop:4 }}>+ Add exercise</button>
        </> : editDays.length === 0 ? null : (
          <div style={{ textAlign:"center", padding:"30px 20px", color:"#bbb", fontSize:13 }}>Select a day above to edit its exercises.</div>
        )}
      </div>

      <div style={{ borderTop:"1px solid #e8e8e8", padding:"12px 14px 16px", background:"#fff", flexShrink:0 }}>
        <button onClick={doSave} disabled={saving} style={{ width:"100%", padding:14, background:saved?"#16a34a":"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontSize:13, fontWeight:800, fontFamily:"inherit", cursor:"pointer", letterSpacing:"0.06em" }}>
          {saving ? "SAVING..." : saved ? "✓ SAVED!" : "SAVE PROGRAM"}
        </button>
      </div>

      {showAdd && <AddModal onAdd={ex => { setExs([...exs, ex]); setShowAdd(false); }} onClose={() => setShowAdd(false)} findExerciseCandidates={findExerciseCandidates} onSaveExercise={onSaveExercise} />}
    </div>
  );
}
