import type {
  CodexModelOption,
  PromptRoutingPlan,
  ReadStrategy,
  UserFileAttachment,
  UserFileAttachmentKind,
} from "./types.js";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "jsonl",
  "csv",
  "tsv",
  "log",
  "xml",
  "html",
  "htm",
  "css",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "php",
  "sql",
  "sh",
  "bash",
  "zsh",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "env",
]);
const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx", "xlsm", "ods"]);
const AUDIO_EXTENSIONS = new Set(["aac", "aif", "aiff", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "webm"]);
const PDF_MIME_PATTERN = /application\/pdf/u;
const DOCX_MIME_PATTERN =
  /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword/u;
const SPREADSHEET_MIME_PATTERN =
  /text\/csv|text\/tab-separated-values|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.oasis\.opendocument\.spreadsheet/u;
const AUDIO_MIME_PATTERN = /^audio\/|video\/webm|video\/mp4/u;

export function inferUserFileAttachmentKind(name: string, mimeType: string): UserFileAttachmentKind {
  const extension = extensionOf(name);
  const normalizedMime = mimeType.trim().toLowerCase();

  if (
    normalizedMime.startsWith("image/") ||
    extension === "svg" ||
    extension === "png" ||
    extension === "jpg" ||
    extension === "jpeg" ||
    extension === "webp" ||
    extension === "gif"
  ) {
    return "image";
  }

  if (AUDIO_MIME_PATTERN.test(normalizedMime) || AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }

  if (PDF_MIME_PATTERN.test(normalizedMime) || extension === "pdf") {
    return "pdf";
  }

  if (DOCX_MIME_PATTERN.test(normalizedMime) || extension === "docx" || extension === "doc") {
    return "docx";
  }

  if (SPREADSHEET_MIME_PATTERN.test(normalizedMime) || SPREADSHEET_EXTENSIONS.has(extension)) {
    return "spreadsheet";
  }

  if (
    normalizedMime.startsWith("text/") ||
    normalizedMime.includes("json") ||
    normalizedMime.includes("xml") ||
    normalizedMime.includes("javascript") ||
    normalizedMime.includes("typescript") ||
    normalizedMime.includes("yaml") ||
    TEXT_EXTENSIONS.has(extension)
  ) {
    return extension === "csv" || extension === "tsv" ? "spreadsheet" : "text";
  }

  return "binary";
}

export function planPromptRouting(input: {
  message: string;
  contextHint?: string;
  selectedProfileId: string;
  selectedModel: string;
  models: CodexModelOption[];
  readStrategyOverride: ReadStrategy | "auto";
  pageAttachments: Array<"current-page" | "selection" | "image">;
  fileAttachments: UserFileAttachment[];
}): PromptRoutingPlan {
  const hasPageContext = input.pageAttachments.length > 0;
  const hasFiles = input.fileAttachments.length > 0;
  const hasImageFiles = input.fileAttachments.some((attachment) => attachment.kind === "image");
  const hasDocumentFiles = input.fileAttachments.some(
    (attachment) => attachment.kind !== "image" && attachment.kind !== "audio" && attachment.kind !== "binary",
  );
  const asksForImageEdit = false;
  const asksForCompare = hasPageContext && hasFiles;
  const asksForVisual = hasImageFiles || input.pageAttachments.includes("image");

  const task = asksForImageEdit
    ? "image-edit"
    : asksForCompare
      ? "comparison"
      : asksForVisual
        ? "visual-analysis"
        : hasDocumentFiles
          ? "document-analysis"
          : "general";
  const contextMode = hasPageContext
    ? hasFiles
      ? "page-plus-files"
      : "page-only"
    : hasFiles
      ? "files-only"
      : "none";
  const requiresVision =
    asksForImageEdit ||
    asksForCompare ||
    input.readStrategyOverride === "vision" ||
    input.readStrategyOverride === "hybrid" ||
    hasImageFiles ||
    input.pageAttachments.includes("image");
  const selectedProfileId = input.selectedProfileId;
  const reroutedProfile = selectedProfileId !== input.selectedProfileId;
  const selectedModel = selectModel({
    selectedModel: input.selectedModel,
      models: input.models,
      requiresVision,
    });
  const reroutedModel = selectedModel !== input.selectedModel;
  const notes: string[] = [];
  const pageReadStrategy =
    input.readStrategyOverride !== "auto"
      ? input.readStrategyOverride
      : !hasPageContext
        ? "auto"
        : requiresVision
          ? "hybrid"
          : task === "document-analysis"
            ? "dom"
            : "auto";

  if (contextMode === "page-plus-files") {
    notes.push(
      "Use current-page context as the live browser state. Treat uploaded files as explicit user-provided artifacts and prefer them when the user refers to a specific attachment.",
    );
  } else if (contextMode === "files-only") {
    notes.push("Use uploaded files as the primary source material before relying on general web or browser assumptions.");
  }

  if (hasDocumentFiles) {
    notes.push("Summarize or cite attached documents before generalizing, and call out ambiguity if a file cannot be parsed cleanly.");
  }

  if (asksForImageEdit && hasPageContext && hasImageFiles) {
    notes.push(
      "If both page and uploaded images are present, default to the uploaded image as the edit target unless the prompt explicitly mentions the current page or screen.",
    );
  }

  return {
    task,
    contextMode,
    requiresVision,
    pageReadStrategy,
    selectedProfileId,
    selectedModel,
    notes,
    reroutedProfile,
    reroutedModel,
  };
}

function selectModel(input: {
  selectedModel: string;
  models: CodexModelOption[];
  requiresVision: boolean;
}): string {
  if (!input.requiresVision) {
    return input.selectedModel;
  }

  const active = input.models.find((model) => model.id === input.selectedModel);
  if (active?.supportsImages) {
    return input.selectedModel;
  }

  return input.models.find((model) => model.supportsImages)?.id ?? input.selectedModel;
}

function extensionOf(name: string): string {
  const normalized = name.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1) : "";
}
