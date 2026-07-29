import { isBrowserHelpKeyPayload } from "./cdpViewerUtils";

export type CdpResponsePayload = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: {
    code?: number;
    message?: string;
  };
};

type CdpRequestPayload = {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
};

type PendingRequest = {
  reject: (reason?: unknown) => void;
  resolve: (value: Record<string, unknown>) => void;
  timerId: number;
};

type CdpTransportEvents = {
  onClose: () => void;
  onEvent: (payload: CdpResponsePayload) => void;
};

const CDP_SOCKET_OPEN_TIMEOUT_MS = 8000;
export const CDP_REQUEST_TIMEOUT_MS = 10000;

export class CdpTransport {
  private nextRequestId = 1;

  private pending = new Map<number, PendingRequest>();

  private socket: WebSocket | null = null;

  constructor(
    private readonly endpoint: string,
    private readonly events: CdpTransportEvents,
  ) {}

  get isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }

    this.socket = await this.openSocket();
    this.socket.addEventListener("message", (event) => {
      this.handleSocketMessage(event.data);
    });
    this.socket.addEventListener("close", this.events.onClose);
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }

  failPending(detail: string) {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timerId);
      pending.reject(new Error(detail));
    }
    this.pending.clear();
  }

  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
    timeoutMs = CDP_REQUEST_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> {
    if (!this.isOpen) {
      throw new Error("CDP WebSocket 尚未连接。");
    }
    if (method === "Input.dispatchKeyEvent" && isBrowserHelpKeyPayload(params)) {
      return Promise.resolve({});
    }

    const id = this.nextRequestId++;
    const payload: CdpRequestPayload = { id, method };
    if (params) {
      payload.params = params;
    }
    if (sessionId) {
      payload.sessionId = sessionId;
    }

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timerId = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 请求超时：${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        timerId,
        reject,
        resolve,
      });
      this.socket!.send(JSON.stringify(payload));
    });
  }

  private openSocket() {
    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        settle(() => {
          try {
            socket.close();
          } catch {
            // Ignore close failures on a socket that never opened.
          }
          reject(new Error(`连接 CDP WebSocket 超时。${buildOriginHint(this.endpoint)}`));
        });
      }, CDP_SOCKET_OPEN_TIMEOUT_MS);

      const settle = (action: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        action();
      };

      socket.addEventListener(
        "open",
        () => {
          settle(() => resolve(socket));
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          settle(() => reject(new Error(buildOriginHint(this.endpoint))));
        },
        { once: true },
      );
      socket.addEventListener(
        "close",
        () => {
          settle(() => reject(new Error(buildOriginHint(this.endpoint))));
        },
        { once: true },
      );
    });
  }

  private handleSocketMessage(raw: unknown) {
    if (typeof raw !== "string") {
      return;
    }

    let payload: CdpResponsePayload;
    try {
      payload = JSON.parse(raw) as CdpResponsePayload;
    } catch {
      return;
    }

    if (typeof payload.id === "number") {
      const pending = this.pending.get(payload.id);
      if (!pending) {
        return;
      }
      this.pending.delete(payload.id);
      window.clearTimeout(pending.timerId);
      if (payload.error) {
        pending.reject(new Error(payload.error.message || "CDP 请求失败。"));
        return;
      }
      pending.resolve(payload.result ?? {});
      return;
    }

    this.events.onEvent(payload);
  }
}

export function buildOriginHint(endpoint: string) {
  let origin = "当前页面 origin";
  try {
    origin = window.location.origin;
  } catch {
    // ignore
  }

  return [
    `无法连接到 ${endpoint}。`,
    `如果浏览器返回 WebSocket origin 拒绝，请用 --remote-allow-origins=${origin} 重启目标浏览器。`,
  ].join(" ");
}
