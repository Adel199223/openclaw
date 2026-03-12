export async function runWithModelFallback(params: {
  provider: string;
  model: string;
  fallbacksOverride?: string[];
  allowContextOverflowFallback?: boolean;
  run: (
    provider: string,
    model: string,
    options?: { allowTransientCooldownProbe?: boolean },
  ) => Promise<unknown>;
}) {
  try {
    return {
      result: await params.run(params.provider, params.model),
      provider: params.provider,
      model: params.model,
      attempts: [],
    };
  } catch (error) {
    const fallbackRef =
      params.allowContextOverflowFallback === true &&
      Array.isArray(params.fallbacksOverride) &&
      params.fallbacksOverride.length > 0 &&
      typeof params.fallbacksOverride[0] === "string"
        ? params.fallbacksOverride[0].trim()
        : "";
    if (!fallbackRef || !fallbackRef.includes("/")) {
      throw error;
    }
    const [provider, ...modelParts] = fallbackRef.split("/");
    const model = modelParts.join("/").trim();
    if (!provider.trim() || !model) {
      throw error;
    }
    return {
      result: await params.run(provider.trim(), model),
      provider: provider.trim(),
      model,
      attempts: [
        {
          provider: params.provider,
          model: params.model,
          error: "context overflow",
        },
      ],
    };
  }
}
