import { useCallback, useEffect, useState } from "react";

type ElementSize = {
  height: number;
  width: number;
};

export function useElementSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ height: 0, width: 0 });

  const updateSize = useCallback((node: T | null) => {
    if (!node) {
      setSize({ height: 0, width: 0 });
      return;
    }

    const nextWidth = Math.floor(node.clientWidth);
    const nextHeight = Math.floor(node.clientHeight);
    setSize((current) =>
      current.width === nextWidth && current.height === nextHeight
        ? current
        : { height: nextHeight, width: nextWidth },
    );
  }, []);

  const ref = useCallback(
    (node: T | null) => {
      setElement(node);
      updateSize(node);
    },
    [updateSize],
  );

  useEffect(() => {
    if (!element) {
      return;
    }

    updateSize(element);

    const observer = new ResizeObserver(() => {
      updateSize(element);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element, updateSize]);

  return {
    element,
    ref,
    size,
  };
}
