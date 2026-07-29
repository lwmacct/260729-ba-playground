import assert from "node:assert/strict";
import test from "node:test";
import { buildKeyboardInput } from "./input";
import { RemoteKeyboardController } from "./keyboard";
import { classifyViewerKeyboardEvent } from "./keyboardPolicy";

function keyboardEvent(overrides: Partial<Parameters<typeof buildKeyboardInput>[0]>) {
  return {
    altKey: false,
    code: "Enter",
    ctrlKey: false,
    key: "Enter",
    location: 0,
    metaKey: false,
    repeat: false,
    shiftKey: false,
    ...overrides,
  };
}

test("maps Enter by key/code instead of stale browser keyCode", () => {
  const input = buildKeyboardInput(
    keyboardEvent({
      keyCode: 112,
      which: 112,
    }),
    "down",
  );

  assert.equal(input?.kind, "dispatchKey");
  if (input?.kind !== "dispatchKey") {
    return;
  }
  assert.equal(input.event.key, "Enter");
  assert.equal(input.event.code, "Enter");
  assert.equal(input.event.type, "keyDown");
  assert.equal(input.event.windowsVirtualKeyCode, 13);
  assert.equal(input.event.text, "\r");
  assert.equal(input.event.unmodifiedText, "\r");
});

test("normalizes Enter by physical code when browser key is stale", () => {
  const input = buildKeyboardInput(
    keyboardEvent({
      code: "Enter",
      key: "F1",
      keyCode: 112,
      which: 112,
    }),
    "down",
  );

  assert.equal(input?.kind, "dispatchKey");
  if (input?.kind !== "dispatchKey") {
    return;
  }
  assert.equal(input.event.key, "Enter");
  assert.equal(input.event.code, "Enter");
  assert.equal(input.event.windowsVirtualKeyCode, 13);
});

test("normalizes Enter by semantic key when physical code is stale F1", () => {
  const input = buildKeyboardInput(
    keyboardEvent({
      code: "F1",
      key: "Enter",
      keyCode: 13,
      which: 13,
    }),
    "down",
  );

  assert.equal(input?.kind, "dispatchKey");
  if (input?.kind !== "dispatchKey") {
    return;
  }
  assert.equal(input.event.key, "Enter");
  assert.equal(input.event.code, "Enter");
  assert.equal(input.event.windowsVirtualKeyCode, 13);
});

test("normalizes Enter when keyCode is stale F1 but which is Enter", () => {
  const input = buildKeyboardInput(
    keyboardEvent({
      code: "F1",
      key: "F1",
      keyCode: 112,
      which: 13,
    }),
    "down",
  );

  assert.equal(input?.kind, "dispatchKey");
  if (input?.kind !== "dispatchKey") {
    return;
  }
  assert.equal(input.event.key, "Enter");
  assert.equal(input.event.code, "Enter");
  assert.equal(input.event.windowsVirtualKeyCode, 13);
});

test("normalizes Enter when keyCode is stale F2 but which is Enter", () => {
  const input = buildKeyboardInput(
    keyboardEvent({
      code: "F2",
      key: "F2",
      keyCode: 113,
      which: 13,
    }),
    "down",
  );

  assert.equal(input?.kind, "dispatchKey");
  if (input?.kind !== "dispatchKey") {
    return;
  }
  assert.equal(input.event.key, "Enter");
  assert.equal(input.event.code, "Enter");
  assert.equal(input.event.windowsVirtualKeyCode, 13);
});

test("releases Enter when keyup is polluted as F1", () => {
  const keyboard = new RemoteKeyboardController();
  const enterDown = keyboard.handleKeyDown(keyboardEvent({
    code: "Enter",
    key: "Enter",
    keyCode: 13,
    which: 13,
  }));
  const enterUp = keyboard.handleKeyUp(keyboardEvent({
    code: "F1",
    key: "F1",
    keyCode: 112,
    which: 13,
  }));

  assert.equal(enterDown[0]?.kind, "dispatchKey");
  assert.equal(enterUp[0]?.kind, "dispatchKey");
  if (enterUp[0]?.kind !== "dispatchKey") {
    return;
  }
  assert.equal(enterUp[0].event.type, "keyUp");
  assert.equal(enterUp[0].event.key, "Enter");
  assert.equal(enterUp[0].event.code, "Enter");
  assert.equal(enterUp[0].event.windowsVirtualKeyCode, 13);
});

test("drops ambiguous F2 events instead of sending macOS menu focus shortcut", () => {
  const input = buildKeyboardInput(
    keyboardEvent({
      code: "F2",
      key: "F2",
      keyCode: 113,
      which: 113,
    }),
    "down",
  );

  assert.equal(input, null);
});

