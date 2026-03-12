import type { IncomingMessage, ServerResponse } from "node:http";
import {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "../infra/http-body.js";
import {
  CONTROL_UI_SELECTOR_HEALTH_PATH,
  CONTROL_UI_SELECTOR_RETRY_PATH,
  CONTROL_UI_SELECTOR_SELECT_PATH,
  CONTROL_UI_SELECTOR_SEND_PATH,
  CONTROL_UI_SELECTOR_STATE_PATH,
  CONTROL_UI_SELECTOR_STOP_PATH,
} from "./control-ui-contract.js";
import { buildControlUiCspHeader } from "./control-ui-csp.js";
import { normalizeControlUiBasePath } from "./control-ui-shared.js";

const DEFAULT_SELECTOR_PROXY_ORIGIN = "http://127.0.0.1:18796";
const SELECTOR_PROXY_TIMEOUT_MS = 10_000;
const SELECTOR_PROXY_MAX_BODY_BYTES = 1024 * 1024;
const SELECTOR_PROXY_UNAVAILABLE_DETAIL = "Selector sidecar unavailable via gateway proxy.";

type SelectorProxyRoute = {
  path: string;
  targetPath: string;
  methods: readonly ["GET"] | readonly ["POST"];
};

const SELECTOR_PROXY_ROUTES: readonly SelectorProxyRoute[] = [
  { path: CONTROL_UI_SELECTOR_HEALTH_PATH, targetPath: "/health", methods: ["GET"] },
  { path: CONTROL_UI_SELECTOR_STATE_PATH, targetPath: "/v1/state", methods: ["GET"] },
  { path: CONTROL_UI_SELECTOR_SELECT_PATH, targetPath: "/v1/select", methods: ["POST"] },
  { path: CONTROL_UI_SELECTOR_SEND_PATH, targetPath: "/v1/send", methods: ["POST"] },
  { path: CONTROL_UI_SELECTOR_STOP_PATH, targetPath: "/v1/stop", methods: ["POST"] },
  { path: CONTROL_UI_SELECTOR_RETRY_PATH, targetPath: "/v1/retry", methods: ["POST"] },
] as const;

export type ControlUiSelectorProxyOptions = {
  basePath?: string;
  selectorProxyOrigin?: string;
};

function applyControlUiSecurityHeaders(res: ServerResponse) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", buildControlUiCspHeader());
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(JSON.stringify(body));
}

function resolveSelectorProxyRoute(pathname: string, basePath: string): SelectorProxyRoute | null {
  const scopedPath =
    basePath && pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
  return SELECTOR_PROXY_ROUTES.find((route) => route.path === scopedPath) ?? null;
}

function buildSelectorProxyTarget(
  targetPath: string,
  search: string,
  selectorProxyOrigin?: string,
) {
  const origin = selectorProxyOrigin?.trim() || DEFAULT_SELECTOR_PROXY_ORIGIN;
  return new URL(`${targetPath}${search}`, origin).toString();
}

export async function handleControlUiSelectorProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts?: ControlUiSelectorProxyOptions,
): Promise<boolean> {
  const urlRaw = req.url;
  if (!urlRaw) {
    return false;
  }
  const url = new URL(urlRaw, "http://localhost");
  const basePath = normalizeControlUiBasePath(opts?.basePath);
  const route = resolveSelectorProxyRoute(url.pathname, basePath);
  if (!route) {
    return false;
  }

  applyControlUiSecurityHeaders(res);

  const method = (req.method ?? "GET").toUpperCase();
  if (!route.methods.includes(method as "GET" | "POST")) {
    res.statusCode = 405;
    res.setHeader("Allow", route.methods.join(", "));
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  let requestBody: string | undefined;
  if (method === "POST") {
    try {
      requestBody = await readRequestBodyWithLimit(req, {
        maxBytes: SELECTOR_PROXY_MAX_BODY_BYTES,
      });
    } catch (error) {
      if (isRequestBodyLimitError(error)) {
        sendJson(res, error.statusCode, {
          status: "error",
          error: "selector_proxy_invalid_request",
          detail: requestBodyErrorToText(error.code),
        });
        return true;
      }
      sendJson(res, 400, {
        status: "error",
        error: "selector_proxy_invalid_request",
        detail: "Invalid selector request body.",
      });
      return true;
    }
  }

  const headers = new Headers({ Accept: "application/json" });
  const contentType = req.headers["content-type"];
  if (method === "POST" && typeof contentType === "string" && contentType.trim()) {
    headers.set("Content-Type", contentType);
  }

  try {
    const response = await fetch(
      buildSelectorProxyTarget(route.targetPath, url.search, opts?.selectorProxyOrigin),
      {
        method,
        headers,
        ...(method === "POST" ? { body: requestBody ?? "" } : {}),
        signal: AbortSignal.timeout(SELECTOR_PROXY_TIMEOUT_MS),
      },
    );

    res.statusCode = response.status;
    const responseType = response.headers.get("content-type");
    if (responseType) {
      res.setHeader("Content-Type", responseType);
    }
    res.setHeader("Cache-Control", response.headers.get("cache-control") ?? "no-cache");

    const body = Buffer.from(await response.arrayBuffer());
    res.end(body.length > 0 ? body : undefined);
    return true;
  } catch {
    sendJson(res, 503, {
      status: "error",
      error: "selector_proxy_unavailable",
      detail: SELECTOR_PROXY_UNAVAILABLE_DETAIL,
    });
    return true;
  }
}
