import type { ToneOutput } from './fake';

export interface ToneFeed {
  output: ToneOutput;
  /** The host's audio, streamed to guests. */
  track: MediaStreamTrack;
  context: AudioContext;
  close(): void;
}

export function createToneFeed(): ToneFeed {
  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = 0;
  const destination = context.createMediaStreamDestination();
  gain.connect(destination);
  gain.connect(context.destination);
  let osc: OscillatorNode | null = null;

  const output: ToneOutput = {
    start(frequency) {
      output.stop();
      osc = context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start();
      gain.gain.setTargetAtTime(0.15, context.currentTime, 0.05);
    },
    stop() {
      if (!osc) return;
      gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      osc.stop(context.currentTime + 0.3);
      osc = null;
    },
  };

  return {
    output,
    track: destination.stream.getAudioTracks()[0],
    context,
    close: () => {
      void context.close();
    },
  };
}
