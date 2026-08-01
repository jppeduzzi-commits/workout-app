export default function DuplicateExerciseModal({ rawName, candidates, onMerge, onKeepSeparate, onClose }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", background:"#fff", borderRadius:"18px 18px 0 0", padding:"24px 20px 40px", fontFamily:"Barlow,sans-serif" }}>
        <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a", marginBottom:6 }}>Is this the same exercise?</div>
        <div style={{ fontSize:12, color:"#888", marginBottom:18, lineHeight:1.5 }}>
          "<strong>{rawName}</strong>" looks similar to {candidates.length === 1 ? "an exercise you already have" : "exercises you already have"}:
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
          {candidates.map(c => (
            <button key={c.id} onClick={() => onMerge(c)}
              style={{ textAlign:"left", padding:"12px 14px", background:"#f8f8f8", border:"1.5px solid #e8e8e8", borderRadius:10, cursor:"pointer", fontFamily:"inherit" }}>
              <div style={{ fontSize:13, fontWeight:800, color:"#0a0a0a" }}>{c.name}</div>
              <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>Merge into this — shares history &amp; settings</div>
            </button>
          ))}
        </div>
        <button onClick={onKeepSeparate}
          style={{ width:"100%", padding:13, background:"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer", marginBottom:10 }}>
          No — keep as a different exercise
        </button>
        <button onClick={onClose}
          style={{ width:"100%", padding:11, background:"none", border:"1.5px solid #e8e8e8", borderRadius:12, color:"#888", fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
