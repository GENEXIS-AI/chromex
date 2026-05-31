import { describe, expect, test } from "vitest";

import {
  classifyMicrophonePermissionError,
  microphonePermissionResultToError,
  shouldOpenDedicatedMicrophonePermissionWindow,
} from "../src/sidepanel/voice-permissions.js";

describe("voice permission helpers", () => {
  test("classifies dismissed microphone prompts separately from denied prompts", () => {
    const error = new DOMException("Permission dismissed", "NotAllowedError");

    expect(classifyMicrophonePermissionError(error)).toBe("dismissed");
  });

  test("classifies denied microphone prompts", () => {
    const error = new DOMException("Permission denied by system", "NotAllowedError");

    expect(classifyMicrophonePermissionError(error)).toBe("denied");
  });

  test("classifies missing microphone devices", () => {
    const error = new DOMException("Requested device not found", "NotFoundError");

    expect(classifyMicrophonePermissionError(error)).toBe("unavailable");
  });

  test("opens a dedicated permission window only for first-run dismissed prompts", () => {
    const dismissed = new DOMException("Permission dismissed", "NotAllowedError");
    const denied = new DOMException("Permission denied by system", "NotAllowedError");

    expect(shouldOpenDedicatedMicrophonePermissionWindow(dismissed)).toBe(true);
    expect(shouldOpenDedicatedMicrophonePermissionWindow(dismissed, { reconnect: true })).toBe(false);
    expect(shouldOpenDedicatedMicrophonePermissionWindow(denied)).toBe(false);
  });

  test("maps dedicated permission window results back to microphone errors", () => {
    expect(classifyMicrophonePermissionError(microphonePermissionResultToError("denied"))).toBe("denied");
    expect(classifyMicrophonePermissionError(microphonePermissionResultToError("unavailable"))).toBe("unavailable");
    expect(classifyMicrophonePermissionError(microphonePermissionResultToError("dismissed"))).toBe("dismissed");
  });
});
