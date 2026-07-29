import type {
  CdpViewerKeyboardEvent,
  CdpViewerKeyboardInput,
} from "../api/cdpViewerClient";

export type KeyboardSource = {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  isComposing?: boolean;
  key: string;
  keyCode?: number;
  location: number;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
  which?: number;
};

type RemoteKey = {
  code: string;
  isModifier: boolean;
  key: string;
  location: number;
  nativeVirtualKeyCode: number;
  windowsVirtualKeyCode: number;
};

const modifierBits = {
  alt: 1,
  ctrl: 2,
  meta: 4,
  shift: 8,
};

const modifierCodes = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

const modifierKeys = {
  alt: {
    code: "AltLeft",
    isModifier: true,
    key: "Alt",
    location: 1,
    nativeVirtualKeyCode: 18,
    windowsVirtualKeyCode: 18,
  },
  control: {
    code: "ControlLeft",
    isModifier: true,
    key: "Control",
    location: 1,
    nativeVirtualKeyCode: 17,
    windowsVirtualKeyCode: 17,
  },
  meta: {
    code: "MetaLeft",
    isModifier: true,
    key: "Meta",
    location: 1,
    nativeVirtualKeyCode: 91,
    windowsVirtualKeyCode: 91,
  },
  shift: {
    code: "ShiftLeft",
    isModifier: true,
    key: "Shift",
    location: 1,
    nativeVirtualKeyCode: 16,
    windowsVirtualKeyCode: 16,
  },
} satisfies Record<string, RemoteKey>;

const keyVirtualKeyCodes: Record<string, number> = {
  Alt: 18,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  ArrowUp: 38,
  Backspace: 8,
  CapsLock: 20,
  Control: 17,
  Delete: 46,
  End: 35,
  Enter: 13,
  Escape: 27,
  F1: 112,
  F2: 113,
  F3: 114,
  F4: 115,
  F5: 116,
  F6: 117,
  F7: 118,
  F8: 119,
  F9: 120,
  F10: 121,
  F11: 122,
  F12: 123,
  Home: 36,
  Insert: 45,
  Meta: 91,
  NumLock: 144,
  PageDown: 34,
  PageUp: 33,
  Pause: 19,
  ScrollLock: 145,
  Shift: 16,
  Tab: 9,
};

const codeVirtualKeyCodes: Record<string, number> = {
  AltLeft: 18,
  AltRight: 18,
  Backspace: 8,
  CapsLock: 20,
  ControlLeft: 17,
  ControlRight: 17,
  Delete: 46,
  End: 35,
  Enter: 13,
  Escape: 27,
  Home: 36,
  Insert: 45,
  MetaLeft: 91,
  MetaRight: 92,
  NumpadEnter: 13,
  NumLock: 144,
  PageDown: 34,
  PageUp: 33,
  Pause: 19,
  ScrollLock: 145,
  ShiftLeft: 16,
  ShiftRight: 16,
  Space: 32,
  Tab: 9,
};

const codeKeyValues: Record<string, string> = {
  AltLeft: "Alt",
  AltRight: "Alt",
  Backspace: "Backspace",
  CapsLock: "CapsLock",
  ControlLeft: "Control",
  ControlRight: "Control",
  Delete: "Delete",
  End: "End",
  Enter: "Enter",
  Escape: "Escape",
  Home: "Home",
  Insert: "Insert",
  MetaLeft: "Meta",
  MetaRight: "Meta",
  NumpadEnter: "Enter",
  NumLock: "NumLock",
  PageDown: "PageDown",
  PageUp: "PageUp",
  Pause: "Pause",
  ScrollLock: "ScrollLock",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  Space: " ",
  Tab: "Tab",
};

const semanticKeyCodes: Record<string, string> = {
  Alt: "AltLeft",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  ArrowUp: "ArrowUp",
  Backspace: "Backspace",
  Control: "ControlLeft",
  Delete: "Delete",
  End: "End",
  Enter: "Enter",
  Escape: "Escape",
  Home: "Home",
  Insert: "Insert",
  Meta: "MetaLeft",
  PageDown: "PageDown",
  PageUp: "PageUp",
  Shift: "ShiftLeft",
  Tab: "Tab",
};

const legacyKeyCodeCodes: Record<number, string> = {
  8: "Backspace",
  9: "Tab",
  13: "Enter",
  16: "ShiftLeft",
  17: "ControlLeft",
  18: "AltLeft",
  27: "Escape",
  33: "PageUp",
  34: "PageDown",
  35: "End",
  36: "Home",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  45: "Insert",
  46: "Delete",
  91: "MetaLeft",
  92: "MetaRight",
};

