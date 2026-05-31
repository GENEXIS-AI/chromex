export function assertApiKeyLoginExplicitlyConfirmed(input: {
  loginType: unknown;
  apiKey?: unknown;
  confirmed?: unknown;
}): void {
  if (input.loginType !== "apiKey") {
    return;
  }

  const hasInlineApiKey = typeof input.apiKey === "string" && input.apiKey.trim().length > 0;
  if (hasInlineApiKey) {
    return;
  }

  throw new Error("API-key mode requires entering an API key for this login attempt.");
}
