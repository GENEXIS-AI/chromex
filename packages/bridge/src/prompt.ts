import type { PromptSendParams } from "./types.js";

const USER_REQUEST_SECTION_LABEL = "USER REQUEST";
const DISPLAY_STOP_SECTION_PATTERN = /^(?:ATTACHED FILE \d+|HARNESS APPENDIX|PRIVATE PAGE CONTEXT \d+)$/u;
export const PROFILE_ASK_USER_QUESTION_TAG = "chromex_ask_user_question";
const DEFAULT_PROFILE_ID = "default";

export type CodexTurnInputItem =
  | { type: "text"; text: string; text_elements: Array<{ byteRange: { start: number; end: number }; placeholder: string | null }> }
  | { type: "image"; url: string }
  | { type: "localImage"; path: string }
  | { type: "skill"; name: string; path: string }
  | { type: "mention"; name: string; path: string };

export function createCodexTurnInput(
  params: PromptSendParams,
  options: {
    workspaceInstructions?: string;
    promptAppendices?: string[];
    fileSections?: string[];
} = {},
): string {
  const sections = ["PRIVATE INSTRUCTION PROFILE", params.profile.systemPrompt];
  const browserControl = params.routePlan?.browserControl;

  sections.push(
    "",
    "PRIVATE ASSISTANT BEHAVIOR",
    [
      "Answer the user's request directly. Do not narrate internal setup, skill loading, system/developer instructions, routing plans, or context-collection steps.",
      "Never mention internal implementation details, routing, system prompts, developer instructions, context envelopes, adapters, or browser extraction methods. Translate those details into user-facing terms like the current page, visible screen, selected text, attached file, or generated image.",
      "When private page context is present, treat it as the active browser state for phrases like current page, this page, current tab, this screen, or visible screen.",
      "When YouTube adapter data includes currentTimeSeconds, treat it as the exact playback position for current scene, current timestamp, or this moment requests.",
      "When attached visual evidence is present, inspect it as the visible screen or page image. Do not ask the user to upload a screenshot unless no page or visual context was provided.",
      "When the user asks to convert attached images into a PDF, create an actual local PDF file from the attached images in order, then answer with the PDF path and a renderable preview or markdown link when possible. Do not say the image files are unavailable when they are attached.",
      "When the user asks to fact-check, verify, corroborate, search, or check whether a claim is true, use available web/search/read-only tools when current external evidence is needed. If no search-capable tool is exposed, say that plainly instead of silently returning no answer.",
      "If both open-tab context and current-page context are present, prefer current-page context for singular phrases like current page or visible screen. Use open tabs only when the user asks about multiple tabs.",
      "Use independent web searches, read-only lookups, and safe stateless tool calls in parallel when the Codex runtime supports it. Do not parallelize image edits, ordered browser actions, writes, or reference-dependent steps.",
      "If context is insufficient, say exactly what is missing in one concise sentence, then give the best answer possible from available context.",
    ].join("\n"),
  );

  if (isProfileAskUserQuestionEnabled(params.profile)) {
    sections.push(
      "",
      "PRIVATE PROFILE QUESTION TOOL - DO NOT MENTION",
      [
        "This turn is running under a non-default profile. If the profile-specific task cannot be completed well without one user decision, ask exactly one concise question instead of guessing.",
        "Use this only for materially ambiguous decisions, missing business constraints, or profile-specific deep-work choices. Do not use it for routine page context, files, screenshots, or data that is already attached.",
        `When needed, output only <${PROFILE_ASK_USER_QUESTION_TAG}>{"question":"...","options":["..."],"allowFreeform":true}</${PROFILE_ASK_USER_QUESTION_TAG}> and no other text.`,
        "Keep options short, use at most three options, and allow free-form answers unless the choice must be closed.",
        "After the user answers, continue the task from that answer without repeating these private instructions.",
      ].join("\n"),
    );
  }

  if (options.workspaceInstructions?.trim()) {
    sections.push("", "WORKSPACE INSTRUCTIONS", options.workspaceInstructions.trim());
  }

  if (params.routePlan) {
    sections.push(
      "",
      "PRIVATE ROUTING CONTEXT - DO NOT MENTION",
      `Task: ${params.routePlan.task}`,
      `Context Mode: ${params.routePlan.contextMode}`,
      `Requires Vision: ${params.routePlan.requiresVision ? "yes" : "no"}`,
      `Page Read Strategy: ${params.routePlan.pageReadStrategy}`,
      ...(params.routePlan.intent
        ? [
            `User Intent: ${params.routePlan.intent.summary}`,
            `Intent Action: ${params.routePlan.intent.action}`,
            `Intent Target: ${params.routePlan.intent.target}`,
            `Needs Clarification: ${params.routePlan.intent.needsClarification ? "yes" : "no"}`,
            ...(params.routePlan.intent.clarificationQuestion
              ? [`Clarification Question: ${params.routePlan.intent.clarificationQuestion}`]
              : []),
            `Intent Constraints: ${
              params.routePlan.intent.constraints.length ? params.routePlan.intent.constraints.join(" ") : "(none)"
            }`,
          ]
        : []),
      ...(browserControl
        ? [
            `Browser Control: ${browserControl.shouldControl ? "yes" : "no"}`,
            `Browser Control Mode: ${browserControl.mode}`,
            `Browser Control Surface: ${browserControl.surface}`,
            `Browser Control Preconditions: ${
              browserControl.preconditions?.length ? browserControl.preconditions.join(" ") : "(none)"
            }`,
            `Browser Control Reason: ${browserControl.reason}`,
            ...(browserControl.surface === "active-tab" &&
            browserControl.mode === "dom" &&
            browserControl.preconditions?.length
              ? [
                  "Browser Control Handoff: Complete the upstream work, then output the exact content needed for the active-page action in a clean block. The side panel will apply it to the current page. Do not ask the user to copy/paste it.",
                ]
              : []),
            ...(browserControl.surface === "new-tab" && browserControl.mode === "playwright"
              ? [
                  "Browser Control Handoff: Complete the actual Playwright/new-tab browser operation when possible. Do not replace the requested browser action with manual instructions or a draft unless the runtime is blocked.",
                ]
              : []),
          ]
        : []),
      `Selected Profile: ${params.routePlan.selectedProfileId}`,
      `Selected Model: ${params.routePlan.selectedModel || "(default)"}`,
      `Notes: ${params.routePlan.notes.length ? params.routePlan.notes.join(" ") : "(none)"}`,
    );
  }

  const conversationContext = params.conversationContext?.trim().slice(-8_000);
  if (conversationContext) {
    sections.push(
      "",
      "PRIVATE CONVERSATION CONTEXT - DO NOT DISPLAY VERBATIM",
      conversationContext,
      "Use this only as hidden context for the current user request. Do not quote or mention this section unless the user asks for the underlying transcript.",
    );
  }

  sections.push("", USER_REQUEST_SECTION_LABEL, applyStructuredInputTokens(params.message.trim(), params.structuredInputs));

  for (const fileSection of options.fileSections ?? []) {
    const trimmed = fileSection.trim();
    if (!trimmed) {
      continue;
    }
    sections.push("", trimmed);
  }

  for (const appendix of options.promptAppendices ?? []) {
    const trimmed = appendix.trim();
    if (!trimmed) {
      continue;
    }
    sections.push("", "HARNESS APPENDIX", trimmed);
  }

  params.contexts.forEach((context, index) => {
    const visionSummary =
      context.visionAssets.length > 0
        ? `${context.visionAssets.length} attached (${context.visionAssets.map((asset) => asset.kind).join(", ")})`
        : "(none)";
    sections.push(
      "",
      `PRIVATE PAGE CONTEXT ${index + 1}`,
      `Title: ${context.metadata.title}`,
      `URL: ${context.metadata.url}`,
      `Domain: ${context.metadata.domain}`,
      `Selection: ${context.selectionText || "(none)"}`,
      `Page Text Summary: ${context.domSummary || "(none)"}`,
      `Attached Visual Evidence: ${visionSummary}`,
      `Private Adapter Data: ${context.adapterPayload ? JSON.stringify(context.adapterPayload) : "(none)"}`,
      `Private Privacy Flags: ${JSON.stringify(context.privacyFlags)}`,
    );
  });

  return sections.join("\n");
}

