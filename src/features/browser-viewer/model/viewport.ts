export type ViewportSize = {
  height: number;
  width: number;
};

export type DesiredViewport = ViewportSize & {
  enabled: boolean;
};

const MIN_VIEWPORT_HEIGHT = 240;
const MIN_VIEWPORT_WIDTH = 320;

export function normalizeViewportSize(size: ViewportSize): ViewportSize {
  return {
    height: Math.floor(size.height),
    width: Math.floor(size.width),
  };
}

export function isUsableViewportSize(size: ViewportSize) {
  return size.width >= MIN_VIEWPORT_WIDTH && size.height >= MIN_VIEWPORT_HEIGHT;
}

export function viewportSizeKey(size: ViewportSize) {
  return `${size.width}x${size.height}`;
}
