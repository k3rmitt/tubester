import { describe, expect, it } from 'vitest';
import { NO_TAB_AUDIO, NoTabAudioError, pickAudioTrack } from './broadcast';

type FakeTrack = MediaStreamTrack & { stopped: boolean };

function fakeTrack(kind: 'audio' | 'video'): FakeTrack {
  const track: { kind: string; enabled: boolean; stopped: boolean; stop: () => void } = {
    kind,
    enabled: true,
    stopped: false,
    stop: () => undefined,
  };
  track.stop = () => {
    track.stopped = true;
  };
  return track as unknown as FakeTrack;
}

function stream(...tracks: FakeTrack[]) {
  return {
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getTracks: () => tracks,
  };
}

describe('pickAudioTrack', () => {
  it('returns the tab audio and mutes (but keeps) the video', () => {
    const audio = fakeTrack('audio');
    const video = fakeTrack('video');
    expect(pickAudioTrack(stream(audio, video))).toBe(audio);
    expect(video.enabled).toBe(false);
    expect(video.stopped).toBe(false);
  });

  it('explains how to share audio when none was shared', () => {
    const video = fakeTrack('video');
    expect(() => pickAudioTrack(stream(video))).toThrow(NoTabAudioError);
    expect(() => pickAudioTrack(stream(fakeTrack('video')))).toThrow(NO_TAB_AUDIO);
    expect(video.stopped).toBe(true);
  });
});
