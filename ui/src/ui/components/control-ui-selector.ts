import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { CONTROL_UI_SELECTOR_PROXY_PREFIX } from "../../../../src/gateway/control-ui-contract.js";
import { icons } from "../icons.ts";
import { normalizeBasePath } from "../navigation.ts";

const SELECTOR_POLL_MS = 5000;
const MANUAL_ROUTE_NONE = "none";
const MANUAL_ROUTE_LOCAL_QWEN = "local_qwen35_9b_exl3";
const MANUAL_ROUTE_GPT54_LOW = "gpt54_low";
const MANUAL_ROUTE_GPT54_HIGH = "gpt54_high";
const MINIMAX_FAST_MODEL_REF = "minimax/MiniMax-M2.5";

type SelectorHealth = {
  localProviderReady?: boolean;
  warnings?: unknown[];
};

type SelectorState = {
  selectedMode?: string;
  manualRouteId?: string;
  lastManualRouteId?: string;
  effectiveModelRef?: string;
  activeRunId?: string;
  localThinkingEnabled?: boolean;
  warnings?: unknown[];
};

type NoticeKind = "info" | "warn" | "error";

@customElement("openclaw-control-ui-selector")
export class ControlUiSelector extends LitElement {
  @property() basePath = "";
  @property() sessionKey = "agent:main:main";
  @property() draftText = "";
  @property({ type: Boolean }) hasAttachments = false;
  @property({ type: Boolean, attribute: false }) gatewayConnected = true;

  @state() private panelOpen = false;
  @state() private health: SelectorHealth | null = null;
  @state() private selector: SelectorState | null = null;
  @state() private error: string | null = null;
  @state() private notice: string | null = null;
  @state() private noticeKind: NoticeKind = "info";

