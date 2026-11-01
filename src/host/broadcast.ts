export const NO_TAB_AUDIO = 'No audio was shared. Pick “This tab” and keep “Also share tab audio” on.';

export class NoTabAudioError extends Error {
  constructor() {
    super(NO_TAB_AUDIO);
  }
}

interface StreamLike {
  getAudioTracks(): MediaStreamTrack[];
  getVideoTracks(): MediaStreamTrack[];
  getTracks(): MediaStreamTrack[];
}

/** Keeps the video track alive (stopping it can end the capture in Chrome) but disabled. */
export function pickAudioTrack(stream: StreamLike): MediaStreamTrack {
  const [audio] = stream.getAudioTracks();
  if (!audio) {
    for (const t of stream.getTracks()) t.stop();
    throw new NoTabAudioError();
  }
  for (const v of stream.getVideoTracks()) v.enabled = false;
  return audio;
}

export interface TabAudio {
  track: MediaStreamTrack;
  stop(): void;
  onEnded(cb: () => void): void;
}

/** Asks the host to share this tab with its audio (Spotify plays here). */
export async function captureTabAudio(mediaDevices: MediaDevices = navigator.mediaDevices): Promise<TabAudio> {
  const options = {
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: false,
    },
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    systemAudio: 'exclude',
  } as DisplayMediaStreamOptions;
  const stream = await mediaDevices.getDisplayMedia(options);
  const track = pickAudioTrack(stream);
  return {
    track,
    stop: () => {
      for (const t of stream.getTracks()) t.stop();
    },
    onEnded: (cb) => {
      for (const t of stream.getTracks()) t.addEventListener('ended', cb, { once: true });
    },
  };
}
