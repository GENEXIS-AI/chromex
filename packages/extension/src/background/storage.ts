import {
  normalizeCodexRealtimeVoice,
  type BrowserActionPermissionMode,
  type ProfileTemplate,
} from "@codex-sidepanel/shared";

import type {
  ConversationMessage,
  ConversationMessageAttachment,
  ConversationMessageImage,
  ConversationSummary,
  ExtensionSettings,
  SavedConversation,
} from "../types.js";
import { normalizeStoredProfiles } from "../profile-templates.js";
import type { SkillOption } from "../sidepanel/skills.js";
import { normalizeUiLanguageSetting } from "../ui-language.js";
import { normalizeUiThemeSetting } from "../ui-theme.js";
import { normalizeEnabledCodexSkillIds } from "../codex-skill-settings.js";
import { normalizeCustomSiteSuggestions } from "../custom-site-suggestions.js";
import {
  clearConversationHistoryState,
  deleteConversationHistoryEntry,
} from "./conversation-history.js";

const STORAGE_KEYS = {
  settings: "codex.sidepanel.settings",
  conversations: "codex.sidepanel.conversations",
  currentConversationId: "codex.sidepanel.currentConversationId",
  selectedProfileId: "codex.sidepanel.selectedProfileId",
  selectedModel: "codex.sidepanel.selectedModel",
  selectedReasoningEffort: "codex.sidepanel.selectedReasoningEffort",
  selectedServiceTier: "codex.sidepanel.selectedServiceTier",
  skills: "codex.sidepanel.skills",
  profiles: "codex.sidepanel.profiles",
  deletedProfileIds: "codex.sidepanel.deletedProfileIds",
} as const;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  uiLanguage: "auto",
  uiTheme: "system",
  usageNoticeAccepted: false,
  shareCurrentTabByDefault: false,
  rememberChats: false,
  liveCaptions: true,
  allowVoiceNavigation: true,
  allowBrowserActions: true,
  browserActionPermissionMode: "ask",
  playwrightBrowserControlEnabled: false,
  preferredVoice: "",
  workspaceRoot: "",
  codexBinPath: "",
  enabledCodexSkillIds: [],
  autoCompactConversations: true,
  customSiteSuggestions: [],
};

const CONVERSATION_KEYS = [STORAGE_KEYS.conversations, STORAGE_KEYS.currentConversationId] as const;
const MAX_STORED_DATA_IMAGE_URL_CHARS = 128 * 1024;
const MAX_CONVERSATION_HISTORY_BYTES = 4 * 1024 * 1024;

export async function getStoredSettings(): Promise<ExtensionSettings> {
  const result = (await chrome.storage.local.get(STORAGE_KEYS.settings))[STORAGE_KEYS.settings] as
    | ExtensionSettings
    | undefined;
  const settings = { ...DEFAULT_SETTINGS, ...result };
  return {
    ...settings,
    allowBrowserActions: true,
    uiLanguage: normalizeUiLanguageSetting(settings.uiLanguage),
    uiTheme: normalizeUiThemeSetting(settings.uiTheme),
    preferredVoice: normalizeCodexRealtimeVoice(settings.preferredVoice),
    browserActionPermissionMode: normalizeBrowserActionPermissionMode(settings.browserActionPermissionMode),
    playwrightBrowserControlEnabled: settings.playwrightBrowserControlEnabled === true,
    enabledCodexSkillIds: normalizeEnabledCodexSkillIds(settings.enabledCodexSkillIds),
    customSiteSuggestions: normalizeCustomSiteSuggestions(settings.customSiteSuggestions),
  };
}

export async function updateStoredSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getStoredSettings();
  const next = {
    ...current,
    ...patch,
    allowBrowserActions: true,
    uiLanguage: normalizeUiLanguageSetting(patch.uiLanguage ?? current.uiLanguage),
    uiTheme: normalizeUiThemeSetting(patch.uiTheme ?? current.uiTheme),
    preferredVoice: normalizeCodexRealtimeVoice(patch.preferredVoice ?? current.preferredVoice),
    browserActionPermissionMode: normalizeBrowserActionPermissionMode(
      patch.browserActionPermissionMode ?? current.browserActionPermissionMode,
    ),
    playwrightBrowserControlEnabled: (patch.playwrightBrowserControlEnabled ?? current.playwrightBrowserControlEnabled) === true,
    enabledCodexSkillIds: normalizeEnabledCodexSkillIds(
      patch.enabledCodexSkillIds ?? current.enabledCodexSkillIds,
    ),
    customSiteSuggestions: normalizeCustomSiteSuggestions(
      patch.customSiteSuggestions ?? current.customSiteSuggestions,
    ),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  if (current.rememberChats !== next.rememberChats) {
    await migrateConversationRetention(next.rememberChats);
  }
  return next;
}

