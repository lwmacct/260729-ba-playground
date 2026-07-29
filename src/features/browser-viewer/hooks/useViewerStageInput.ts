import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  CdpViewerFrame,
  CdpViewerKeyboardInput,
  CdpViewerMouseEvent,
} from "../api/cdpViewerClient";
import {
  buildMouseWheelEvent,
  buildPointerMouseEvent,
  mapPointerButton,
  mapPointerPointToRemote,
} from "../model/input";
import { classifyViewerKeyboardEvent } from "../model/keyboardPolicy";
import { RemoteKeyboardController } from "../model/keyboard";

const POINTER_DOUBLE_CLICK_DISTANCE_PX = 6;
const POINTER_DOUBLE_CLICK_TIMEOUT_MS = 500;
const KEYBOARD_CAPTURE_IDLE_RELEASE_MS = 8000;

type PointerPressState = {
  button: CdpViewerMouseEvent["button"];
  clickCount: number;
  pointerId: number;
};

type LastPointerClick = {
  button: CdpViewerMouseEvent["button"];
  clickCount: number;
  point: { x: number; y: number };
  time: number;
};

type UseViewerStageInputOptions = {
  frame: CdpViewerFrame | null;
  inputEnabled: boolean;
  onCommand: (command: "reload") => void;
  onKeyboardInput: (payload: CdpViewerKeyboardInput) => void;
  onMouseEvent: (payload: CdpViewerMouseEvent) => void;
  stageElement: HTMLElement | null;
  surfaceElement: HTMLElement | null;
};

export type ViewerStageInputHandlers = ReturnType<typeof useViewerStageInput>;

