import { useEffect } from "react";

const FIELD = 'input:not([type="checkbox"]):not([type="radio"]), textarea';

// While a text field inside a [data-typing-scroll] container has focus: shrink
// the app to the space above the on-screen keyboard (--app-h) and keep that
// field centered. The enlarged field styling lives in public/index.html.
export default function useTypingFocus() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    let field = null;
    let blurTimer, frame;

    const center = () => {
      if (!field || !field.isConnected) return;
      if (vv && vv.scale > 1.01) return; // user pinch-zoomed; leave them alone
      const scroller = field.closest("[data-typing-scroll]");
      if (!scroller) return;
      if (vv) root.style.setProperty("--app-h", `${vv.height}px`);
      // Undo the browser's own pan, which would push the header off screen.
      if (window.scrollY || vv?.offsetTop) window.scrollTo(0, 0);
      const f = field.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      const delta = f.top + f.height / 2 - (s.top + s.height / 2);
      if (Math.abs(delta) > 4) scroller.scrollTop += delta;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(center); };

    const reset = () => {
      field = null;
      root.classList.remove("typing");
      root.style.removeProperty("--app-h");
    };
    const onFocusIn = e => {
      clearTimeout(blurTimer);
      if (!e.target.matches?.(FIELD) || !e.target.closest("[data-typing-scroll]")) { reset(); return; }
      field = e.target;
      root.classList.add("typing");
      schedule();
    };
    // Delayed so moving between fields doesn't collapse and re-expand the page.
    const onFocusOut = () => { clearTimeout(blurTimer); blurTimer = setTimeout(reset, 200); };
    // You can scroll away to look at another exercise; typing brings you back.
    const onInput = e => { if (e.target === field) schedule(); };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("input", onInput);
    vv?.addEventListener("resize", schedule);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("input", onInput);
      vv?.removeEventListener("resize", schedule);
      clearTimeout(blurTimer);
      cancelAnimationFrame(frame);
      reset();
    };
  }, []);
}
