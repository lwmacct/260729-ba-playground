import { Empty } from "antd";
import type { CdpViewerFrame } from "../api/cdpViewerClient";
import type { ViewerStageInputHandlers } from "../hooks/useViewerStageInput";
import { normalizeDisplayScale } from "../model/settings";
import styles from "./ViewerStage.module.css";

type ViewerStageProps = {
  bindStageElement: (node: HTMLDivElement | null) => void;
  bindSurfaceElement: (node: HTMLImageElement | null) => void;
  displayScale: number;
  frame: CdpViewerFrame | null;
  inputEnabled: boolean;
  inputHandlers: ViewerStageInputHandlers;
};

export function ViewerStage({
  bindStageElement,
  bindSurfaceElement,
  displayScale,
  frame,
  inputEnabled,
  inputHandlers,
}: ViewerStageProps) {
  const safeDisplayScale = normalizeDisplayScale(displayScale);
  const displayHeight = frame?.displayHeight
    ? frame.displayHeight * safeDisplayScale
    : undefined;
  const displayWidth = frame?.displayWidth
    ? frame.displayWidth * safeDisplayScale
    : undefined;

  return (
    <div
      className={styles.stage}
      ref={bindStageElement}
      tabIndex={0}
      onPointerDown={inputEnabled ? inputHandlers.handleStagePointerDown : undefined}
      onPointerMove={inputEnabled ? inputHandlers.handleStagePointerMove : undefined}
      onPointerUp={inputEnabled ? inputHandlers.handleStagePointerUp : undefined}
      onPointerCancel={inputEnabled ? inputHandlers.handleStagePointerUp : undefined}
      onWheel={inputEnabled ? inputHandlers.handleStageWheel : undefined}
      onFocus={inputHandlers.handleStageFocus}
      onBlur={inputHandlers.handleStageBlur}
      onContextMenu={(event) => event.preventDefault()}
    >
      {frame ? (
        <div className={styles.scroller}>
          <img
            className={styles.image}
            ref={bindSurfaceElement}
            src={frame.dataUrl}
            alt="CDP screencast"
            style={{
              height: displayHeight ? `${displayHeight}px` : undefined,
              width: displayWidth ? `${displayWidth}px` : undefined,
            }}
          />
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="连接后会自动显示当前标签页"
        />
      )}
    </div>
  );
}
