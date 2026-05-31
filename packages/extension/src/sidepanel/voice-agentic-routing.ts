import type { AgenticRoutePlan } from "@codex-sidepanel/shared";

export function shouldRouteRealtimeVoiceTranscriptThroughPrompt(
  plan: Pick<AgenticRoutePlan, "task" | "intent" | "imageEdit">,
): boolean {
  if (
    plan.task === "image-edit" &&
    plan.intent.action === "edit-image" &&
    plan.imageEdit.shouldEdit &&
    (plan.imageEdit.target === "page-image" || plan.imageEdit.target === "uploaded-image")
  ) {
    return true;
  }

  return plan.task === "image-generate" && plan.intent.action === "generate-image" && !plan.imageEdit.shouldEdit;
}
