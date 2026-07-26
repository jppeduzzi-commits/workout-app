import { useState } from "react";

export default function ReconciliationModal({ sharedSession, loggedEntries, userDayExercises, day, onConfirm, onSaveAsSolo }) {
  const sharedExercises = sharedSession?.exercises || [];

  const rows = [];
  (userDayExercises || []).forEach(ex => {
    const sharedMatch = sharedExercises.find(s => s.name.toLowerCase() === ex.name.toLowerCase());
    rows.push({ id: ex.id, name: ex.name, userEx: ex, sharedEx: sharedMatch || null, isExtra: false });
  });
  sharedExercises.forEach(sex => {
    const alreadyIn = rows.some(r => r.name.toLowerCase() === sex.name.toLowerCase());
    if (!alreadyIn) rows.push({ id: sex.id, name: sex.name, userEx: null, sharedEx: sex, isExtra: true });
  });

  const initSelected = {};
  rows.forEach(r => { initSelected[r.id] = !!loggedEntries[r.id]; });
  const [selected, setSelected] = useState(initSelected);
  const toggle = id => setSelected(s => ({ ...s, [id]: !s[id] }));

  const handleConfirm = () => {
    const confirmed = {};
    rows.forEach(r => {
      if (!selected[r.id]) return;
      const entry = loggedEntries[r.id];
      if (!entry) return;
      confirmed[r.id] = entry;
    });
    onConfirm(confirmed);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
      <div style={{ width:"100%", background:"#fff", borderRadius:"18px 18px 0 0", maxHeight:"82vh", display:"flex", flexDirection:"column", paddingBottom:"env(safe-area-inset-bottom,16px)" }}>
        <div style={{ padding:"20px 20px 14px", borderBottom:"1px solid #f0f0f0", flexShrink:0 }}>
          <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a", marginBottom:4 }}>Review shared session</div>
          <div style={{ fontSize:12, color:"#888" }}>Select exercises to count toward your history. Uncheck any you skipped.</div>
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {rows.map(r => {
            const hasData = !!loggedEntries[r.id];
            const isSel = selected[r.id];
            return (
              <div key={r.id} onClick={() => hasData && toggle(r.id)}
                style={{ display:"flex", alignItems:"center", padding:"13px 20px", borderBottom:"1px solid #f5f5f5", opacity:hasData?1:0.45, cursor:hasData?"pointer":"default" }}>
                <div style={{ width:22, height:22, borderRadius:"50%", border:`2px solid ${isSel&&hasData?"#16a34a":"#d0d0d0"}`, background:isSel&&hasData?"#16a34a":"transparent", marginRight:14, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#fff", fontWeight:800 }}>
                  {isSel && hasData ? "✓" : ""}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#0a0a0a" }}>{r.name}</div>
                  <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>
                    {hasData ? `${loggedEntries[r.id]?.sets?.filter(s=>s.weight||s.reps||s.laps).length||0} sets logged` : "Not logged"}
                    {r.isExtra && <span style={{ color:"#ea580c", marginLeft:6, fontWeight:600 }}>· New exercise</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding:"14px 20px", borderTop:"1px solid #f0f0f0", display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
          <button onClick={handleConfirm} style={{ width:"100%", padding:14, background:"#ea580c", color:"#fff", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer" }}>
            Confirm — Log shared session
          </button>
          <button onClick={onSaveAsSolo} style={{ width:"100%", padding:11, background:"transparent", color:"#888", border:"1.5px solid #e8e8e8", borderRadius:12, fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer" }}>
            Save as solo instead
          </button>
        </div>
      </div>
    </div>
  );
}
