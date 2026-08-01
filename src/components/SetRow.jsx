import { useState, useRef } from "react";
import { inp } from "../constants";

export default function SetRow({ s, i, isDrop, track, readOnly, onUpdate, onDelete, showRIR, suggestion }) {
  const rowBg     = isDrop ? "#fffbeb" : "#f8f8f8";
  const rowBorder = isDrop ? "1px solid #fde68a" : "1px solid #e8e8e8";
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(null);
  const DELETE_W = 72;
  const isReps = track.key === "reps";
  const pairWithReps = !!track.pairWithReps;

  const onTouchStart = e => {
    if (readOnly) return;
    startX.current = e.touches[0].clientX;
    setSwiping(true);
  };
  const onTouchMove = e => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffset(Math.max(dx, -DELETE_W));
  };
  const onTouchEnd = () => {
    setSwiping(false);
    setOffset(prev => (prev < -DELETE_W / 2 ? -DELETE_W : 0));
    startX.current = null;
  };

  const gridCols = pairWithReps
    ? "20px 1fr 1fr 1fr 56px"
    : (isReps && showRIR ? "20px 1fr 1fr 52px 56px" : "20px 1fr 1fr 56px");

  return (
    <div style={{ marginBottom: suggestion ? 2 : 6 }}>
      <div style={{ position:"relative", overflow:"hidden" }}>
        {!readOnly && (
          <div style={{ position:"absolute", right:0, top:0, bottom:0, width:DELETE_W, background:"#ef4444", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <button onClick={() => { setOffset(0); onDelete(); }} style={{ background:"none", border:"none", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", width:"100%", height:"100%", fontFamily:"inherit" }}>DELETE</button>
          </div>
        )}

        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ transform:`translateX(${offset}px)`, transition:swiping?"none":"transform 0.2s ease", background:"#fff" }}
        >
          <div style={{ display:"grid", gridTemplateColumns:gridCols, gap:"0 6px", alignItems:"center", padding:"6px 0" }}>
            <div style={{ fontSize:isDrop?10:12, color:isDrop?"#92400e":"#888", fontWeight:isDrop?700:400 }}>{isDrop ? "↓" : i+1}</div>

            <div style={{ display:"flex", gap:4 }}>
              <button onClick={() => onUpdate("bw", !s.bw)} style={{ padding:"4px 6px", fontSize:11, fontWeight:800, background:s.bw?"#2563eb":"#f8f8f8", color:s.bw?"#fff":"#888", border:`1.5px solid ${s.bw?"#2563eb":"#e8e8e8"}`, borderRadius:5, cursor:"pointer", flexShrink:0, fontFamily:"inherit" }}>BW</button>
              {!s.bw && <input disabled={readOnly} value={s.weight} onChange={e=>onUpdate("weight",e.target.value)} placeholder="lbs" style={{ ...inp, padding:"5px 7px", fontSize:12, background:rowBg, border:rowBorder }} />}
            </div>

            <input disabled={readOnly} value={s.perf} onChange={e=>onUpdate("perf",e.target.value)} placeholder={track.ph} style={{ ...inp, padding:"5px 7px", fontSize:12, background:rowBg, border:rowBorder }} />

            {pairWithReps && (
              <input disabled={readOnly} value={s.reps||""} onChange={e=>onUpdate("reps",e.target.value)} placeholder="reps" style={{ ...inp, padding:"5px 7px", fontSize:12, background:rowBg, border:rowBorder }} />
            )}

            {isReps && showRIR && (
              <select
                disabled={readOnly}
                value={s.rir === null || s.rir === undefined ? "" : String(s.rir)}
                onChange={e => onUpdate("rir", e.target.value === "" ? null : parseInt(e.target.value))}
                style={{ ...inp, padding:"5px 3px", fontSize:12, background:s.rir != null ? "#0a0a0a" : "#f8f8f8", color:s.rir != null ? "#fff" : "#999", border:`1px solid ${s.rir != null ? "#0a0a0a" : "#e8e8e8"}`, cursor:"pointer", borderRadius:6, textAlign:"center", appearance:"none", WebkitAppearance:"none" }}
              >
                <option value="">RIR</option>
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5+</option>
              </select>
            )}

            <div style={{ fontSize:11, textAlign:"right", paddingLeft:2, color:s._prevIsSub?"#f59e0b":"#bbb", fontWeight:s._prevIsSub?700:400, lineHeight:1.3 }}>
              {(!s._prev || s._prev==="—") ? "—" : s._prevIsSub ? `↻ ${s._prev}` : s._prev}
              {s._prevRir != null && <div style={{ fontSize:9, color:"#d1d5db", fontWeight:400 }}>@{s._prevRir === 5 ? "5+" : s._prevRir}</div>}
            </div>
          </div>
        </div>
      </div>

      {suggestion && (
        <div style={{ background:suggestion.belowRange?"#fffbeb":"#f0fdf4", borderRadius:"0 0 7px 7px", padding:"5px 10px", fontSize:11, color:suggestion.belowRange?"#92400e":"#15803d", fontWeight:600 }}>
          {suggestion.belowRange
            ? `↓ Set ${i+2}: drop to ~${suggestion.weight}lbs × ${suggestion.reps} reps to stay in range`
            : `Set ${i+2} target: ~${suggestion.weight}lbs × ${suggestion.reps} reps`
          }
        </div>
      )}
    </div>
  );
}
