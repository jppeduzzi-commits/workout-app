import { useState } from "react";
import { inp } from "../constants";

// Phone-keyboard-style suggestions while typing an exercise name — purely
// local string matching against whatever name list the caller passes in
// (own catalog + shared exercise database), no network call involved.
// Picking a suggestion just fills in that exact text; resolution (exact
// match / AI classification / etc.) still happens the same way it always
// did, downstream of whatever ends up in the field.
export default function ExerciseAutocomplete({ value, onChange, onSelect, onBlur, options, placeholder, autoFocus, disabled, style }) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = q.length > 0
    ? [...new Set(options || [])]
        .filter(o => o.toLowerCase() !== q && o.toLowerCase().includes(q))
        .sort((a, b) => {
          const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
          const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
          return aStarts - bStarts || a.length - b.length;
        })
        .slice(0, 6)
    : [];

  return (
    <div style={{ position:"relative" }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={e => { const v = e.target.value; setTimeout(() => setOpen(false), 150); onBlur?.(v); }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        autoCorrect="off"
        autoComplete="off"
        style={{ ...inp, ...style }}
      />
      {open && matches.length > 0 && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:10, overflow:"hidden", zIndex:30, maxHeight:200, overflowY:"auto", boxShadow:"0 6px 16px rgba(0,0,0,0.1)" }}>
          {matches.map(m => (
            <div key={m} onMouseDown={() => onSelect(m)}
              style={{ padding:"10px 12px", fontSize:13, fontWeight:600, color:"#0a0a0a", cursor:"pointer", borderBottom:"1px solid #f5f5f5" }}>
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
