export default function Tag({ children, color, bg }) {
  return (
    <span style={{ background:bg, color, border:`1px solid ${color}44`, borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase" }}>
      {children}
    </span>
  );
}
