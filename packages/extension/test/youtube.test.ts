import { describe, expect, test } from "vitest";

import {
  collectYouTubeCaptionTracksFromPlayerResponse,
  collectYouTubePlaybackState,
  collectYouTubeTranscriptEndpointFromDocument,
  collectYouTubeTranscriptSegmentsFromDocument,
  isYouTubeUrl,
  isYouTubeVideoUrl,
  parseTimedTextJson3,
  parseYouTubeTranscriptRendererResponse,
  toSeekActionId,
} from "../src/adapters/youtube.js";
import { inferActionCardsForOpenTab } from "../src/background/site-suggestions.js";
import { getUiStrings } from "../src/sidepanel/i18n.js";
import {
  createYouTubeCurrentMomentPrompt,
  formatYouTubeMomentTimestamp,
  isYouTubeCurrentMomentAction,
} from "../src/youtube-current-moment.js";

describe("youtube helpers", () => {
  test("recognizes standard YouTube watch URLs", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://example.com/watch?v=abc")).toBe(false);
  });

  test("recognizes YouTube video pages separately from the homepage", () => {
    expect(isYouTubeVideoUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeVideoUrl("https://youtu.be/abc")).toBe(true);
    expect(isYouTubeVideoUrl("https://www.youtube.com/shorts/abc")).toBe(true);
    expect(isYouTubeVideoUrl("https://www.youtube.com/")).toBe(false);
  });

  test("creates stable seek action ids from timestamps", () => {
    expect(toSeekActionId("01:02:03")).toBe("seek-3723");
  });

  test("recognizes every current-moment action that must refresh YouTube time before send", () => {
    expect(isYouTubeCurrentMomentAction("youtube-current-moment-question")).toBe(true);
    expect(isYouTubeCurrentMomentAction("summarize-current-timestamp")).toBe(true);
    expect(isYouTubeCurrentMomentAction("youtube-summary-question")).toBe(false);
  });

  test("builds current-moment prompts from the latest adapter playback time", () => {
    expect(formatYouTubeMomentTimestamp(3723)).toBe("1:02:03");

    const prompt = createYouTubeCurrentMomentPrompt({
      locale: "ko-KR",
      adapterPayload: {
        platform: "youtube",
        title: "State of the Claw",
        channel: "Peter Steinberger",
        currentTimeSeconds: 3723,
      },
    });

    expect(prompt).toContain("1:02:03");
    expect(prompt).toContain("3723 seconds");
    expect(prompt).toContain("Answer in Korean");
    expect(prompt).toContain("State of the Claw");
    expect(prompt).toContain("Peter Steinberger");
  });

  test("collects lightweight YouTube playback state without fetching transcript data", () => {
    const state = collectYouTubePlaybackState(
      createFakeYouTubePlaybackDocument({
        title: "State of the Claw",
        channel: "Peter Steinberger",
        video: {
          currentTime: 184.9,
          duration: 3600.3,
          paused: false,
        },
      }),
      "https://www.youtube.com/watch?v=abc",
    );

    expect(state).toEqual({
      platform: "youtube",
      title: "State of the Claw",
      channel: "Peter Steinberger",
      currentTimeSeconds: 184,
      durationSeconds: 3600,
      paused: false,
    });
  });

  test("creates site-specific suggested questions from a YouTube tab before DOM collection", () => {
    const cards = inferActionCardsForOpenTab(
      {
        title: "A useful video - YouTube",
        url: "https://www.youtube.com/watch?v=abc",
      },
      "ko-KR",
    );

    expect(cards.map((card) => card.id)).toContain("youtube-summary-question");
    expect(cards[0]?.title).toBe("영상 핵심 요약");
    expect(cards[0]?.prompt).toContain("A useful video");
  });

  test("does not pin YouTube suggestions to Korean when the UI locale is different", () => {
    const cards = inferActionCardsForOpenTab(
      {
        title: "A useful video - YouTube",
        url: "https://www.youtube.com/watch?v=abc",
      },
      "en-US",
    );

    expect(cards.map((card) => card.title)).toEqual(
      expect.arrayContaining(["Summarize video", "Explain this moment", "Chapter notes"]),
    );
    expect(cards.map((card) => card.title).join(" ")).not.toContain("영상");
  });

  test("keeps non-English non-Korean YouTube prompts in the selected output language", () => {
    const cards = inferActionCardsForOpenTab(
      {
        title: "A useful video - YouTube",
        url: "https://www.youtube.com/watch?v=abc",
      },
      "ja",
    );

    expect(cards[0]?.title).toBe(getUiStrings("ja").actionCards["youtube-summary-question"]);
    expect(cards[0]?.prompt).toContain("Answer in the user's selected UI language (ja).");
    expect(cards.map((card) => card.title).join(" ")).not.toContain("영상");
  });

  test("extracts visible YouTube transcript DOM segments with timestamps", () => {
    const root = createFakeTranscriptDocument([
      { timestamp: "0:03", text: "Welcome to the demo." },
      { timestamp: "1:24", text: "Here is the main idea." },
    ]);

    expect(collectYouTubeTranscriptSegmentsFromDocument(root)).toEqual([
      { timestamp: "0:03", seconds: 3, text: "Welcome to the demo." },
      { timestamp: "1:24", seconds: 84, text: "Here is the main idea." },
    ]);
  });

  test("finds hidden YouTube transcript endpoints from engagement panel data", () => {
    const root = createFakeTranscriptEndpointDocument({
      data: {
        content: {
          continuationItemRenderer: {
            continuationEndpoint: {
              commandMetadata: {
                webCommandMetadata: {
                  apiUrl: "/youtubei/v1/get_transcript",
                },
              },
              getTranscriptEndpoint: {
                params: "transcript-param-token",
              },
            },
          },
        },
        targetId: "engagement-panel-searchable-transcript",
      },
    });

    expect(collectYouTubeTranscriptEndpointFromDocument(root)).toEqual({
      params: "transcript-param-token",
      targetId: "engagement-panel-searchable-transcript",
      apiUrl: "/youtubei/v1/get_transcript",
    });
  });

  test("extracts caption track metadata from ytInitialPlayerResponse", () => {
    const tracks = collectYouTubeCaptionTracksFromPlayerResponse({
      ytInitialPlayerResponse: {
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en",
                name: { simpleText: "English" },
                languageCode: "en",
                vssId: ".en",
              },
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en&kind=asr",
                name: { runs: [{ text: "English " }, { text: "auto-generated" }] },
                languageCode: "en",
                kind: "asr",
                vssId: "a.en",
              },
            ],
          },
        },
      },
    });

    expect(tracks.map(({ baseUrl: _baseUrl, ...track }) => track)).toEqual([
      {
        name: "English",
        languageCode: "en",
        vssId: ".en",
        isAutoGenerated: false,
      },
      {
        name: "English auto-generated",
        languageCode: "en",
        kind: "asr",
        vssId: "a.en",
        isAutoGenerated: true,
      },
    ]);
  });

  test("parses transcript renderer responses returned by YouTube innertube", () => {
    const segments = parseYouTubeTranscriptRendererResponse({
      actions: [
        {
          updateEngagementPanelAction: {
            content: {
              transcriptRenderer: {
                content: {
                  transcriptSearchPanelRenderer: {
                    body: {
                      transcriptSegmentListRenderer: {
                        initialSegments: [
                          {
                            transcriptSegmentRenderer: {
                              startMs: "84000",
                              snippet: {
                                runs: [{ text: "Here is " }, { text: "the main idea." }],
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    });

    expect(segments).toEqual([{ timestamp: "1:24", seconds: 84, text: "Here is the main idea." }]);
  });

  test("parses timedtext json3 caption payloads", () => {
    expect(
      parseTimedTextJson3({
        events: [
          { tStartMs: 3000, segs: [{ utf8: "Welcome " }, { utf8: "back" }] },
          { tStartMs: 4000, segs: [{ utf8: "\n" }] },
          { tStartMs: 84000, segs: [{ utf8: "Main idea" }] },
        ],
      }),
    ).toEqual([
      { timestamp: "0:03", seconds: 3, text: "Welcome back" },
      { timestamp: "1:24", seconds: 84, text: "Main idea" },
    ]);
  });
});

function createFakeTranscriptDocument(segments: Array<{ timestamp: string; text: string }>) {
  const nodes = segments.map((segment) => ({
    textContent: `${segment.timestamp}\n${segment.text}`,
    querySelector(selector: string) {
      if (selector.includes("timestamp")) {
        return { textContent: segment.timestamp };
      }
      if (selector.includes("segment-text")) {
        return { textContent: segment.text };
      }
      return null;
    },
  }));

  return {
    querySelectorAll(selector: string) {
      return selector.includes("transcript-segment") ? nodes : [];
    },
  } as unknown as Pick<Document, "querySelectorAll">;
}

function createFakeYouTubePlaybackDocument(input: {
  title: string;
  channel: string;
  video: { currentTime: number; duration: number; paused: boolean };
}) {
  const video = input.video;
  return {
    title: `${input.title} - YouTube`,
    querySelector(selector: string) {
      if (selector === "video") {
        return video;
      }
      if (selector.includes("h1.ytd-watch-metadata")) {
        return { textContent: input.title };
      }
      if (selector.includes("#owner #channel-name a")) {
        return { textContent: input.channel };
      }
      return null;
    },
    querySelectorAll(selector: string) {
      return selector === "video" ? [video] : [];
    },
  } as unknown as Pick<Document, "querySelector" | "querySelectorAll" | "title">;
}

function createFakeTranscriptEndpointDocument(node: unknown) {
  return {
    querySelectorAll(selector: string) {
      return selector.includes("engagement-panel") ? [node] : [];
    },
  } as unknown as Pick<Document, "querySelectorAll">;
}
