import { useEffect } from "react";

const FIELD = 'input:not([type="checkbox"]):not([type="radio"]), textarea';
const GAP = 12;

// Keeps the screen still when a text field inside a [data-typing-scroll]
// container is selected. The browser's own scroll/pan on focus is suppressed;
// the list scrolls only if the keyboard would actually cover the field, and
// only by as much as needed.
export default function useStableTyping() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    let field = null;
    let blurTimer, frame;

    const keepVisible = () => {
      if (!field || !field.isConnected) return;
      if (vv && vv.scale > 1.01) return; // user pinch-zoomed; leave them alone
      const scroller = field.closest("[data-typing-scroll]");
      if (!scroller) return;
      if (window.scrollY || vv?.offsetTop) window.scrollTo(0, 0); // undo browser pan
      const f = field.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      const bottom = Math.min(s.bottom, vv ? vv.height : window.innerHeight) - GAP;
      if (f.bottom > bottom) scroller.scrollTop += f.bottom - bottom;
      else if (f.top < s.top) scroller.scrollTop -= s.top - f.top + GAP;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(keepVisible); };
    const reset = () => { field = null; root.classList.remove("typing"); };

    // Focus the tapped field ourselves so the browser doesn't scroll to it.
    const onMouseDown = e => {
      const el = e.target;
      if (!touch || !el.matches?.(FIELD) || el.disabled || el === document.activeElement || !el.closest("[data-typing-scroll]")) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* number inputs don't support it */ }
    };
    const onFocusIn = e => {
      clearTimeout(blurTimer);
      if (!e.target.matches?.(FIELD) || !e.target.closest("[data-typing-scroll]")) { reset(); return; }
      field = e.target;
      if (touch) root.classList.add("typing");
      schedule();
    };
    const onFocusOut = () => { clearTimeout(blurTimer); blurTimer = setTimeout(reset, 200); };

    // If typing makes something appear above the field, cancel out the shift.
    const onInput = e => {
      const el = e.target;
      const scroller = el === field && el.closest("[data-typing-scroll]");
      if (!scroller) return;
      const before = el.getBoundingClientRect().top;
      requestAnimationFrame(() => {
        if (el.isConnected) scroller.scrollTop += el.getBoundingClientRect().top - before;
      });
    };

    document.addEventListener("input", onInput, true);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      clearTimeout(blurTimer);
      cancelAnimationFrame(frame);
      reset();
    };
  }, []);
}
