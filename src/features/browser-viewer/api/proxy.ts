export type BrowserGatewayOptions = {
  browserGatewayUrl?: string;
  enabled?: boolean;
};

export function resolveViewerEndpoint(
  endpoint: unknown,
  options: BrowserGatewayOptions = {},
) {
  const rawEndpoint = typeof endpoint === "string" ? endpoint.trim() : "";
  if (!rawEndpoint) {
    return "";
  }

  if (!options.enabled) {
    return rawEndpoint;
  }

  const browserGatewayUrl = normalizeBrowserGatewayUrl(options.browserGatewayUrl);
  if (!browserGatewayUrl) {
    throw new Error("Browser Gateway 已启用，但 Browser Gateway URL 为空。");
  }

  if (!/^ws:\/\/[^/]+\/devtools\/browser\/[\w-]+$/i.test(rawEndpoint)) {
    throw new Error("开启 Browser Gateway 后，请输入原生 browser 级 CDP 地址。");
  }

  return resolveGatewayCdpEndpoint(rawEndpoint, browserGatewayUrl);
}

function resolveGatewayCdpEndpoint(rawEndpoint: string, browserGatewayUrl: string) {
  const url = new URL(`${browserGatewayUrl}/cdp`);
  url.searchParams.set("endpoint", rawEndpoint);
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }
  return url.toString();
}

function normalizeBrowserGatewayUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}
