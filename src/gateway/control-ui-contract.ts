export const CONTROL_UI_BOOTSTRAP_CONFIG_PATH = "/__openclaw/control-ui-config.json";
export const CONTROL_UI_SELECTOR_PROXY_PREFIX = "/__openclaw/selector";
export const CONTROL_UI_SELECTOR_HEALTH_PATH = `${CONTROL_UI_SELECTOR_PROXY_PREFIX}/health`;
export const CONTROL_UI_SELECTOR_STATE_PATH = `${CONTROL_UI_SELECTOR_PROXY_PREFIX}/v1/state`;
export const CONTROL_UI_SELECTOR_SELECT_PATH = `${CONTROL_UI_SELECTOR_PROXY_PREFIX}/v1/select`;
export const CONTROL_UI_SELECTOR_SEND_PATH = `${CONTROL_UI_SELECTOR_PROXY_PREFIX}/v1/send`;
export const CONTROL_UI_SELECTOR_STOP_PATH = `${CONTROL_UI_SELECTOR_PROXY_PREFIX}/v1/stop`;
export const CONTROL_UI_SELECTOR_RETRY_PATH = `${CONTROL_UI_SELECTOR_PROXY_PREFIX}/v1/retry`;

export type ControlUiBootstrapConfig = {
  basePath: string;
  assistantName: string;
  assistantAvatar: string;
  assistantAgentId: string;
  serverVersion?: string;
};