function normalizeBrowserActionPermissionMode(value: unknown): BrowserActionPermissionMode {
  return value === "auto-review" || value === "full" || value === "ask" ? value : "ask";
}

export async function resetStoredSettings(): Promise<ExtensionSettings> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  await chrome.storage.local.remove(STORAGE_KEYS.deletedProfileIds);
  await migrateConversationRetention(DEFAULT_SETTINGS.rememberChats);
  return getStoredSettings();
}

export async function getSelectedProfileId(): Promise<string | null> {
  const result = (await chrome.storage.local.get(STORAGE_KEYS.selectedProfileId))[STORAGE_KEYS.selectedProfileId];
  return typeof result === "string" ? result : null;
}

export async function setSelectedProfileId(profileId: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.selectedProfileId]: profileId });
}

export async function getSelectedModel(): Promise<string> {
  const result = (await chrome.storage.local.get(STORAGE_KEYS.selectedModel))[STORAGE_KEYS.selectedModel];
  return typeof result === "string" ? result : "";
}

export async function setSelectedModel(model: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.selectedModel]: model });
}

export async function getSelectedReasoningEffort(): Promise<string> {
  const result = (await chrome.storage.local.get(STORAGE_KEYS.selectedReasoningEffort))[
    STORAGE_KEYS.selectedReasoningEffort
  ];
  return typeof result === "string" ? result : "";
}

export async function setSelectedReasoningEffort(reasoningEffort: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.selectedReasoningEffort]: reasoningEffort });
}

export async function getSelectedServiceTier(): Promise<string> {
  const result = (await chrome.storage.local.get(STORAGE_KEYS.selectedServiceTier))[STORAGE_KEYS.selectedServiceTier];
  return typeof result === "string" ? result : "";
}

export async function setSelectedServiceTier(serviceTier: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.selectedServiceTier]: serviceTier });
}

export async function listCustomProfiles(): Promise<ProfileTemplate[]> {
  const result = (await chrome.storage.local.get(STORAGE_KEYS.profiles))[STORAGE_KEYS.profiles] as
    | ProfileTemplate[]
    | undefined;
  return normalizeStoredProfiles(Array.isArray(result) ? result : []);
}

export async function saveCustomProfile(profile: ProfileTemplate): Promise<ProfileTemplate[]> {
  const current = await listCustomProfiles();
  const next = normalizeStoredProfiles([profile, ...current.filter((item) => item.id !== profile.id)]);
  await chrome.storage.local.set({ [STORAGE_KEYS.profiles]: next });
  await undeleteProfileId(profile.id);
  return next;
}

export async function deleteCustomProfile(profileId: string, options: { hideBuiltin?: boolean } = {}): Promise<ProfileTemplate[]> {
  const current = await listCustomProfiles();
  const next = normalizeStoredProfiles(current.filter((item) => item.id !== profileId));
  await chrome.storage.local.set({ [STORAGE_KEYS.profiles]: next });
  if (options.hideBuiltin) {
    await setDeletedProfileIds([...(await listDeletedProfileIds()), profileId]);
  }
  return next;
}

export async function listDeletedProfileIds(): Promise<string[]> {
  const result = (await chrome.storage.local.get(STORAGE_KEYS.deletedProfileIds))[STORAGE_KEYS.deletedProfileIds] as
    | string[]
    | undefined;
  return normalizeProfileIds(result ?? []);
}

async function undeleteProfileId(profileId: string): Promise<void> {
  const deleted = (await listDeletedProfileIds()).filter((id) => id !== profileId);
  await chrome.storage.local.set({ [STORAGE_KEYS.deletedProfileIds]: deleted });
}

async function setDeletedProfileIds(profileIds: string[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.deletedProfileIds]: normalizeProfileIds(profileIds) });
}

export async function listSkills(): Promise<SkillOption[]> {
  const result = (await chrome.storage.local.get(STORAGE_KEYS.skills))[STORAGE_KEYS.skills] as SkillOption[] | undefined;
  return normalizeStoredSkills(result ?? []);
}

export async function saveSkill(skill: SkillOption): Promise<SkillOption[]> {
  const current = ((await chrome.storage.local.get(STORAGE_KEYS.skills))[STORAGE_KEYS.skills] as SkillOption[] | undefined) ?? [];
  const filtered = normalizeStoredSkills(current).filter((item) => item.id !== skill.id);
  const next = [...filtered, { ...skill, source: "saved" as const }]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => ({
      ...item,
      source: item.source ?? "saved",
    }));
  await chrome.storage.local.set({ [STORAGE_KEYS.skills]: next });
  return next;
}

export async function deleteSkill(skillId: string): Promise<SkillOption[]> {
  const current = normalizeStoredSkills(
    ((await chrome.storage.local.get(STORAGE_KEYS.skills))[STORAGE_KEYS.skills] as SkillOption[] | undefined) ?? [],
  );
  const next = current.filter((item) => item.id !== skillId);
  await chrome.storage.local.set({ [STORAGE_KEYS.skills]: next });
  return next;
}

