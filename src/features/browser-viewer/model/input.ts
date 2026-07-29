import type {
  CdpViewerFrame,
  CdpViewerMouseEvent,
} from "../api/cdpViewerClient";
export { buildKeyboardInput } from "./keyboard";

type PointerPoint = {
  clientX: number;
  clientY: number;
};

type ModifierSource = {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

type PointerMouseSource = ModifierSource & {
  button: number;
  buttons: number;
  pointerType: string;
};

type WheelSource = ModifierSource & {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  currentTarget: {
    clientHeight: number;
    clientWidth: number;
  };
};

const modifierBits = {
  alt: 1,
  ctrl: 2,
  meta: 4,
  shift: 8,
};

const wheelDeltaLineHeightPx = 40;

export function mapPointerPointToRemote(
  surfaceElement: HTMLElement | null,
  frame: CdpViewerFrame | null,
  point: PointerPoint,
) {
  if (!surfaceElement || !frame) {
    return null;
  }

  const surfaceRect = surfaceElement.getBoundingClientRect();
  if (surfaceRect.width <= 0 || surfaceRect.height <= 0) {
    return null;
  }

  const localX = point.clientX - surfaceRect.left;
  const localY = point.clientY - surfaceRect.top;
  if (
    localX < 0 ||
    localY < 0 ||
    localX > surfaceRect.width ||
    localY > surfaceRect.height
  ) {
    return null;
  }

  const remoteWidth = frame.displayWidth || frame.width;
  const remoteHeight = frame.displayHeight || frame.height;
  return {
    x: Number(((localX / surfaceRect.width) * remoteWidth).toFixed(2)),
    y: Number(((localY / surfaceRect.height) * remoteHeight).toFixed(2)),
  };
}

export function buildMouseWheelEvent(
  point: { x: number; y: number },
  event: WheelSource,
): CdpViewerMouseEvent {
  const { deltaX, deltaY } = normalizeWheelDelta(event);
  return {
    type: "mouseWheel",
    x: point.x,
    y: point.y,
    button: "none",
    buttons: 0,
    clickCount: 0,
    deltaX,
    deltaY,
    modifiers: getModifiers(event),
  };
}

export function buildPointerMouseEvent(
  point: { x: number; y: number },
  event: PointerMouseSource,
  type: "mouseMoved" | "mousePressed" | "mouseReleased",
  options: {
    button?: CdpViewerMouseEvent["button"];
    buttons?: number;
    clickCount?: number;
  } = {},
): CdpViewerMouseEvent | null {
  const button =
    options.button ??
    (type === "mouseMoved" ? "none" : mapMouseButton(event.button));
  if (!button) {
    return null;
  }

  return {
    type,
    x: point.x,
    y: point.y,
    button,
    buttons: options.buttons ?? event.buttons,
    clickCount: options.clickCount ?? (type === "mouseMoved" ? 0 : 1),
    modifiers: getModifiers(event),
    pointerType: event.pointerType === "pen" ? "pen" : "mouse",
  };
}

export function mapPointerButton(event: PointerMouseSource) {
  if (event.pointerType !== "mouse") {
    return "left";
  }

  return mapMouseButton(event.button);
}

function getModifiers(event: ModifierSource) {
  return (
    (event.altKey ? modifierBits.alt : 0) |
    (event.ctrlKey ? modifierBits.ctrl : 0) |
    (event.metaKey ? modifierBits.meta : 0) |
    (event.shiftKey ? modifierBits.shift : 0)
  );
}

function mapMouseButton(button: number) {
  switch (button) {
    case 0:
      return "left";
    case 1:
      return "middle";
    case 2:
      return "right";
    case 3:
      return "back";
    case 4:
      return "forward";
    default:
      return null;
  }
}

function normalizeWheelDelta(event: WheelSource) {
  if (event.deltaMode === 1) {
    return {
      deltaX: event.deltaX * wheelDeltaLineHeightPx,
      deltaY: event.deltaY * wheelDeltaLineHeightPx,
    };
  }

  if (event.deltaMode === 2) {
    return {
      deltaX: event.deltaX * event.currentTarget.clientWidth,
      deltaY: event.deltaY * event.currentTarget.clientHeight,
    };
  }

  return {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
  };
}
