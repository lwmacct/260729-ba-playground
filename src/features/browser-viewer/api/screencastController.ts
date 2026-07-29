import type {
  CdpResponsePayload,
  CdpTransport,
} from "./cdpTransport";

export type ScreencastFrame = {
  data: string;
  displayHeight: number;
  displayWidth: number;
  height: number;
  width: number;
};

export type ScreencastOptions = {
  everyNthFrame: number;
  maxHeight: number;
  maxWidth: number;
  quality: number;
};

export type ScreencastStream = {
  detachOnClose?: boolean;
  format: "jpeg" | "png";
  mode: "screencast";
  sessionId?: string;
  targetId?: string;
};

type ScreencastControllerOptions = {
  mode: "browser" | "page";
  transport: CdpTransport;
};

export class ScreencastController {
  constructor(private readonly options: ScreencastControllerOptions) {}

  async closeStream(stream: ScreencastStream | undefined) {
    if (!stream) {
      return;
    }

    const { mode, sessionId, targetId } = stream;
    if (mode === "screencast") {
      try {
        await this.options.transport.send("Page.stopScreencast", undefined, sessionId);
      } catch {
        // Ignore stop failures during cleanup.
      }
    }

    if (this.options.mode === "browser" && sessionId && targetId && stream.detachOnClose) {
      try {
        await this.options.transport.send("Target.detachFromTarget", { sessionId });
      } catch {
        // Ignore detach failures during cleanup.
      }
    }
  }

  async startStream(
    targetId: string | null,
    options: ScreencastOptions,
    existingSessionId?: string,
  ) {
    let detachOnClose = false;
    let sessionId = existingSessionId;
    if (this.options.mode === "browser") {
      if (!targetId) {
        throw new Error("请选择一个页面 target。");
      }
      if (!sessionId) {
        const attached = await this.options.transport.send("Target.attachToTarget", {
          targetId,
          flatten: true,
        });
        if (typeof attached.sessionId !== "string" || !attached.sessionId) {
          throw new Error("Target.attachToTarget 没有返回 sessionId。");
        }
        sessionId = attached.sessionId;
        detachOnClose = true;
      }
    } else {
      sessionId = undefined;
    }

    const format = options.quality >= 100 ? "png" : "jpeg";
    const stream: ScreencastStream = {
      detachOnClose,
      format,
      mode: "screencast",
      sessionId,
      targetId: targetId ?? undefined,
    };

    try {
      await this.options.transport.send("Page.enable", undefined, sessionId);
      await this.options.transport.send(
        "Page.startScreencast",
        {
          format,
          quality: options.quality,
          maxWidth: options.maxWidth,
          maxHeight: options.maxHeight,
          everyNthFrame: options.everyNthFrame,
        },
        sessionId,
      );
    } catch (error) {
      await this.closeStream(stream);
      throw error;
    }

    return stream;
  }

  handleFrame(
    payload: CdpResponsePayload,
    stream: ScreencastStream | undefined,
  ): ScreencastFrame | null {
    const data = payload.params?.data;
    const metadata = payload.params?.metadata;
    const frameSession = payload.params?.sessionId;
    const streamSessionId = payload.sessionId;

    if (typeof data !== "string") {
      return null;
    }

    if (
      this.options.mode === "browser" &&
      typeof streamSessionId === "string" &&
      stream?.sessionId &&
      streamSessionId !== stream.sessionId
    ) {
      this.ackFrame(frameSession, streamSessionId);
      return null;
    }

    const metadataRecord =
      metadata && typeof metadata === "object"
        ? (metadata as Record<string, unknown>)
        : null;
    const width =
      metadataRecord && typeof metadataRecord.deviceWidth === "number"
        ? metadataRecord.deviceWidth
        : 0;
    const height =
      metadataRecord && typeof metadataRecord.deviceHeight === "number"
        ? metadataRecord.deviceHeight
        : 0;

    this.ackFrame(frameSession, payload.sessionId);

    return {
      data,
      displayHeight: height,
      displayWidth: width,
      width,
      height,
    };
  }

  private ackFrame(frameSession: unknown, sessionId?: string) {
    if (typeof frameSession !== "number") {
      return;
    }

    void this.options.transport.send(
      "Page.screencastFrameAck",
      { sessionId: frameSession },
      sessionId,
    ).catch(() => undefined);
  }
}