export async function listConversations(): Promise<SavedConversation[]> {
  const area = await getConversationStorageArea();
  const result = (await area.get(STORAGE_KEYS.conversations))[STORAGE_KEYS.conversations] as
    | SavedConversation[]
    | undefined;
  return (result ?? [])
    .map((conversation) => sanitizeConversationForStorage(conversation))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getCurrentConversation(): Promise<SavedConversation | null> {
  const conversations = await listConversations();
  const currentConversationId = await getCurrentConversationId();
  return conversations.find((item) => item.id === currentConversationId) ?? null;
}

export async function createConversation(profileId: string, model: string): Promise<SavedConversation> {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    profileId,
    model,
    messages: [],
    attachments: [],
    structuredInputs: [],
    selectedTabIds: [],
    historyQuery: "",
    readStrategyOverride: "auto",
    updatedAt: Date.now(),
  };
}

export async function saveConversation(conversation: SavedConversation): Promise<SavedConversation> {
  const conversations = await listConversations();
  const area = await getConversationStorageArea();
  const nextConversation = {
    ...sanitizeConversationForStorage(conversation),
    title: buildConversationTitle(conversation),
    updatedAt: Date.now(),
  };
  if (!shouldPersistConversationInHistory(nextConversation)) {
    const remaining = conversations.filter((item) => item.id !== conversation.id);
    await area.set({ [STORAGE_KEYS.conversations]: prepareConversationsForStorage(remaining) });
    if ((await getCurrentConversationId()) === conversation.id) {
      await setCurrentConversationId(null);
    }
    return nextConversation;
  }
  const next = prepareConversationsForStorage([
    nextConversation,
    ...conversations.filter((item) => item.id !== conversation.id),
  ]);
  try {
    await area.set({ [STORAGE_KEYS.conversations]: next });
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      throw error;
    }
    await area.set({
      [STORAGE_KEYS.conversations]: prepareConversationsForStorage(
        [nextConversation, ...conversations.filter((item) => item.id !== conversation.id)],
        { aggressive: true },
      ),
    });
  }
  return nextConversation;
}

export async function deleteConversation(conversationId: string): Promise<SavedConversation[]> {
  const area = await getConversationStorageArea();
  const conversations = await listConversations();
  const currentConversationId = await getCurrentConversationId();
  const next = deleteConversationHistoryEntry({
    conversations,
    conversationId,
    currentConversationId,
  });
  await area.set({ [STORAGE_KEYS.conversations]: next.conversations });
  await setCurrentConversationId(next.currentConversationId);
  return next.conversations;
}

export async function clearConversations(): Promise<void> {
  const area = await getConversationStorageArea();
  const next = clearConversationHistoryState();
  await area.set({
    [STORAGE_KEYS.conversations]: next.conversations,
    [STORAGE_KEYS.currentConversationId]: next.currentConversationId,
  });
}

export async function setCurrentConversationId(conversationId: string | null): Promise<void> {
  const area = await getConversationStorageArea();
  await area.set({ [STORAGE_KEYS.currentConversationId]: conversationId });
}

export async function getCurrentConversationId(): Promise<string | null> {
  const area = await getConversationStorageArea();
  const result = (await area.get(STORAGE_KEYS.currentConversationId))[STORAGE_KEYS.currentConversationId];
  return typeof result === "string" ? result : null;
}

export async function normalizeConversationRetention(): Promise<void> {
  const settings = await getStoredSettings();
  if (settings.rememberChats) {
    return;
  }

  await chrome.storage.local.remove([...CONVERSATION_KEYS]);
}

export function toConversationSummary(conversation: SavedConversation): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    profileId: conversation.profileId,
    updatedAt: conversation.updatedAt,
  };
}

function buildConversationTitle(conversation: SavedConversation): string {
  const firstUserMessage = conversation.messages.find((message) => message.role === "user")?.text.trim();
  if (!firstUserMessage) {
    return "New chat";
  }

  return firstUserMessage.length <= 48 ? firstUserMessage : `${firstUserMessage.slice(0, 47).trimEnd()}…`;
}

function normalizeStoredSkills(skills: SkillOption[]): SkillOption[] {
  return skills.map((skill) => ({
    ...skill,
    source: skill.source ?? "saved",
  }));
}

function normalizeProfileIds(profileIds: string[]): string[] {
  return Array.from(
    new Set(profileIds.map((id) => (typeof id === "string" ? id.trim() : "")).filter((id) => /^[a-z0-9][a-z0-9-]{0,80}$/iu.test(id))),
  );
}