export function useViewerStageInput({
  frame,
  inputEnabled,
  onCommand,
  onKeyboardInput,
  onMouseEvent,
  stageElement,
  surfaceElement,
}: UseViewerStageInputOptions) {
  const activePointerIdRef = useRef<number | null>(null);
  const keyboardCapturedRef = useRef(false);
  const keyboardControllerRef = useRef(new RemoteKeyboardController());
  const keyboardCaptureTimerRef = useRef<number | null>(null);
  const lastRemotePointRef = useRef<{ x: number; y: number } | null>(null);
  const pointerPressStateRef = useRef<PointerPressState | null>(null);
  const lastPointerClickRef = useRef<LastPointerClick | null>(null);
  const onCommandRef = useRef(onCommand);
  const onKeyboardInputRef = useRef(onKeyboardInput);

  onCommandRef.current = onCommand;
  onKeyboardInputRef.current = onKeyboardInput;

  useEffect(() => {
    if (!inputEnabled || !stageElement) {
      keyboardCapturedRef.current = false;
      clearKeyboardCaptureTimer();
      releaseRemoteKeyboard();
      return;
    }

    const ownerDocument = stageElement.ownerDocument;
    const ownerWindow = ownerDocument.defaultView ?? window;
    const stageNode = stageElement;

    function isStageKeyboardTarget() {
      return ownerDocument.activeElement === stageNode;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (!isStageKeyboardTarget()) {
        return;
      }

      refreshKeyboardCapture();
      stopLocalKeyboardEvent(event);
      const decision = classifyViewerKeyboardEvent(event);
      if (decision.kind === "editCommand") {
        if (!event.repeat) {
          onKeyboardInputRef.current({
            kind: "editCommand",
            command: decision.command,
          });
        }
        return;
      }
      if (decision.kind === "pageCommand") {
        if (!event.repeat) {
          onCommandRef.current(decision.command);
        }
        return;
      }
      if (decision.kind === "swallow") {
        return;
      }
      const payloads = keyboardControllerRef.current.handleKeyDown(event);
      emitKeyboardInputs(payloads);
    }

    function handleWindowKeyUp(event: KeyboardEvent) {
      if (!isStageKeyboardTarget()) {
        return;
      }

      refreshKeyboardCapture();
      stopLocalKeyboardEvent(event);
      const decision = classifyViewerKeyboardEvent(event);
      if (decision.kind !== "remoteKeyboard") {
        return;
      }
      const payloads = keyboardControllerRef.current.handleKeyUp(event);
      emitKeyboardInputs(payloads);
    }

    function handleWindowKeyPress(event: KeyboardEvent) {
      if (!isStageKeyboardTarget()) {
        return;
      }

      refreshKeyboardCapture();
      stopLocalKeyboardEvent(event);
    }

    function handleWindowBlur() {
      scheduleKeyboardCaptureRelease(KEYBOARD_CAPTURE_IDLE_RELEASE_MS);
    }

    function handleWindowPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && stageNode.contains(event.target)) {
        return;
      }

      clearKeyboardCapture({ force: true });
    }

    function handleDocumentFocusIn(event: FocusEvent) {
      if (event.target instanceof Node && stageNode.contains(event.target)) {
        return;
      }

      clearKeyboardCapture({ force: true });
    }

    ownerWindow.addEventListener("keydown", handleWindowKeyDown, { capture: true });
    ownerWindow.addEventListener("keypress", handleWindowKeyPress, { capture: true });
    ownerWindow.addEventListener("keyup", handleWindowKeyUp, { capture: true });
    ownerWindow.addEventListener("blur", handleWindowBlur, { capture: true });
    ownerWindow.addEventListener("pointerdown", handleWindowPointerDown, { capture: true });
    ownerDocument.addEventListener("focusin", handleDocumentFocusIn, { capture: true });

    return () => {
      ownerWindow.removeEventListener("keydown", handleWindowKeyDown, { capture: true });
      ownerWindow.removeEventListener("keypress", handleWindowKeyPress, { capture: true });
      ownerWindow.removeEventListener("keyup", handleWindowKeyUp, { capture: true });
      ownerWindow.removeEventListener("blur", handleWindowBlur, { capture: true });
      ownerWindow.removeEventListener("pointerdown", handleWindowPointerDown, { capture: true });
      ownerDocument.removeEventListener("focusin", handleDocumentFocusIn, { capture: true });
      clearKeyboardCapture({ force: true });
    };
  }, [inputEnabled, stageElement]);

  function handleStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!inputEnabled) {
      return;
    }

    if (
      activePointerIdRef.current !== null &&
      event.pointerId !== activePointerIdRef.current
    ) {
      return;
    }

    const point = mapPointerPointToRemote(surfaceElement, frame, event);
    if (!point) {
      return;
    }

    lastRemotePointRef.current = point;
    const pressState = pointerPressStateRef.current;
    const payload = buildPointerMouseEvent(point, event, "mouseMoved", {
      button: pressState?.button ?? "none",
      buttons: pressState ? event.buttons || getButtonsBitmask(pressState.button) : 0,
      clickCount: 0,
    });
    if (payload) {
      onMouseEvent(payload);
    }
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!inputEnabled) {
      return;
    }

    if (
      activePointerIdRef.current !== null &&
      event.pointerId !== activePointerIdRef.current
    ) {
      return;
    }

    const point = mapPointerPointToRemote(surfaceElement, frame, event);
    if (!point) {
      return;
    }

    const button = mapPointerButton(event);
    if (!button) {
      return;
    }

    const clickCount = getPointerClickCount(button, point);
    const buttons = event.buttons || getButtonsBitmask(button);
    const payload = buildPointerMouseEvent(point, event, "mousePressed", {
      button,
      buttons,
      clickCount,
    });
    if (!payload) {
      return;
    }

    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    captureRemoteKeyboard();
    pointerPressStateRef.current = {
      button,
      clickCount,
      pointerId: event.pointerId,
    };
    activePointerIdRef.current = event.pointerId;
    lastRemotePointRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    onMouseEvent(payload);
  }

  function handleStagePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!inputEnabled) {
      pointerPressStateRef.current = null;
      activePointerIdRef.current = null;
      return;
    }

    const pressState = pointerPressStateRef.current;
    if (
      !pressState ||
      activePointerIdRef.current !== event.pointerId ||
      pressState.pointerId !== event.pointerId
    ) {
      return;
    }

    const point =
      mapPointerPointToRemote(surfaceElement, frame, event) ?? lastRemotePointRef.current;
    pointerPressStateRef.current = null;
    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!point) {
      return;
    }

    lastRemotePointRef.current = point;
    const payload = buildPointerMouseEvent(point, event, "mouseReleased", {
      button: pressState.button,
      buttons: 0,
      clickCount: pressState.clickCount,
    });
    if (payload) {
      onMouseEvent(payload);
      rememberPointerClick(pressState.button, point, pressState.clickCount);
    }
  }

  function handleStageWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!inputEnabled) {
      return;
    }

    event.preventDefault();

    const point = mapPointerPointToRemote(surfaceElement, frame, event);
    if (!point) {
      return;
    }

    lastRemotePointRef.current = point;
    onMouseEvent(buildMouseWheelEvent(point, event));
  }

  function handleStageFocus() {
    captureRemoteKeyboard();
  }

  function handleStageBlur() {
    scheduleKeyboardCaptureRelease(KEYBOARD_CAPTURE_IDLE_RELEASE_MS);
  }

  function getPointerClickCount(
    button: CdpViewerMouseEvent["button"],
    point: { x: number; y: number },
  ) {
    const previous = lastPointerClickRef.current;
    const now = window.performance.now();
    if (
      previous &&
      previous.button === button &&
      now - previous.time <= POINTER_DOUBLE_CLICK_TIMEOUT_MS &&
      getPointDistance(previous.point, point) <= POINTER_DOUBLE_CLICK_DISTANCE_PX
    ) {
      return Math.min(previous.clickCount + 1, 2);
    }

    return 1;
  }

  function rememberPointerClick(
    button: CdpViewerMouseEvent["button"],
    point: { x: number; y: number },
    clickCount: number,
  ) {
    lastPointerClickRef.current = {
      button,
      clickCount,
      point,
      time: window.performance.now(),
    };
  }

  function emitKeyboardInputs(payloads: CdpViewerKeyboardInput[]) {
    for (const payload of payloads) {
      onKeyboardInputRef.current(payload);
    }
  }

  function releaseRemoteKeyboard() {
    emitKeyboardInputs(keyboardControllerRef.current.releaseAll());
  }

  function captureRemoteKeyboard() {
    keyboardCapturedRef.current = true;
    scheduleKeyboardCaptureRelease(KEYBOARD_CAPTURE_IDLE_RELEASE_MS);
  }

  function refreshKeyboardCapture() {
    keyboardCapturedRef.current = true;
    scheduleKeyboardCaptureRelease(KEYBOARD_CAPTURE_IDLE_RELEASE_MS);
  }

  function scheduleKeyboardCaptureRelease(delayMs: number) {
    clearKeyboardCaptureTimer();
    const ownerWindow = stageElement?.ownerDocument.defaultView ?? window;
    keyboardCaptureTimerRef.current = ownerWindow.setTimeout(() => {
      keyboardCaptureTimerRef.current = null;
      clearKeyboardCapture();
    }, delayMs);
  }

  function clearKeyboardCapture(options: { force?: boolean } = {}) {
    clearKeyboardCaptureTimer();
    if (!keyboardCapturedRef.current) {
      return;
    }

    keyboardCapturedRef.current = false;
    releaseRemoteKeyboard();
  }

  function clearKeyboardCaptureTimer() {
    if (keyboardCaptureTimerRef.current === null) {
      return;
    }

    const ownerWindow = stageElement?.ownerDocument.defaultView ?? window;
    ownerWindow.clearTimeout(keyboardCaptureTimerRef.current);
    keyboardCaptureTimerRef.current = null;
  }

  return {
    handleStageBlur,
    handleStageFocus,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerUp,
    handleStageWheel,
  };
}

function stopLocalKeyboardEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function getPointDistance(
  first: { x: number; y: number },
  second: { x: number; y: number },
) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function getButtonsBitmask(button: CdpViewerMouseEvent["button"]) {
  switch (button) {
    case "left":
      return 1;
    case "right":
      return 2;
    case "middle":
      return 4;
    case "back":
      return 8;
    case "forward":
      return 16;
    default:
      return 0;
  }
}
