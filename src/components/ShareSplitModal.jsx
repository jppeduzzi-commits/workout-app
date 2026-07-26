import { useState } from "react";
import { inp } from "../constants";

export default function ShareSplitModal({ split, currentUser, onShare, onClose }) {
  const [targetUser, setTargetUser] = useState("");
  const [sharing, setSharing] = useState(false);
  const [done, setDone] = useState(false);

  const handleShare = async () => {
    const t = targetUser.trim();
    if (!t || t === currentUser) return;
    setSharing(true);
    await onShare(split, t);
    setDone(true);
    setTimeout(onClose, 1600);
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#fff", borderRadius:"18px 18px 0 0", padding:"24px 20px 40px" }}>
        <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a", marginBottom:6 }}>Share split</div>
        <div style={{ fontSize:12, color:"#888", marginBottom:20, lineHeight:1.5 }}>
          <strong>"{split?.name}"</strong> will be copied to the recipient as their own independent split. Changes you make after sharing won't sync automatically.
        </div>
        <input value={targetUser} onChange={e=>setTargetUser(e.target.value)}
          placeholder="Recipient username" autoCorrect="off" autoCapitalize="words" spellCheck={false}
          style={{ ...inp, width:"100%", boxSizing:"border-box", marginBottom:12, fontSize:15, padding:"11px 14px" }} />
        <button onClick={handleShare} disabled={!targetUser.trim()||sharing||done}
          style={{ width:"100%", padding:13, background:done?"#16a34a":"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer" }}>
          {done ? "✓ Sent!" : sharing ? "Sharing..." : "Share split"}
        </button>
      </div>
    </div>
  );
}