async function getConversationStorageArea(): Promise<chrome.storage.StorageArea> {
  return (await getStoredSettings()).rememberChats ? chrome.storage.local : chrome.storage.session;
}

async function migrateConversationRetention(rememberChats: boolean): Promise<void> {
  const source = rememberChats ? chrome.storage.session : chrome.storage.local;
  const destination = rememberChats ? chrome.storage.local : chrome.storage.session;
  const snapshot = await source.get([...CONVERSATION_KEYS]);

  if (Object.keys(snapshot).length) {
    await destination.set(snapshot);
  }

  await source.remove([...CONVERSATION_KEYS]);
}

export function prepareConversationsForStorage(
  conversations: SavedConversation[],
  options: { aggressive?: boolean } = {},
): SavedConversation[] {
  const sanitized = conversations
    .map((conversation) => sanitizeConversationForStorage(conversation, options))
    .filter(shouldPersistConversationInHistory)
    .slice(0, options.aggressive ? 8 : 20);
  const next: SavedConversation[] = [];
  for (const conversation of sanitized) {
    const candidate = [...next, conversation];
    if (estimateStorageBytes(candidate) > MAX_CONVERSATION_HISTORY_BYTES) {
      if (next.length === 0) {
        next.push(trimConversationToStorageBudget(conversation, MAX_CONVERSATION_HISTORY_BYTES));
      }
      break;
    }
    next.push(conversation);
  }
  return next;
}

export function shouldPersistConversationInHistory(conversation: SavedConversation): boolean {
  return (conversation.messages ?? []).length > 0;
}

export function sanitizeConversationForStorage(
  conversation: SavedConversation,
  options: { aggressive?: boolean } = {},
): SavedConversation {
  return {
    ...conversation,
    messages: (conversation.messages ?? []).map((message) => {
      const images: ConversationMessageImage[] = (message.images ?? [])
        .map((image) => {
          const src = typeof image.src === "string" ? image.src.trim() : "";
          const assetRef = typeof image.assetRef === "string" ? image.assetRef.trim() : "";
          if (assetRef) {
            return {
              src: "",
              alt: image.alt || "Image",
              assetRef,
              status: image.status === "error" || image.status === "deleted" ? image.status : "loading",
            } satisfies ConversationMessageImage;
          }
          if (src.startsWith("blob:")) {
            return { src: "", alt: image.alt || "Image", status: "deleted" } satisfies ConversationMessageImage;
          }
          if (src.startsWith("data:image/") && (options.aggressive || src.length > MAX_STORED_DATA_IMAGE_URL_CHARS)) {
            return { src: "", alt: image.alt || "Image", status: "deleted" } satisfies ConversationMessageImage;
          }
          const next: ConversationMessageImage = {
            src,
            alt: image.alt || "Image",
          };
          if (image.status) {
            next.status = image.status;
          }
          return next;
        })
        .filter((image) => image.src || image.assetRef || image.status);
      const attachments: ConversationMessageAttachment[] = (message.attachments ?? []).map((attachment) => {
        const previewSrc = attachment.previewSrc?.trim() ?? "";
        const shouldKeepPreview =
          previewSrc &&
          !options.aggressive &&
          (!previewSrc.startsWith("data:image/") || previewSrc.length <= MAX_STORED_DATA_IMAGE_URL_CHARS);
        const next: ConversationMessageAttachment = {
          ...attachment,
        };
        if (shouldKeepPreview) {
          next.previewSrc = previewSrc;
        } else {
          delete next.previewSrc;
        }
        return next;
      });
      const nextMessage: ConversationMessage = {
        ...message,
        text: sanitizeMessageTextForStorage(message.text),
      };
      if (images.length) {
        nextMessage.images = images;
      } else {
        delete nextMessage.images;
      }
      if (attachments.length) {
        nextMessage.attachments = attachments;
      } else {
        delete nextMessage.attachments;
      }
      return nextMessage;
    }),
    attachments: conversation.attachments ?? [],
    structuredInputs: conversation.structuredInputs ?? [],
    selectedTabIds: conversation.selectedTabIds ?? [],
    historyQuery: conversation.historyQuery ?? "",
    readStrategyOverride: conversation.readStrategyOverride ?? "auto",
  };
}

function trimConversationToStorageBudget(conversation: SavedConversation, maxBytes: number): SavedConversation {
  let trimmed = sanitizeConversationForStorage(conversation, { aggressive: true });
  while (trimmed.messages.length > 1 && estimateStorageBytes([trimmed]) > maxBytes) {
    trimmed = {
      ...trimmed,
      messages: trimmed.messages.slice(1),
    };
  }
  return trimmed;
}

function estimateStorageBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function sanitizeMessageTextForStorage(text: string): string {
  return text.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/giu, "[stored image asset]");
}

function isStorageQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /quota|kQuotaBytes|QUOTA_BYTES/iu.test(message);
}
