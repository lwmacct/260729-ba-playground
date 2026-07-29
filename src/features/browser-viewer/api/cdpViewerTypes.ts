export type CdpViewerTarget = {
  targetId: string;
  title: string;
  type: string;
  url: string;
  attached: boolean;
};

export type CdpViewerFrame = {
  dataUrl: string;
  displayHeight?: number;
  displayWidth?: number;
  height: number;
  receivedAt: number;
  width: number;
};

export type CdpViewerConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "disconnected";

export type CdpViewerStreamState =
  | "idle"
  | "starting"
  | "streaming"
  | "stopping"
  | "stopped";

export type CdpViewerMode = "browser" | "page";

export type CdpViewerMouseEvent = {
  button: "left" | "middle" | "right" | "back" | "forward" | "none";
  buttons?: number;
  clickCount: number;
  deltaX?: number;
  deltaY?: number;
  modifiers?: number;
  pointerType?: "mouse" | "pen";
  type: "mouseMoved" | "mousePressed" | "mouseReleased" | "mouseWheel";
  x: number;
  y: number;
};

export type CdpViewerKeyboardEvent = {
  autoRepeat?: boolean;
  code?: string;
  commands?: string[];
  isKeypad?: boolean;
  key?: string;
  location?: number;
  modifiers?: number;
  nativeVirtualKeyCode?: number;
  text?: string;
  type: "keyDown" | "keyUp" | "rawKeyDown" | "char";
  unmodifiedText?: string;
  windowsVirtualKeyCode?: number;
};

export type CdpViewerEditCommand =
  | "copy"
  | "cut"
  | "paste"
  | "selectAll"
  | "undo";

export type CdpViewerKeyboardInput =
  | {
    kind: "dispatchKey";
    event: CdpViewerKeyboardEvent;
  }
  | {
    command: CdpViewerEditCommand;
    kind: "editCommand";
  }
  | {
    kind: "insertText";
    text: string;
  };

export type CdpViewerTargetsChange = {
  reason: "changed" | "created" | "destroyed" | "refresh";
  targetId?: string;
};

export type CdpViewerViewportSize = {
  height: number;
  width: number;
};

export type TargetActivity = {
  hasFocus: boolean;
  visibilityState: string;
};

export type PageMetadata = {
  title: string;
  url: string;
};

export type WindowMetrics = {
  chromeHeight: number;
  chromeWidth: number;
  height: number;
  width: number;
};
