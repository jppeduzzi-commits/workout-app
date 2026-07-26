export default function Toggle({ on, onToggle, label }) {
  return (
    <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
      <div onClick={onToggle} style={{ width:34, height:19, borderRadius:10, background:on?"#ea580c":"#e8e8e8", position:"relative", cursor:"pointer", transition:"background .2s", flexShrink:0 }}>
        <div style={{ position:"absolute", top:2.5, left:on?15:2.5, width:14, height:14, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
      </div>
      <span style={{ fontSize:12, color:"#888", fontWeight:600 }}>{label}</span>
    </label>
  );
}
