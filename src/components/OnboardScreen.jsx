import { useState } from "react";
import { inp } from "../constants";

export default function OnboardScreen({ onSave }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await onSave(trimmed);
  };

  return (
    <div style={{ minHeight:"100dvh", background:"#f5f5f5", fontFamily:"Barlow,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <div style={{ width:"100%", maxWidth:340 }}>
        <div style={{ marginBottom:40 }}>
          <div style={{ fontSize:48, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.04em", lineHeight:1 }}>STACK</div>
        </div>
        <div style={{ fontSize:13, color:"#888", fontWeight:600, marginBottom:20 }}>What's your name?</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSave()}
          placeholder="Your name"
          autoFocus
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          style={{ ...inp, fontSize:16, padding:"12px 14px", marginBottom:12 }}
        />
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          style={{ display:"block", width:"100%", padding:"14px 18px", background:name.trim()?"#0a0a0a":"#e8e8e8", border:"none", borderRadius:12, color:name.trim()?"#fff":"#bbb", fontSize:15, fontWeight:800, fontFamily:"inherit", cursor:name.trim()?"pointer":"default", transition:"background .2s, color .2s" }}
        >
          {saving ? "..." : "Let's go →"}
        </button>
      </div>
    </div>
  );
}
