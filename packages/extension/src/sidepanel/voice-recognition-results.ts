export type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: {
    transcript?: string;
  };
};

export type SpeechRecognitionResultEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex?: number;
};

export type NormalizedSpeechRecognitionResult = {
  isFinal: boolean;
  transcript: string;
};

export function listChangedSpeechRecognitionResults(
  event: SpeechRecognitionResultEventLike,
): NormalizedSpeechRecognitionResult[] {
  const results = Array.from(event.results);
  const startIndex = getSpeechRecognitionResultStartIndex(event.resultIndex, results.length);
  return results
    .slice(startIndex)
    .map((result) => ({
      isFinal: result.isFinal,
      transcript: result[0]?.transcript?.trim() ?? "",
    }))
    .filter((result) => result.transcript);
}

function getSpeechRecognitionResultStartIndex(resultIndex: number | undefined, resultCount: number): number {
  if (!Number.isInteger(resultIndex) || resultIndex === undefined || resultIndex < 0 || resultIndex >= resultCount) {
    return 0;
  }
  return resultIndex;
}
