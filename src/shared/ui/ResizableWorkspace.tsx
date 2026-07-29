import { Fragment, useRef, useState } from "react";
import type {
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import {
  readLayoutPreferenceDefaultSizes,
  readLayoutPreferenceSizes,
  saveLayoutPreference,
} from "../preferences/layoutPreferences";
import styles from "./ResizableWorkspace.module.css";

const DIVIDER_SIZE = 8;
const DEFAULT_MIN_PANEL_SIZE = 240;
const KEYBOARD_RESIZE_STEP = 32;

export type ResizableWorkspacePanel = {
  className?: string;
  content: ReactNode;
  defaultSize?: number;
  key: string;
  minSize?: number;
};

type ResizableWorkspaceProps = {
  className?: string;
  dividerLabels?: string[];
  layoutId?: string;
  panels: ResizableWorkspacePanel[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeSizes(sizes: number[], panels: ResizableWorkspacePanel[]) {
  return panels.map((_, index) => Math.max(sizes[index] ?? 1, 0.001));
}

function getUsableWidth(node: HTMLDivElement, panelCount: number) {
  return Math.max(
    node.getBoundingClientRect().width - (panelCount - 1) * DIVIDER_SIZE,
    1,
  );
}

function sizesToPixels(sizes: number[], usableWidth: number) {
  const totalSize = sizes.reduce((sum, size) => sum + size, 0);
  return sizes.map((size) => (size / Math.max(totalSize, 1)) * usableWidth);
}

function pixelsToSizes(pixels: number[], usableWidth: number) {
  return pixels.map((pixel) => Math.max(pixel / Math.max(usableWidth, 1), 0.001));
}

function resizeAdjacentPanels({
  delta,
  dividerIndex,
  panels,
  sizes,
  usableWidth,
}: {
  delta: number;
  dividerIndex: number;
  panels: ResizableWorkspacePanel[];
  sizes: number[];
  usableWidth: number;
}) {
  const pixels = sizesToPixels(sizes, usableWidth);
  const pairSize = pixels[dividerIndex] + pixels[dividerIndex + 1];
  const leftMin = panels[dividerIndex]?.minSize ?? DEFAULT_MIN_PANEL_SIZE;
  const rightMin = panels[dividerIndex + 1]?.minSize ?? DEFAULT_MIN_PANEL_SIZE;
  let minLeft = leftMin;
  let maxLeft = pairSize - rightMin;

  if (maxLeft < minLeft) {
    minLeft = pairSize * (leftMin / (leftMin + rightMin));
    maxLeft = minLeft;
  }

  const nextLeft = clamp(pixels[dividerIndex] + delta, minLeft, maxLeft);
  pixels[dividerIndex] = nextLeft;
  pixels[dividerIndex + 1] = pairSize - nextLeft;
  return pixelsToSizes(pixels, usableWidth);
}

export function ResizableWorkspace({
  className,
  dividerLabels = [],
  layoutId,
  panels,
}: ResizableWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const panelKeys = panels.map((panel) => panel.key);
  const defaultSizes = layoutId
    ? readLayoutPreferenceDefaultSizes(layoutId, panelKeys) ??
      panels.map((panel) => panel.defaultSize ?? 1)
    : panels.map((panel) => panel.defaultSize ?? 1);
  const [sizes, setSizes] = useState(() =>
    normalizeSizes(
      layoutId
        ? readLayoutPreferenceSizes(layoutId, panelKeys) ?? defaultSizes
        : defaultSizes,
      panels,
    ),
  );

  const gridTemplateColumns = panels
    .flatMap((_, index) =>
      index === panels.length - 1 ? [`minmax(0, ${sizes[index]}fr)`] : [
        `minmax(0, ${sizes[index]}fr)`,
        `${DIVIDER_SIZE}px`,
      ],
    )
    .join(" ");

  function resizeByPixels(dividerIndex: number, delta: number) {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    const usableWidth = getUsableWidth(workspace, panels.length);
    setSizes((currentSizes) => {
      const nextSizes = resizeAdjacentPanels({
        delta,
        dividerIndex,
        panels,
        sizes: currentSizes,
        usableWidth,
      });
      if (layoutId) {
        saveLayoutPreference(layoutId, panelKeys, nextSizes);
      }
      return nextSizes;
    });
  }

  function startResize(
    dividerIndex: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startSizes = [...sizes];
    const usableWidth = getUsableWidth(workspace, panels.length);
    const target = event.currentTarget;

    function handlePointerMove(pointerEvent: PointerEvent) {
      const delta = pointerEvent.clientX - startX;
      setSizes(
        resizeAdjacentPanels({
          delta,
          dividerIndex,
          panels,
          sizes: startSizes,
          usableWidth,
        }),
      );
    }

    function handlePointerUp(pointerEvent: PointerEvent) {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      const delta = pointerEvent.clientX - startX;
      const nextSizes = resizeAdjacentPanels({
        delta,
        dividerIndex,
        panels,
        sizes: startSizes,
        usableWidth,
      });
      if (layoutId) {
        saveLayoutPreference(layoutId, panelKeys, nextSizes);
      }
      if (target.hasPointerCapture(pointerEvent.pointerId)) {
        target.releasePointerCapture(pointerEvent.pointerId);
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleDividerKeyDown(
    dividerIndex: number,
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    resizeByPixels(
      dividerIndex,
      event.key === "ArrowLeft" ? -KEYBOARD_RESIZE_STEP : KEYBOARD_RESIZE_STEP,
    );
  }

  return (
    <div
      ref={workspaceRef}
      className={className ? `${styles.workspace} ${className}` : styles.workspace}
      style={{ gridTemplateColumns }}
    >
      {panels.map((panel, index) => (
        <Fragment key={panel.key}>
          <div
            className={panel.className
              ? `${styles.panel} ${panel.className}`
              : styles.panel}
          >
            {panel.content}
          </div>
          {index < panels.length - 1 ? (
            <button
              type="button"
              aria-label={dividerLabels[index] ?? "调整面板宽度"}
              aria-orientation="vertical"
              className={styles.resizer}
              onKeyDown={(event) => handleDividerKeyDown(index, event)}
              onPointerDown={(event) => startResize(index, event)}
            />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