test("maps NumpadEnter to Enter virtual key code", () => {
  const input = buildKeyboardInput(
    keyboardEvent({
      code: "NumpadEnter",
      key: "Enter",
      location: 3,
    }),
    "down",
  );

  assert.equal(input?.kind, "dispatchKey");
  if (input?.kind !== "dispatchKey") {
    return;
  }
  assert.equal(input.event.windowsVirtualKeyCode, 13);
  assert.equal(input.event.isKeypad, true);
});

test("normalizes Shift+Tab by semantic key when physical code is stale F1", () => {
  const keyboard = new RemoteKeyboardController();
  const shiftDown = keyboard.handleKeyDown(keyboardEvent({
    code: "ShiftLeft",
    key: "Shift",
    location: 1,
    shiftKey: true,
  }));
  const tabDown = keyboard.handleKeyDown(keyboardEvent({
    code: "F1",
    key: "Tab",
    keyCode: 9,
    shiftKey: true,
    which: 9,
  }));

  assert.deepEqual(shiftDown, []);
  assert.equal(tabDown[0]?.kind, "dispatchKey");
  assert.equal(tabDown.length, 1);
  if (tabDown[0]?.kind !== "dispatchKey") {
    return;
  }
  assert.equal(tabDown[0].event.key, "Tab");
  assert.equal(tabDown[0].event.code, "Tab");
  assert.equal(tabDown[0].event.windowsVirtualKeyCode, 9);
  assert.equal(tabDown[0].event.modifiers, 8);
});

test("normalizes Shift by semantic key when physical code is stale F1", () => {
  const input = buildKeyboardInput(
    keyboardEvent({
      code: "F1",
      key: "Shift",
      keyCode: 16,
      location: 1,
      shiftKey: true,
      which: 16,
    }),
    "down",
  );

  assert.equal(input, null);
});

test("normalizes Shift by legacy code when key and code are both stale F1", () => {
  const input = buildKeyboardInput(
    keyboardEvent({
      code: "F1",
      key: "F1",
      keyCode: 16,
      location: 1,
      shiftKey: true,
      which: 16,
    }),
    "down",
  );

  assert.equal(input, null);
});

test("drops ambiguous F1 events instead of sending browser help", () => {
  const input = buildKeyboardInput(
    keyboardEvent({
      code: "F1",
      key: "F1",
      keyCode: 112,
      which: 112,
    }),
    "down",
  );

  assert.equal(input, null);
});

test("classifies Meta+A as a remote select-all shortcut", () => {
  const decision = classifyViewerKeyboardEvent(keyboardEvent({
    code: "KeyA",
    key: "a",
    metaKey: true,
  }));

  assert.deepEqual(decision, {
    kind: "editCommand",
    command: "selectAll",
  });
});

test("classifies Ctrl+A as a remote select-all shortcut", () => {
  const decision = classifyViewerKeyboardEvent(keyboardEvent({
    code: "KeyA",
    ctrlKey: true,
    key: "a",
  }));

  assert.deepEqual(decision, {
    kind: "editCommand",
    command: "selectAll",
  });
});

test("classifies supported edit and page command shortcuts", () => {
  assert.deepEqual(classifyViewerKeyboardEvent(keyboardEvent({
    code: "KeyC",
    key: "c",
    metaKey: true,
  })), {
    kind: "editCommand",
    command: "copy",
  });
  assert.deepEqual(classifyViewerKeyboardEvent(keyboardEvent({
    code: "KeyV",
    key: "v",
    metaKey: true,
  })), {
    kind: "editCommand",
    command: "paste",
  });
  assert.deepEqual(classifyViewerKeyboardEvent(keyboardEvent({
    code: "KeyX",
    key: "x",
    metaKey: true,
  })), {
    kind: "editCommand",
    command: "cut",
  });
  assert.deepEqual(classifyViewerKeyboardEvent(keyboardEvent({
    code: "KeyZ",
    key: "z",
    metaKey: true,
  })), {
    kind: "editCommand",
    command: "undo",
  });
  assert.deepEqual(classifyViewerKeyboardEvent(keyboardEvent({
    code: "KeyR",
    key: "r",
    metaKey: true,
  })), {
    kind: "pageCommand",
    command: "reload",
  });
});

test("swallows unsupported host modified shortcuts", () => {
  assert.deepEqual(classifyViewerKeyboardEvent(keyboardEvent({
    code: "KeyL",
    key: "l",
    metaKey: true,
  })), {
    kind: "swallow",
  });
  assert.deepEqual(classifyViewerKeyboardEvent(keyboardEvent({
    code: "KeyA",
    key: "a",
    metaKey: true,
    shiftKey: true,
  })), {
    kind: "swallow",
  });
});