function isProfileAskUserQuestionEnabled(profile: PromptSendParams["profile"]): boolean {
  return profile.id.trim() !== DEFAULT_PROFILE_ID;
}

export function extractVisibleUserRequest(text: string): string {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/u);
  const userRequestIndex = lines.findIndex((line) => line.trim() === USER_REQUEST_SECTION_LABEL);
  if (userRequestIndex < 0) {
    return trimmed;
  }

  const requestLines: string[] = [];
  for (const line of lines.slice(userRequestIndex + 1)) {
    if (DISPLAY_STOP_SECTION_PATTERN.test(line.trim())) {
      break;
    }
    requestLines.push(line);
  }

  return requestLines.join("\n").trim() || trimmed;
}

export async function createCodexTurnInputItems(
  params: PromptSendParams,
  materializeInlineImage: (ref: string, contextIndex: number, assetIndex: number) => Promise<string>,
  options: {
    workspaceInstructions?: string;
    promptAppendices?: string[];
    fileSections?: string[];
    uploadedImages?: Array<{ name: string; ref: string }>;
  } = {},
): Promise<CodexTurnInputItem[]> {
  const items: CodexTurnInputItem[] = [
    {
      type: "text",
      text: createCodexTurnInput(params, options),
      text_elements: [],
    },
  ];

  for (const input of params.structuredInputs ?? []) {
    if (input.type === "skill") {
      items.push({
        type: "skill",
        name: input.name,
        path: input.path,
      });
      continue;
    }

    items.push({
      type: "mention",
      name: input.name,
      path: input.path,
    });
  }

  for (const [imageIndex, image] of (options.uploadedImages ?? []).entries()) {
    items.push(await toCodexImageItem(image.ref, -1, imageIndex, materializeInlineImage));
  }

  for (const [contextIndex, context] of params.contexts.entries()) {
    for (const [assetIndex, asset] of context.visionAssets.entries()) {
      items.push(await toCodexImageItem(asset.ref, contextIndex, assetIndex, materializeInlineImage));
    }
  }

  return items;
}

async function toCodexImageItem(
  ref: string,
  contextIndex: number,
  assetIndex: number,
  materializeInlineImage: (ref: string, contextIndex: number, assetIndex: number) => Promise<string>,
): Promise<CodexTurnInputItem> {
  if (ref.startsWith("data:")) {
    return {
      type: "localImage",
      path: await materializeInlineImage(ref, contextIndex, assetIndex),
    };
  }

  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    return {
      type: "image",
      url: ref,
    };
  }

  return {
    type: "localImage",
    path: ref,
  };
}

function applyStructuredInputTokens(message: string, structuredInputs: PromptSendParams["structuredInputs"]): string {
  const tokens = (structuredInputs ?? [])
    .map((input) => input.token.trim())
    .filter(Boolean)
    .filter((token, index, values) => values.indexOf(token) === index);

  if (tokens.length === 0) {
    return message;
  }

  const missingTokens = tokens.filter((token) => !message.includes(token));
  if (missingTokens.length === 0) {
    return message;
  }

  return `${missingTokens.join(" ")} ${message}`.trim();
}
