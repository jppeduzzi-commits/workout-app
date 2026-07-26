import { useState } from "react";
import { TRACK, EX_TYPES, inp } from "../constants";

export default function EditorExRow({ ex, onUpdate, onDelete, onGripStart, elRef, isDragging }) {
  const [open, setOpen] = useState(false);
  const track = TRACK.find(t => t.key === ex.trackingType) || TRACK[0];
  return (
    <div ref={elRef} style={{ background:isDragging?"#eff6ff":"#fff", border:`1.5px solid ${isDragging?"#2563eb":"#e8e8e8"}`, borderRadius:10, marginBottom:7, overflow:"hidden", opacity:isDragging?0.85:1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 12px" }}>
        <div onMouseDown={e=>onGripStart(ex.id,e)} onTouchStart={e=>onGripStart(ex.id,e)} style={{ cursor:"grab", color:"#ccc", fontSize:18, padding:"2px 4px", flexShrink:0, userSelect:"none", touchAction:"none" }}>⠿</div>
        <div style={{ flex:1, fontSize:13, fontWeight:700, color:"#0a0a0a" }}>{ex.name || <span style={{ color:"#bbb", fontStyle:"italic", fontWeight:400 }}>Unnamed</span>}</div>
        <div style={{ fontSize:11, color:"#bbb", flexShrink:0 }}>{ex.sets}s · {track.label}</div>
        <button onClick={() => setOpen(o=>!o)} style={{ background:"none", border:"none", fontSize:14, cursor:"pointer", padding:"0 4px" }}>{open?"−":"✏️"}</button>
        <button onClick={onDelete} style={{ background:"none", border:"1px solid #e8e8e8", borderRadius:6, color:"#bbb", width:26, height:26, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>×</button>
      </div>
      {open && (
        <div style={{ padding:"0 12px 12px", borderTop:"1px solid #e8e8e8" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:10 }}>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>EXERCISE NAME</label>
              <input value={ex.name} onChange={e=>onUpdate({...ex, name:e.target.value})} style={inp} placeholder="Exercise name" />
            </div>
            <div>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>SETS</label>
              <input type="number" min={1} max={10} value={ex.sets} onChange={e=>onUpdate({...ex, sets:parseInt(e.target.value)||1})} style={inp} />
            </div>
            <div>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>TRACKED BY</label>
              <select value={ex.trackingType} onChange={e=>onUpdate({...ex, trackingType:e.target.value})} style={{ ...inp, cursor:"pointer" }}>
                {TRACK.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>EXERCISE TYPE</label>
              <select value={ex.exType || "compound"} onChange={e=>onUpdate({...ex, exType:e.target.value})} style={{ ...inp, cursor:"pointer" }}>
                {EX_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>TARGET {track.label.toUpperCase()}</label>
              <input value={ex.target} onChange={e=>onUpdate({...ex, target:e.target.value})} style={inp} placeholder="e.g. 8–12" />
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:8, gridColumn:"1/-1", cursor:"pointer" }}>
              <input type="checkbox" checked={ex.hasDrop} onChange={e=>onUpdate({...ex, hasDrop:e.target.checked})} style={{ width:15, height:15 }} />
              <span style={{ fontSize:12, color:"#888", fontWeight:600 }}>Include drop set</span>
            </label>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>NOTES</label>
              <textarea value={ex.notes} onChange={e=>onUpdate({...ex, notes:e.target.value})} rows={2} style={{ ...inp, resize:"none", fontFamily:"inherit", fontSize:12 }} placeholder="Cues or instructions..." />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