test("dispatches Meta+A as a plain remote modified key outside policy", () => {
  const keyboard = new RemoteKeyboardController();
  const metaDown = keyboard.handleKeyDown(keyboardEvent({
    code: "MetaLeft",
    key: "Meta",
    location: 1,
    metaKey: true,
  }));
  const keyADown = keyboard.handleKeyDown(keyboardEvent({
    code: "KeyA",
    key: "a",
    metaKey: true,
  }));
  const keyAUp = keyboard.handleKeyUp(keyboardEvent({
    code: "KeyA",
    key: "a",
    metaKey: true,
  }));
  const metaUp = keyboard.handleKeyUp(keyboardEvent({
    code: "MetaLeft",
    key: "Meta",
    location: 1,
  }));

  assert.deepEqual(metaDown, []);
  assert.equal(keyADown[0]?.kind, "dispatchKey");
  assert.equal(keyADown.length, 1);
  assert.equal(keyAUp[0]?.kind, "dispatchKey");
  assert.equal(keyAUp.length, 1);
  if (
    keyADown[0]?.kind !== "dispatchKey" ||
    keyAUp[0]?.kind !== "dispatchKey"
  ) {
    return;
  }

  assert.equal(keyADown[0].event.key, "a");
  assert.equal(keyADown[0].event.type, "rawKeyDown");
  assert.equal(keyADown[0].event.modifiers, 4);
  assert.equal(keyADown[0].event.code, "KeyA");
  assert.equal(keyADown[0].event.commands, undefined);
  assert.equal(keyADown[0].event.windowsVirtualKeyCode, 65);
  assert.equal(keyAUp[0].event.key, "a");
  assert.equal(keyAUp[0].event.type, "keyUp");
  assert.equal(keyAUp[0].event.modifiers, 4);
  assert.deepEqual(metaUp, []);
});

test("dispatches Ctrl+A as a plain remote modified key outside policy", () => {
  const keyboard = new RemoteKeyboardController();
  const ctrlDown = keyboard.handleKeyDown(keyboardEvent({
    code: "ControlLeft",
    ctrlKey: true,
    key: "Control",
    location: 1,
  }));
  const keyADown = keyboard.handleKeyDown(keyboardEvent({
    code: "KeyA",
    ctrlKey: true,
    key: "a",
  }));
  const keyAUp = keyboard.handleKeyUp(keyboardEvent({
    code: "KeyA",
    ctrlKey: true,
    key: "a",
  }));
  const ctrlUp = keyboard.handleKeyUp(keyboardEvent({
    code: "ControlLeft",
    key: "Control",
    location: 1,
  }));

  assert.deepEqual(ctrlDown, []);
  assert.equal(keyADown[0]?.kind, "dispatchKey");
  assert.equal(keyAUp[0]?.kind, "dispatchKey");
  if (
    keyADown[0]?.kind !== "dispatchKey" ||
    keyAUp[0]?.kind !== "dispatchKey"
  ) {
    return;
  }

  assert.equal(keyADown[0].event.key, "a");
  assert.equal(keyADown[0].event.code, "KeyA");
  assert.equal(keyADown[0].event.modifiers, 2);
  assert.equal(keyADown[0].event.commands, undefined);
  assert.equal(keyAUp[0].event.modifiers, 2);
  assert.equal(keyAUp[0].event.commands, undefined);
  assert.deepEqual(ctrlUp, []);
});

test("releases pressed modifiers on capture loss", () => {
  const keyboard = new RemoteKeyboardController();
  keyboard.handleKeyDown(keyboardEvent({
    code: "MetaLeft",
    key: "Meta",
    location: 1,
    metaKey: true,
  }));
  keyboard.handleKeyDown(keyboardEvent({
    code: "ShiftLeft",
    key: "Shift",
    location: 1,
    metaKey: true,
    shiftKey: true,
  }));

  const released = keyboard.releaseAll();

  assert.deepEqual(released, []);
  assert.deepEqual(keyboard.releaseAll(), []);
});

test("resets stale local modifiers from the next key event snapshot", () => {
  const keyboard = new RemoteKeyboardController();
  keyboard.handleKeyDown(keyboardEvent({
    code: "ControlLeft",
    ctrlKey: true,
    key: "Control",
    location: 1,
  }));

  const enterDown = keyboard.handleKeyDown(keyboardEvent({
    code: "Enter",
    ctrlKey: false,
    key: "Enter",
    keyCode: 13,
    which: 13,
  }));

  assert.equal(enterDown[0]?.kind, "dispatchKey");
  if (enterDown[0]?.kind !== "dispatchKey") {
    return;
  }
  assert.equal(enterDown[0].event.key, "Enter");
  assert.equal(enterDown[0].event.modifiers, 0);
});