  private pollTimer: number | null = null;
  private noticeTimer: number | null = null;
  private requestToken = 0;
  private readonly handleDocumentClick = (event: MouseEvent) => {
    if (!this.panelOpen) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node) || this.contains(target)) {
      return;
    }
    this.panelOpen = false;
  };
  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.panelOpen) {
      this.panelOpen = false;
    }
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.handleDocumentClick);
    document.addEventListener("keydown", this.handleDocumentKeydown);
    this.startPolling();
    void this.refreshState();
  }

  disconnectedCallback() {
    this.stopPolling();
    this.clearNoticeTimer();
    document.removeEventListener("click", this.handleDocumentClick);
    document.removeEventListener("keydown", this.handleDocumentKeydown);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has("gatewayConnected")) {
      if (this.gatewayConnected) {
        this.startPolling();
        void this.refreshState({ keepExistingState: true });
      } else {
        this.stopPolling();
        this.panelOpen = false;
        this.health = null;
        this.selector = null;
        this.error = null;
      }
      return;
    }

    if (this.gatewayConnected && (changed.has("basePath") || changed.has("sessionKey"))) {
      void this.refreshState({ keepExistingState: true });
    }
  }

  private startPolling() {
    if (this.pollTimer != null || !this.gatewayConnected) {
      return;
    }
    this.pollTimer = window.setInterval(() => {
      void this.refreshState({ keepExistingState: true });
    }, SELECTOR_POLL_MS);
  }

  private stopPolling() {
    if (this.pollTimer == null) {
      return;
    }
    window.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private clearNoticeTimer() {
    if (this.noticeTimer == null) {
      return;
    }
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
  }

  private selectorBasePath() {
    return `${normalizeBasePath(this.basePath)}${CONTROL_UI_SELECTOR_PROXY_PREFIX}`;
  }

  private warningList(): string[] {
    const warnings: string[] = [];
    const combined = this.localFallbackActive()
      ? [...(this.selector?.warnings ?? []), ...(this.health?.warnings ?? [])]
      : [...(this.health?.warnings ?? []), ...(this.selector?.warnings ?? [])];
    for (const warning of combined) {
      if (typeof warning !== "string") {
        continue;
      }
      const normalized = warning.trim();
      if (!normalized || warnings.includes(normalized)) {
        continue;
      }
      warnings.push(normalized);
    }
    return warnings;
  }

  private localProviderReady() {
    return this.health?.localProviderReady !== false;
  }

  private effectiveModelRef() {
    return typeof this.selector?.effectiveModelRef === "string"
      ? this.selector.effectiveModelRef.trim()
      : "";
  }

  private hasRawLocalFallbackWarning() {
    const combined = [...(this.health?.warnings ?? []), ...(this.selector?.warnings ?? [])];
    return combined.some(
      (warning) =>
        typeof warning === "string" &&
        warning.includes("Local Qwen") &&
        warning.includes("MiniMax-M2.5"),
    );
  }

  private localFallbackActive() {
    return (
      this.selector?.manualRouteId === MANUAL_ROUTE_LOCAL_QWEN &&
      (this.hasRawLocalFallbackWarning() ||
        (!this.localProviderReady() && this.effectiveModelRef() === MINIMAX_FAST_MODEL_REF))
    );
  }

  private activeManualRouteId() {
    const active =
      typeof this.selector?.manualRouteId === "string" ? this.selector.manualRouteId : "";
    if (active && active !== MANUAL_ROUTE_NONE) {
      return active;
    }
    const last =
      typeof this.selector?.lastManualRouteId === "string" ? this.selector.lastManualRouteId : "";
    return last || MANUAL_ROUTE_NONE;
  }

  private manualRouteLabel(routeId: string) {
    switch (routeId) {
      case MANUAL_ROUTE_LOCAL_QWEN:
        return "Local Qwen";
      case MANUAL_ROUTE_GPT54_LOW:
        return "GPT-5.4 Low";
      case MANUAL_ROUTE_GPT54_HIGH:
        return "GPT-5.4 High";
      default:
        return "Manual";
    }
  }

  private modeLabel() {
    const manualRouteId =
      typeof this.selector?.manualRouteId === "string"
        ? this.selector.manualRouteId
        : MANUAL_ROUTE_NONE;
    if (manualRouteId && manualRouteId !== MANUAL_ROUTE_NONE) {
      return this.manualRouteLabel(manualRouteId);
    }
    switch (this.selector?.selectedMode) {
      case "fast":
        return "Fast";
      case "quality":
        return "Quality";
      default:
        return "Auto";
    }
  }

  private modelLabel() {
    const modelRef = this.effectiveModelRef();
    if (!modelRef) {
      return this.selector ? "Pending" : "Unavailable";
    }
    const slash = modelRef.indexOf("/");
    return slash >= 0 ? modelRef.slice(slash + 1) : modelRef;
  }

  private chipLabel() {
    if (!this.gatewayConnected) {
      return "Selector";
    }
    if (this.error) {
      return "Selector offline";
    }
    return this.modeLabel();
  }

  private chipMeta() {
    if (!this.gatewayConnected) {
      return "Gateway offline";
    }
    if (this.error) {
      return "Retrying";
    }
    if (this.localFallbackActive()) {
      return "MiniMax fallback";
    }
    if (!this.localProviderReady()) {
      return "Local unavailable";
    }
    return this.modelLabel();
  }

  private setNotice(text: string | null, kind: NoticeKind = "info", sticky = false) {
    this.notice = text;
    this.noticeKind = kind;
    this.clearNoticeTimer();
    if (!sticky && text) {
      this.noticeTimer = window.setTimeout(() => {
        this.notice = null;
        this.noticeTimer = null;
      }, 4500);
    }
  }

  private async fetchJson(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    if (init?.body) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${this.selectorBasePath()}${path}`, {
      ...init,
      credentials: "same-origin",
      headers,
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const detail =
        payload &&
        typeof payload === "object" &&
        "detail" in payload &&
        typeof payload.detail === "string"
          ? payload.detail
          : payload &&
              typeof payload === "object" &&
              "error" in payload &&
              typeof payload.error === "string"
            ? payload.error
            : `${response.status} ${response.statusText}`.trim();
      throw new Error(detail || "Selector request failed.");
    }
    return payload;
  }

  private async refreshState(options?: { keepExistingState?: boolean }) {
    if (!this.gatewayConnected) {
      return;
    }
    const token = ++this.requestToken;
    try {
      const [health, selector] = await Promise.all([
        this.fetchJson("/health"),
        this.fetchJson(`/v1/state?sessionKey=${encodeURIComponent(this.sessionKey)}`),
      ]);
      if (token !== this.requestToken) {
        return;
      }
      this.health = (health as SelectorHealth | null) ?? null;
      this.selector = (selector as SelectorState | null) ?? null;
      this.error = null;
    } catch (error) {
      if (token !== this.requestToken) {
        return;
      }
      this.error = error instanceof Error ? error.message : String(error);
      if (!options?.keepExistingState) {
        this.health = null;
        this.selector = null;
      }
    }
  }

  private selectionPayload(overrides: Record<string, unknown>) {
    return {
      sessionKey: this.sessionKey,
      draftText: this.draftText,
      hasAttachments: this.hasAttachments,
      localThinkingEnabled: this.selector?.localThinkingEnabled !== false,
      ...overrides,
    };
  }

  canHandleComposerSend(options?: { hasAttachments?: boolean }) {
    return this.gatewayConnected && !this.error && options?.hasAttachments !== true;
  }

  async sendComposerDraft(params: { draftText: string; clientRunId: string }) {
    const draftText = params.draftText.trim();
    if (!draftText) {
      return null;
    }
    const manualRouteId =
      typeof this.selector?.manualRouteId === "string"
        ? this.selector.manualRouteId
        : MANUAL_ROUTE_NONE;
    const selectedMode =
      typeof this.selector?.selectedMode === "string" ? this.selector.selectedMode : "auto";
    const payload = this.selectionPayload({
      mode: selectedMode,
      manualRouteId,
      draftText,
      hasAttachments: false,
      clientRunId: params.clientRunId,
    });
    const response = (await this.fetchJson("/v1/send", {
      method: "POST",
      body: JSON.stringify(payload),
    })) as { send?: { runId?: unknown } } | null;
    this.error = null;
    await this.refreshState({ keepExistingState: true });
    const runId = response?.send?.runId;
    return typeof runId === "string" && runId.trim() ? runId.trim() : params.clientRunId;
  }

  private async postSelection(
    path: string,
    payload: Record<string, unknown>,
    success: string,
    kind: NoticeKind = "info",
  ) {
    try {
      await this.fetchJson(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      this.error = null;
      this.setNotice(success, kind);
      await this.refreshState({ keepExistingState: true });
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async handleRefresh() {
    this.setNotice("Refreshing selector state…");
    await this.refreshState({ keepExistingState: true });
  }

  private async handleStop() {
    const runId =
      typeof this.selector?.activeRunId === "string" ? this.selector.activeRunId.trim() : "";
    await this.postSelection(
      "/v1/stop",
      {
        sessionKey: this.sessionKey,
        ...(runId ? { runId } : {}),
      },
      "Stop requested.",
      "warn",
    );
  }

  private async handleRetry(mode: "fast" | "quality" | "manual") {
    const manualRouteId = this.activeManualRouteId();
    const payload =
      mode === "manual"
        ? {
            sessionKey: this.sessionKey,
            mode: "auto",
            manualRouteId,
            localThinkingEnabled: this.selector?.localThinkingEnabled !== false,
          }
        : {
            sessionKey: this.sessionKey,
            mode,
            manualRouteId: MANUAL_ROUTE_NONE,
            localThinkingEnabled: this.selector?.localThinkingEnabled !== false,
          };
    const label =
      mode === "manual"
        ? `Retrying in ${this.manualRouteLabel(manualRouteId)}.`
        : `Retrying in ${mode === "fast" ? "Fast" : "Quality"}.`;
    await this.postSelection("/v1/retry", payload, label);
  }

  private async handleSelectMode(mode: "auto" | "fast" | "quality") {
    await this.postSelection(
      "/v1/select",
      this.selectionPayload({
        mode,
        manualRouteId: MANUAL_ROUTE_NONE,
      }),
      `Selected ${mode === "auto" ? "Auto" : mode === "fast" ? "Fast" : "Quality"}.`,
    );
  }

  private async handleSelectManual(manualRouteId: string, label: string) {
    await this.postSelection(
      "/v1/select",
      this.selectionPayload({
        mode: "auto",
        manualRouteId,
      }),
      `Selected ${label}.`,
    );
  }

  private renderPanelNotice() {
    if (!this.gatewayConnected) {
      return html`
        <div class="openclaw-selector-note openclaw-selector-note--error">Gateway offline.</div>
      `;
    }
    if (this.error) {
      return html`
        <div class="openclaw-selector-note openclaw-selector-note--error">${this.error}</div>
      `;
    }
    if (this.notice) {
      return html`
        <div class="openclaw-selector-note openclaw-selector-note--${this.noticeKind}">
          ${this.notice}
        </div>
      `;
    }
    const warning = this.warningList()[0];
    if (warning) {
      return html`
        <div class="openclaw-selector-note openclaw-selector-note--warn">${warning}</div>
      `;
    }
    if (this.localFallbackActive()) {
      return html`
        <div class="openclaw-selector-note openclaw-selector-note--warn">
          Local Qwen is unavailable. Using MiniMax-M2.5 until the local provider recovers.
        </div>
      `;
    }
    if (!this.localProviderReady()) {
      return html`
        <div class="openclaw-selector-note openclaw-selector-note--warn">
          Local provider unavailable. Selecting Local Qwen will use MiniMax-M2.5 until local recovers.
        </div>
      `;
    }
    return nothing;
  }

  render() {
    const selectorUnavailable = !this.gatewayConnected || Boolean(this.error);
    const localProviderReady = this.localProviderReady();
    const activeRunId =
      typeof this.selector?.activeRunId === "string" ? this.selector.activeRunId.trim() : "";
    const manualRouteId =
      typeof this.selector?.manualRouteId === "string"
        ? this.selector.manualRouteId
        : MANUAL_ROUTE_NONE;
    const activeManualRoute = this.activeManualRouteId();
    const selectedMode =
      typeof this.selector?.selectedMode === "string" ? this.selector.selectedMode : "auto";
    const selectedSummary =
      manualRouteId !== MANUAL_ROUTE_NONE ? this.manualRouteLabel(manualRouteId) : this.modeLabel();
    const chipClass = [
      "openclaw-selector-chip",
      !selectorUnavailable && !localProviderReady ? "openclaw-selector-chip--degraded" : "",
      selectorUnavailable ? "openclaw-selector-chip--error" : "",
      this.panelOpen ? "openclaw-selector-chip--open" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return html`
      <div class="openclaw-selector-host" @click=${(event: Event) => event.stopPropagation()}>
        <button
          type="button"
          class=${chipClass}
          aria-haspopup="dialog"
          aria-expanded=${this.panelOpen ? "true" : "false"}
          ?disabled=${!this.gatewayConnected}
          @click=${async () => {
            this.panelOpen = !this.panelOpen;
            if (this.panelOpen && this.gatewayConnected) {
              await this.refreshState({ keepExistingState: true });
            }
          }}
        >
          <span class="openclaw-selector-chip__main">
            <span class="openclaw-selector-chip__label">${this.chipLabel()}</span>
            <span class="openclaw-selector-chip__meta">${this.chipMeta()}</span>
          </span>
          <span class="openclaw-selector-chip__end">
            <span class="openclaw-selector-chip__dot" aria-hidden="true"></span>
            <span class="openclaw-selector-chip__chevron" aria-hidden="true">${icons.chevronDown}</span>
          </span>
        </button>

        ${
          this.panelOpen
            ? html`
              <div class="openclaw-selector-panel" role="dialog" aria-label="Model selector">
                <div class="openclaw-selector-panel__header">
                  <div>
                    <div class="openclaw-selector-panel__title">Model selector</div>
                    <div class="openclaw-selector-panel__subtitle">${this.sessionKey}</div>
                  </div>
                  <button
                    type="button"
                    class="openclaw-selector-btn"
                    @click=${() => this.handleRefresh()}
                  >
                    Refresh
                  </button>
                </div>

                <div class="openclaw-selector-summary">
                  <div class="openclaw-selector-summary__row">
                    <span class="openclaw-selector-summary__key">Effective</span>
                    <span class="openclaw-selector-summary__value">${this.modelLabel()}</span>
                  </div>
                  <div class="openclaw-selector-summary__row">
                    <span class="openclaw-selector-summary__key">Selected</span>
                    <span class="openclaw-selector-summary__value">${selectedSummary}</span>
                  </div>
                  <div class="openclaw-selector-summary__row">
                    <span class="openclaw-selector-summary__key">Local provider</span>
                    <span class="openclaw-selector-summary__value">
                      ${localProviderReady ? "Ready" : "Unavailable"}
                    </span>
                  </div>
                </div>

                <div class="openclaw-selector-panel__section">
                  <div class="openclaw-selector-panel__label">Primary lanes</div>
                  <div class="openclaw-selector-actions">
                    <button
                      type="button"
                      class=${["openclaw-selector-btn", selectedMode === "auto" && manualRouteId === MANUAL_ROUTE_NONE ? "is-active" : ""].filter(Boolean).join(" ")}
                      ?disabled=${selectorUnavailable}
                      @click=${() => this.handleSelectMode("auto")}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      class=${["openclaw-selector-btn", selectedMode === "fast" && manualRouteId === MANUAL_ROUTE_NONE ? "is-active" : ""].filter(Boolean).join(" ")}
                      ?disabled=${selectorUnavailable}
                      @click=${() => this.handleSelectMode("fast")}
                    >
                      Fast
                    </button>
                    <button
                      type="button"
                      class=${["openclaw-selector-btn", selectedMode === "quality" && manualRouteId === MANUAL_ROUTE_NONE ? "is-active" : ""].filter(Boolean).join(" ")}
                      ?disabled=${selectorUnavailable}
                      @click=${() => this.handleSelectMode("quality")}
                    >
                      Quality
                    </button>
                  </div>
                </div>

                <div class="openclaw-selector-panel__section">
                  <div class="openclaw-selector-panel__label">Manual routes</div>
                  <div class="openclaw-selector-actions">
                    <button
                      type="button"
                      class=${["openclaw-selector-btn", activeManualRoute === MANUAL_ROUTE_GPT54_LOW && manualRouteId !== MANUAL_ROUTE_NONE ? "is-active" : ""].filter(Boolean).join(" ")}
                      ?disabled=${selectorUnavailable}
                      @click=${() => this.handleSelectManual(MANUAL_ROUTE_GPT54_LOW, "GPT-5.4 Low")}
                    >
                      GPT-5.4 Low
                    </button>
                    <button
                      type="button"
                      class=${["openclaw-selector-btn", activeManualRoute === MANUAL_ROUTE_GPT54_HIGH && manualRouteId !== MANUAL_ROUTE_NONE ? "is-active" : ""].filter(Boolean).join(" ")}
                      ?disabled=${selectorUnavailable}
                      @click=${() => this.handleSelectManual(MANUAL_ROUTE_GPT54_HIGH, "GPT-5.4 High")}
                    >
                      GPT-5.4 High
                    </button>
                    <button
                      type="button"
                      class=${["openclaw-selector-btn", activeManualRoute === MANUAL_ROUTE_LOCAL_QWEN && manualRouteId !== MANUAL_ROUTE_NONE ? "is-active" : ""].filter(Boolean).join(" ")}
                      ?disabled=${selectorUnavailable}
                      @click=${() => this.handleSelectManual(MANUAL_ROUTE_LOCAL_QWEN, "Local Qwen")}
                    >
                      Local Qwen
                    </button>
                  </div>
                </div>

                <div class="openclaw-selector-panel__section">
                  <div class="openclaw-selector-panel__label">Actions</div>
                  <div class="openclaw-selector-actions">
                    <button
                      type="button"
                      class="openclaw-selector-btn"
                      ?disabled=${selectorUnavailable || !activeRunId}
                      @click=${() => this.handleStop()}
                    >
                      Stop
                    </button>
                    <button
                      type="button"
                      class="openclaw-selector-btn"
                      ?disabled=${selectorUnavailable}
                      @click=${() => this.handleRetry("fast")}
                    >
                      Retry Fast
                    </button>
                    <button
                      type="button"
                      class="openclaw-selector-btn"
                      ?disabled=${selectorUnavailable}
                      @click=${() => this.handleRetry("quality")}
                    >
                      Retry Quality
                    </button>
                    <button
                      type="button"
                      class="openclaw-selector-btn"
                      ?disabled=${selectorUnavailable || activeManualRoute === MANUAL_ROUTE_NONE}
                      @click=${() => this.handleRetry("manual")}
                    >
                      Retry Manual
                    </button>
                  </div>
                </div>

                ${this.renderPanelNotice()}
              </div>
            `
            : nothing
        }
      </div>
    `;
  }
}