const semanticKeyLocations: Record<string, number | undefined> = {
  AltLeft: 1,
  ControlLeft: 1,
  Enter: 0,
  MetaLeft: 1,
  ShiftLeft: 1,
  Tab: 0,
};

export class RemoteKeyboardController {
  private readonly localModifiers = new Map<string, RemoteKey>();

  private readonly pressedKeys = new Map<string, RemoteKey>();

  handleKeyDown(event: KeyboardSource): CdpViewerKeyboardInput[] {
    if (shouldIgnoreKeyboardEvent(event)) {
      return [];
    }

    const key = normalizeRemoteKey(event);
    if (!key) {
      return [];
    }

    if (key.isModifier) {
      this.localModifiers.set(key.code, key);
      return [];
    }

    this.syncLocalModifiers(event);

    if (isPlainTextKey(event) && this.localModifiers.size === 0) {
      return [{
        kind: "insertText",
        text: event.key,
      } satisfies CdpViewerKeyboardInput];
    }

    const alreadyPressed = this.pressedKeys.has(key.code);
    this.pressedKeys.set(key.code, key);
    const activeModifiers = this.getActiveModifiers();
    const modifierMask = getModifierMask(activeModifiers);
    return [{
      kind: "dispatchKey",
      event: buildDispatchKeyboardEvent(
        key,
        alreadyPressed || event.repeat,
        "down",
        modifierMask,
      ),
    }];
  }

  handleKeyUp(event: KeyboardSource): CdpViewerKeyboardInput[] {
    if (shouldIgnoreKeyboardEvent(event)) {
      return [];
    }

    const normalizedKey = normalizeRemoteKey(event);
    const key =
      (normalizedKey ? this.pressedKeys.get(normalizedKey.code) : undefined) ??
      this.pressedKeys.get(event.code) ??
      (normalizedKey ? this.localModifiers.get(normalizedKey.code) : undefined) ??
      this.localModifiers.get(event.code) ??
      normalizedKey;
    if (!key) {
      return [];
    }

    if (key.isModifier) {
      this.localModifiers.delete(key.code);
      return [];
    }

    this.syncLocalModifiers(event);

    const activeModifiers = this.getActiveModifiers();
    const modifierMask = getModifierMask(activeModifiers);
    this.pressedKeys.delete(key.code);
    return [{
      kind: "dispatchKey",
      event: buildDispatchKeyboardEvent(
        key,
        false,
        "up",
        modifierMask,
      ),
    }];
  }

  releaseAll(): CdpViewerKeyboardInput[] {
    const released: CdpViewerKeyboardInput[] = [];
    const activeModifiers = this.getActiveModifiers();
    const pressedKeys = [...this.pressedKeys.values()].reverse();
    for (const key of pressedKeys) {
      const modifiersBeforeRelease = getModifierMask(activeModifiers);
      this.pressedKeys.delete(key.code);
      released.push({
        kind: "dispatchKey",
        event: buildDispatchKeyboardEvent(
          key,
          false,
          "up",
          modifiersBeforeRelease,
        ),
      });
    }
    this.localModifiers.clear();
    return released;
  }

  private getActiveModifiers() {
    return new Map(this.localModifiers);
  }

  private syncLocalModifiers(event: KeyboardSource) {
    this.localModifiers.clear();
    if (event.ctrlKey) {
      this.localModifiers.set("ControlLeft", modifierKeys.control);
    }
    if (event.shiftKey) {
      this.localModifiers.set("ShiftLeft", modifierKeys.shift);
    }
    if (event.altKey) {
      this.localModifiers.set("AltLeft", modifierKeys.alt);
    }
    if (event.metaKey) {
      this.localModifiers.set("MetaLeft", modifierKeys.meta);
    }
  }
}

export function buildKeyboardInput(
  event: KeyboardSource,
  phase: "down" | "up",
): CdpViewerKeyboardInput | null {
  const controller = new RemoteKeyboardController();
  const inputs =
    phase === "down"
      ? controller.handleKeyDown(event)
      : controller.handleKeyUp(event);
  return inputs[0] ?? null;
}

