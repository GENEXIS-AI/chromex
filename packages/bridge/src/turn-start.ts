import type { CodexAppServerClient } from "./codex-app-server.js";

const DEFAULT_TURN_REASONING_SUMMARY = "concise";

type DiagnosticRecordFn = (event: string, details: Record<string, unknown>) => Promise<void>;

export async function requestTurnStartWithReasoningSummaryFallback(
  client: CodexAppServerClient,
  record: DiagnosticRecordFn,
  params: Record<string, unknown>,
): Promise<{ turn: { id: string } }> {
  const model = typeof params.model === "string" ? params.model : undefined;
  const requestParams = shouldIncludeTurnReasoningSummary(model)
    ? { ...params, summary: DEFAULT_TURN_REASONING_SUMMARY }
    : params;

  try {
    return (await client.request("turn/start", requestParams)) as { turn: { id: string } };
  } catch (error) {
    if (!("summary" in requestParams) || !isUnsupportedReasoningSummaryFailure(error)) {
      throw error;
    }

    await record("turn.start.reasoning_summary_unsupported", {
      model: model ?? null,
      error: getErrorMessage(error),
    });
    return (await client.request("turn/start", omitTurnReasoningSummary(requestParams))) as {
      turn: { id: string };
    };
  }
}

export function isUnsupportedReasoningSummaryFailure(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    /reasoning\.summary|["']summary["']/iu.test(message) &&
    /unsupported(?:_| )parameter|unsupported(?:_| )value|not supported/iu.test(message)
  );
}

function shouldIncludeTurnReasoningSummary(model: string | undefined): boolean {
  return !isKnownReasoningSummaryUnsupportedModel(model);
}

function isKnownReasoningSummaryUnsupportedModel(model: string | undefined): boolean {
  return (model ?? "").trim().toLowerCase() === "gpt-5.3-codex-spark";
}

function omitTurnReasoningSummary(params: Record<string, unknown>): Record<string, unknown> {
  const { summary: _summary, ...rest } = params;
  return rest;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "");
}
