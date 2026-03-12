import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./control-ui-selector.ts";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers,
  });
}

describe("control-ui-selector", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("renders degraded local availability without surfacing a fetch failure", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          localProviderReady: false,
          warnings: ["Local provider unavailable."],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          selectedMode: "fast",
          manualRouteId: "none",
          effectiveModelRef: "minimax/MiniMax-M2.5",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, localProviderReady: false }))
      .mockResolvedValueOnce(
        jsonResponse({
          selectedMode: "fast",
          manualRouteId: "none",
          effectiveModelRef: "minimax/MiniMax-M2.5",
        }),
      );

    const element = document.createElement("openclaw-control-ui-selector") as HTMLElement & {
      sessionKey: string;
    };
    element.sessionKey = "agent:main:main";
    document.body.append(element);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(element.querySelector(".openclaw-selector-chip__meta")?.textContent).toContain(
        "Local unavailable",
      ),
    );

    const chip = element.querySelector(".openclaw-selector-chip");
    expect(chip).not.toBeNull();
    chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await vi.waitFor(() =>
      expect(element.querySelector(".openclaw-selector-note")?.textContent).toContain(
        "Local provider unavailable",
      ),
    );

    const localButton = Array.from(element.querySelectorAll(".openclaw-selector-btn")).find(
      (button) => button.textContent?.includes("Local Qwen"),
    ) as HTMLButtonElement | undefined;
    expect(localButton).not.toBeUndefined();
    expect(localButton?.disabled).toBe(true);
    expect(element.textContent).not.toContain("TypeError: Failed to fetch");
  });

  it("routes selector actions through the same-origin gateway proxy", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true, localProviderReady: false }))
      .mockResolvedValueOnce(
        jsonResponse({
          selectedMode: "auto",
          manualRouteId: "none",
          effectiveModelRef: "minimax/MiniMax-M2.5",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, localProviderReady: false }))
      .mockResolvedValueOnce(
        jsonResponse({
          selectedMode: "auto",
          manualRouteId: "none",
          effectiveModelRef: "minimax/MiniMax-M2.5",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, localProviderReady: false }))
      .mockResolvedValueOnce(
        jsonResponse({
          selectedMode: "quality",
          manualRouteId: "none",
          effectiveModelRef: "minimax/MiniMax-M2.5",
        }),
      );

    const element = document.createElement("openclaw-control-ui-selector") as HTMLElement & {
      basePath: string;
      sessionKey: string;
    };
    element.basePath = "/openclaw";
    element.sessionKey = "agent:main:main";
    document.body.append(element);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const chip = element.querySelector(".openclaw-selector-chip");
    chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    const qualityButton = Array.from(element.querySelectorAll(".openclaw-selector-btn")).find(
      (button) => button.textContent?.trim() === "Quality",
    ) as HTMLButtonElement | undefined;
    expect(qualityButton).not.toBeUndefined();
    qualityButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain("/openclaw/__openclaw/selector/health");
    expect(urls).toContain("/openclaw/__openclaw/selector/v1/select");
    expect(urls.some((url) => url.includes("127.0.0.1:18796"))).toBe(false);
  });
});
