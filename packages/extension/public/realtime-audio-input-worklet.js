class RealtimeAudioInputProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const output = outputs[0]?.[0];
    if (output) {
      output.fill(0);
    }

    const input = inputs[0]?.[0];
    if (input?.length) {
      const samples = new Float32Array(input.length);
      samples.set(input);
      this.port.postMessage(
        {
          type: "audio",
          samples,
          sampleRate,
        },
        [samples.buffer],
      );
    }

    return true;
  }
}

registerProcessor("realtime-audio-input", RealtimeAudioInputProcessor);