function buildDispatchKeyboardEvent(
  key: RemoteKey,
  autoRepeat: boolean,
  phase: "down" | "up",
  modifiers: number,
): CdpViewerKeyboardEvent {
  const event: CdpViewerKeyboardEvent = {
    type: phase === "up" ? "keyUp" : "rawKeyDown",
    key: key.key,
    code: key.code,
    modifiers,
    windowsVirtualKeyCode: key.windowsVirtualKeyCode,
    nativeVirtualKeyCode: key.nativeVirtualKeyCode,
    autoRepeat,
    isKeypad: key.location === 3,
    location: key.location,
  };

  if (phase === "down" && shouldDispatchAsKeyDown(key)) {
    event.type = "keyDown";
  }

  if (phase === "down" && key.key === "Enter") {
    event.text = "\r";
    event.unmodifiedText = "\r";
  }

  return event;
}

function shouldDispatchAsKeyDown(key: RemoteKey) {
  return key.key === "Enter" || key.key === "Tab" || key.key === "Backspace";
}

function shouldIgnoreKeyboardEvent(event: KeyboardSource) {
  return !event.code || !event.key || event.key === "Process" || event.isComposing;
}

function normalizeRemoteKey(event: KeyboardSource): RemoteKey | null {
  const code = normalizeCode(event);
  if (!code) {
    return null;
  }
  const key = normalizeKey(event, code);
  const virtualKeyCode = getVirtualKeyCode(event, code, key);
  if (!virtualKeyCode && !isPlainTextKey(event)) {
    return null;
  }

  return {
    code,
    isModifier: modifierCodes.has(code),
    key,
    location: normalizeLocation(event, code),
    nativeVirtualKeyCode: virtualKeyCode,
    windowsVirtualKeyCode: virtualKeyCode,
  };
}

function normalizeCode(event: KeyboardSource) {
  if (isFunctionCode(event.code) && event.key !== event.code) {
    return semanticKeyCodes[event.key] ?? getLegacyNonFunctionCode(event) ?? "";
  }

  if (isFunctionCode(event.code) && event.key === event.code) {
    return getLegacyNonFunctionCode(event) ?? "";
  }

  if (event.key === "Enter" && event.code === "NumpadEnter") {
    return "NumpadEnter";
  }

  return event.code;
}

function normalizeKey(event: KeyboardSource, code: string) {
  const keyByCode = codeKeyValues[code];
  if (keyByCode) {
    return keyByCode;
  }

  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return code;
  }

  return event.key;
}

function getVirtualKeyCode(
  event: KeyboardSource,
  code: string,
  key: string,
) {
  const physicalCode = codeVirtualKeyCodes[code];
  if (physicalCode) {
    return physicalCode;
  }

  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return 111 + Number(code.slice(1));
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code.charCodeAt(3);
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.charCodeAt(5);
  }

  if (/^Numpad[0-9]$/.test(code)) {
    return 96 + Number(code.slice(6));
  }

  const namedCode = keyVirtualKeyCodes[key];
  if (namedCode) {
    return namedCode;
  }

  if (isPlainTextKey(event)) {
    return key.toUpperCase().charCodeAt(0);
  }

  return 0;
}

function getLegacyCode(event: KeyboardSource) {
  const legacyCode = resolveLegacyKeyCode(event);
  return legacyKeyCodeCodes[legacyCode];
}

function getLegacyNonFunctionCode(event: KeyboardSource) {
  const code = getLegacyCode(event);
  return code && !isFunctionCode(code) ? code : "";
}

function resolveLegacyKeyCode(event: KeyboardSource) {
  const keyCode = event.keyCode || 0;
  const which = event.which || 0;
  if (!keyCode || !which || keyCode === which) {
    return keyCode || which;
  }

  if (isFunctionKeyCode(keyCode) && !isFunctionKeyCode(which)) {
    return which;
  }
  if (isFunctionKeyCode(which) && !isFunctionKeyCode(keyCode)) {
    return keyCode;
  }

  return keyCode;
}

function normalizeLocation(event: KeyboardSource, code: string) {
  if (code === "NumpadEnter") {
    return 3;
  }

  return semanticKeyLocations[code] ?? event.location;
}

function isFunctionCode(code: string) {
  return /^F([1-9]|1[0-2])$/.test(code);
}

function isFunctionKeyCode(keyCode: number) {
  return keyCode >= 112 && keyCode <= 123;
}

function isPlainTextKey(event: KeyboardSource) {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function getModifierMask(pressed: Map<string, RemoteKey>) {
  let mask = 0;
  for (const key of pressed.values()) {
    if (!key.isModifier) {
      continue;
    }

    if (key.key === "Alt") {
      mask |= modifierBits.alt;
    } else if (key.key === "Control") {
      mask |= modifierBits.ctrl;
    } else if (key.key === "Meta") {
      mask |= modifierBits.meta;
    } else if (key.key === "Shift") {
      mask |= modifierBits.shift;
    }
  }
  return mask;
}
