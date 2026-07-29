import { useEffect, useRef } from "react";

type Focusable = {
  focus: () => void;
};

export function useAutoFocusWhen<T extends Focusable>(
  enabled: boolean,
  targetRef: React.RefObject<T | null>,
) {
  const frameRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const firstFrameId = window.requestAnimationFrame(() => {
      const secondFrameId = window.requestAnimationFrame(() => {
        targetRef.current?.focus();
      });
      frameRef.current = secondFrameId;
    });
    const timeoutId = window.setTimeout(() => {
      targetRef.current?.focus();
    }, 80);
    frameRef.current = firstFrameId;

    return () => {
      window.cancelAnimationFrame(frameRef.current);
      window.clearTimeout(timeoutId);
    };
  }, [enabled, targetRef]);
}
