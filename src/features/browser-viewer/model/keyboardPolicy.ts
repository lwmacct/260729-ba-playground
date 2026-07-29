export type ViewerEditCommand =
  | "copy"
  | "cut"
  | "paste"
  | "selectAll"
  | "undo";

export type ViewerPageCommand = "reload";

export type ViewerKeyboardDecision =
  | {
    command: ViewerEditCommand;
    kind: "editCommand";
  }
  | {
    command: ViewerPageCommand;
    kind: "pageCommand";
  }
  | {
    kind: "remoteKeyboard";
  }
  | {
    kind: "swallow";
  };

export type ViewerKeyboardPolicySource = {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  keyCode?: number;
  metaKey: boolean;
  shiftKey: boolean;
  which?: number;
};

export function classifyViewerKeyboardEvent(
  event: ViewerKeyboardPolicySource,
): ViewerKeyboardDecision {
  if (isBlockedHostKeyboardEvent(event)) {
    return { kind: "swallow" };
  }

  if (event.key === "F5" || event.code === "F5") {
    return { kind: "swallow" };
  }

  if (!event.metaKey && !event.ctrlKey) {
    return { kind: "remoteKeyboard" };
  }

  if (event.altKey || event.shiftKey) {
    return { kind: "swallow" };
  }

  const command = shortcutCommands[getShortcutKey(event)];
  if (command) {
    return command;
  }

  return { kind: "swallow" };
}

const shortcutCommands: Record<string, ViewerKeyboardDecision | undefined> = {
  a: {
    kind: "editCommand",
    command: "selectAll",
  },
  c: {
    kind: "editCommand",
    command: "copy",
  },
  r: {
    kind: "pageCommand",
    command: "reload",
  },
  v: {
    kind: "editCommand",
    command: "paste",
  },
  x: {
    kind: "editCommand",
    command: "cut",
  },
  z: {
    kind: "editCommand",
    command: "undo",
  },
};

function getShortcutKey(event: ViewerKeyboardPolicySource) {
  if (/^Key[A-Z]$/.test(event.code)) {
    return event.code.slice(3).toLowerCase();
  }

  return event.key.toLowerCase();
}

function isBlockedHostKeyboardEvent(event: ViewerKeyboardPolicySource) {
  return isBrowserHelpKeyboardEvent(event) || isMacKeyboardFocusShortcut(event);
}

function isBrowserHelpKeyboardEvent(event: ViewerKeyboardPolicySource) {
  return (
    event.key === "F1" ||
    event.code === "F1" ||
    event.keyCode === 112 ||
    event.which === 112
  );
}

function isMacKeyboardFocusShortcut(event: ViewerKeyboardPolicySource) {
  if (!event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }

  const keyCode = event.keyCode || event.which || 0;
  return (
    event.code === "F2" ||
    event.code === "F3" ||
    event.code === "F4" ||
    event.code === "F5" ||
    event.code === "F6" ||
    event.code === "F7" ||
    event.code === "F8" ||
    keyCode >= 113 && keyCode <= 119
  );
}
