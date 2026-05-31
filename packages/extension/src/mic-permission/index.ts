import {
  classifyMicrophonePermissionError,
  type MicrophonePermissionWindowResult,
} from "../sidepanel/voice-permissions.js";
import { getUiStrings } from "../sidepanel/i18n.js";
import { getTranslatedUiLocale } from "../ui-language.js";

const query = new URLSearchParams(window.location.search);
const locale = getTranslatedUiLocale(query.get("locale") || navigator.language);
const strings = getUiStrings(locale).micPermission;
document.documentElement.lang = locale;

document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
  const key = element.dataset.i18n as keyof typeof strings | undefined;
  if (key && key in strings) {
    element.textContent = strings[key];
  }
});

const button = document.querySelector<HTMLButtonElement>("#allow-microphone");
const status = document.querySelector<HTMLElement>("#microphone-status");

button?.addEventListener("click", () => {
  void requestMicrophone();
});

async function requestMicrophone(): Promise<void> {
  if (!button || !status) {
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    await reportPermissionResult("unavailable", strings.unavailable);
    status.textContent = strings.unavailable;
    return;
  }

  button.disabled = true;
  status.textContent = strings.requesting;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    for (const track of stream.getTracks()) {
      track.stop();
    }
    await reportPermissionResult("granted");
    status.textContent = strings.granted;
    window.setTimeout(() => window.close(), 700);
  } catch (error) {
    const kind = classifyMicrophonePermissionError(error);
    const result: MicrophonePermissionWindowResult = kind === "unknown" ? "dismissed" : kind;
    await reportPermissionResult(result, getErrorMessage(error));
    status.textContent = strings[result] || strings.error;
    button.disabled = false;
  }
}

async function reportPermissionResult(result: MicrophonePermissionWindowResult, message?: string): Promise<void> {
  await chrome.runtime
    .sendMessage({
      type: "voice.microphone.permission.result",
      result,
      ...(message ? { message } : {}),
    })
    .catch(() => undefined);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error || error instanceof DOMException) {
    return error.message;
  }
  return String(error ?? "");
}
