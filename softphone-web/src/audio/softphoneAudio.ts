/**
 * Browser audio plumbing for the softphone, ported from the desktop
 * WebRtcClient/phone.js behaviour:
 *  - a hidden <audio> element that plays the remote WebRTC MediaStream,
 *  - synthesized ringback (outgoing) and ringtone (incoming) via Web Audio,
 *  - autoplay-policy unlock (resume AudioContext on a user gesture),
 *  - speaker routing via HTMLAudioElement.setSinkId() (Chrome/Edge/Opera).
 *
 * WebRTC/Web Audio objects are intentionally kept out of Pinia state — they
 * must not be made reactive (deep proxies break RTCPeerConnection internals).
 */

import { appLog } from '@/logging/logCapture'

// ---------- types ----------

type AudioCtor = typeof AudioContext

/** Browsers that support output routing expose setSinkId on HTMLAudioElement. */
type SinkableAudio = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>
}

type TonePattern = {
  freqs: number[]
  onMs: number
  offMs: number
  volume: number
}

type RemotePlaybackGraph = {
  ctx: AudioContext
  source: MediaStreamAudioSourceNode
  gain: GainNode
  stream: MediaStream
}

/** Match WebRtcClient/phone.js — helps first syllables after PBX 183/200 OK bursts. */
export const REMOTE_AUDIO_JITTER_BUFFER_MS = 350

type SinkableAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>
}

// ---------- helpers ----------

function getAudioContextCtor(): AudioCtor | null {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

/** True when the browser implements HTMLAudioElement.setSinkId (Chrome/Edge/Opera). */
export function canChangeSink(): boolean {
  return typeof (HTMLAudioElement.prototype as SinkableAudio).setSinkId === 'function'
}

async function applySinkId(el: HTMLAudioElement, sinkId: string): Promise<void> {
  const audio = el as SinkableAudio
  if (!sinkId || typeof audio.setSinkId !== 'function') return
  try {
    await audio.setSinkId(sinkId)
  } catch (e) {
    console.warn('[SoftphoneAudio] setSinkId failed:', e)
  }
}

// ---------- main class ----------

class SoftphoneAudio {
  private ctx: AudioContext | null = null
  private remoteAudio: HTMLAudioElement | null = null
  private remotePlayback: RemotePlaybackGraph | null = null
  private attachedTrackKey = ''
  private currentSpeakerId = ''

  private toneOscillators: OscillatorNode[] = []
  private toneGain: GainNode | null = null
  private toneTimer: number | null = null
  private toneCycleActive = false
  private activeToneKind: 'ringback' | 'ringtone' | null = null
  private audioProbeTimer: number | null = null
  private audioProbeCtx: AudioContext | null = null

  unlocked = false

  /** Desktop default: Web Audio graph (lower latency than <audio> alone). Override: localStorage callspire.remotePlayback=audio */
  private useWebAudioPlayback(): boolean {
    try {
      const v = (localStorage.getItem('callspire.remotePlayback') || 'webaudio').toLowerCase()
      return v !== 'audio' && v !== 'html'
    } catch {
      return true
    }
  }

  private teardownRemotePlayback(): void {
    if (!this.remotePlayback) return
    try { this.remotePlayback.source.disconnect() } catch { /* ignore */ }
    try { this.remotePlayback.gain.disconnect() } catch { /* ignore */ }
    try {
      if (this.remotePlayback.ctx.state !== 'closed') void this.remotePlayback.ctx.close()
    } catch { /* ignore */ }
    this.remotePlayback = null
  }

  private async resumeRemotePlayback(): Promise<void> {
    try {
      if (this.remotePlayback?.ctx.state === 'suspended') {
        await this.remotePlayback.ctx.resume()
      }
      const el = this.remoteAudio
      if (el?.paused) await el.play()
    } catch { /* ignore */ }
  }

  /** Chrome jitterBufferTarget — reduces catch-up / chipmunk after early media. */
  applyReceiverJitterBufferHints(pc: RTCPeerConnection, targetMs = REMOTE_AUDIO_JITTER_BUFFER_MS): void {
    if (!pc.getReceivers) return
    try {
      for (const r of pc.getReceivers()) {
        const track = r.track
        if (!track || track.kind !== 'audio' || track.readyState === 'ended') continue
        if ('jitterBufferTarget' in r) {
          try {
            ;(r as RTCRtpReceiver & { jitterBufferTarget: number }).jitterBufferTarget = targetMs
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  // ── audio element management ──────────────────────────────────────

  private ensureRemoteAudio(): HTMLAudioElement {
    if (this.remoteAudio) return this.remoteAudio
    const el = document.createElement('audio') as SinkableAudio
    el.id = 'callspire-remote-audio'
    el.autoplay = true
    el.hidden = true
    el.setAttribute('playsinline', '')
    document.body.appendChild(el)
    this.remoteAudio = el
    // Apply any speaker preference that arrived before the element was created.
    if (this.currentSpeakerId) void applySinkId(el, this.currentSpeakerId)
    return el
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx
    const Ctor = getAudioContextCtor()
    if (!Ctor) return null
    this.ctx = new Ctor({ latencyHint: 'interactive' })
    return this.ctx
  }

  // ── autoplay unlock ───────────────────────────────────────────────

  /** Resume Web Audio / remote `<audio>` after a user gesture (login, dial, this button). */
  async unlock(options?: { playFeedback?: boolean }): Promise<boolean> {
    let micOk = false
    try {
      let stream: MediaStream | null = null
      try {
        stream = await withTimeout(
          navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
          8000,
          'getUserMedia',
        )
        micOk = true
      } catch (e) {
        console.warn('[SoftphoneAudio] getUserMedia failed:', e)
      } finally {
        stream?.getTracks().forEach((t) => t.stop())
      }
    } catch (e) {
      console.warn('[SoftphoneAudio] mic unlock failed:', e)
    }

    // Best-effort — must not undo a successful mic grant.
    try {
      const ctx = this.ensureContext()
      const el = this.ensureRemoteAudio()
      if (ctx && ctx.state !== 'running') await ctx.resume()
      if (ctx) {
        const frames = Math.max(2, Math.floor(ctx.sampleRate * 0.02))
        const buf = ctx.createBuffer(1, frames, ctx.sampleRate)
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(ctx.destination)
        src.start(0)
        if (ctx.state !== 'running') await ctx.resume()
      }
      try {
        await el.play()
      } catch {
        /* no srcObject yet */
      }
    } catch (e) {
      console.warn('[SoftphoneAudio] AudioContext unlock failed:', e)
    }

    this.unlocked = micOk
    if (this.unlocked && options?.playFeedback) {
      try {
        await this.testSpeaker(this.currentSpeakerId)
      } catch (e) {
        console.warn('[SoftphoneAudio] testSpeaker failed:', e)
      }
    }
    return this.unlocked
  }

  // ── remote stream binding ─────────────────────────────────────────

  private trackKey(tracks: MediaStreamTrack[]): string {
    return tracks.map((t) => t.id).sort().join('|')
  }

  isRemoteAttached(): boolean {
    return !!this.remotePlayback || !!this.remoteAudio?.srcObject
  }

  isAttachedToTracks(tracks: MediaStreamTrack[]): boolean {
    if (!tracks.length || !this.attachedTrackKey) return false
    return this.trackKey(tracks) === this.attachedTrackKey && this.isRemoteAttached()
  }

  attachRemoteStream(stream: MediaStream, options?: { force?: boolean }): void {
    const tracks = stream.getAudioTracks().filter((t) => t.readyState !== 'ended')
    if (!tracks.length) return

    const el = this.ensureRemoteAudio()
    const ms = tracks.length === stream.getAudioTracks().length
      ? stream
      : new MediaStream(tracks)
    const key = this.trackKey(tracks)

    if (!options?.force && key === this.attachedTrackKey && this.isRemoteAttached()) {
      if (el.srcObject !== ms) el.srcObject = ms
      void this.resumeRemotePlayback()
      return
    }

    this.teardownRemotePlayback()
    this.attachedTrackKey = key
    el.srcObject = ms
    el.muted = false
    el.playbackRate = 1
    el.defaultPlaybackRate = 1

    if (this.useWebAudioPlayback()) {
      el.volume = 0
      void el.play().catch(() => { /* unlocked on gesture */ })
      try {
        const Ctor = getAudioContextCtor()
        if (!Ctor) throw new Error('AudioContext unavailable')
        const ctx = new Ctor({ latencyHint: 'interactive' }) as SinkableAudioContext
        const source = ctx.createMediaStreamSource(ms)
        const gain = ctx.createGain()
        gain.gain.value = 1
        source.connect(gain)
        gain.connect(ctx.destination)
        this.remotePlayback = { ctx, source, gain, stream: ms }
        void ctx.resume()
        if (this.currentSpeakerId && typeof ctx.setSinkId === 'function') {
          void ctx.setSinkId(this.currentSpeakerId).catch(() => {})
        }
        appLog('info', '[audio] remote playback via WebAudio')
      } catch (e) {
        appLog('warn', '[audio] WebAudio attach failed — fallback to html audio', e)
        el.volume = 1
        void el.play().catch(() => {})
      }
    } else {
      el.volume = 1
      void el.play().catch(() => {})
      appLog('info', '[audio] remote playback via html audio')
    }
  }

  /** Rebuild WebAudio graph after PBX re-INVITE / 200 OK when track ids change. */
  reconnectRemoteStream(stream: MediaStream): void {
    const tracks = stream.getAudioTracks().filter((t) => t.readyState !== 'ended')
    if (!tracks.length) return
    const key = this.trackKey(tracks)
    if (key !== this.attachedTrackKey) {
      this.attachRemoteStream(stream, { force: true })
      return
    }
    this.attachRemoteStream(stream)
  }

  clearRemoteStream(): void {
    this.teardownRemotePlayback()
    this.attachedTrackKey = ''
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null
      this.remoteAudio.volume = 1
      this.remoteAudio.playbackRate = 1
    }
  }

  // ── speaker routing ───────────────────────────────────────────────

  /**
   * Route all managed <audio> elements to the chosen output device.
   * No-op on Firefox/Safari where setSinkId is unavailable.
   */
  async updateSpeakerDevice(speakerId: string): Promise<void> {
    this.currentSpeakerId = speakerId
    if (this.remoteAudio) await applySinkId(this.remoteAudio, speakerId)
    const ctx = this.remotePlayback?.ctx as SinkableAudioContext | undefined
    if (speakerId && ctx && typeof ctx.setSinkId === 'function') {
      try {
        await ctx.setSinkId(speakerId)
      } catch (e) {
        console.warn('[SoftphoneAudio] AudioContext setSinkId failed:', e)
      }
    }
  }

  /**
   * Play a 500ms test beep on the given speaker output so the user can
   * confirm their headset is connected and audible.
   */
  async testSpeaker(speakerId: string): Promise<void> {
    const Ctor = getAudioContextCtor()
    if (!Ctor) return
    try {
      const ctx = new Ctor()
      await ctx.resume()
      const dest = ctx.createMediaStreamDestination()
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.03)
      gain.gain.setValueAtTime(0.28, ctx.currentTime + 0.44)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5)

      osc.connect(gain)
      gain.connect(dest)
      osc.start()
      osc.stop(ctx.currentTime + 0.52)

      const testEl = new Audio() as SinkableAudio
      testEl.srcObject = dest.stream

      if (speakerId && typeof testEl.setSinkId === 'function') {
        await testEl.setSinkId(speakerId)
      }

      await testEl.play()

      setTimeout(() => {
        testEl.srcObject = null
        void ctx.close()
      }, 700)
    } catch (e) {
      console.warn('[SoftphoneAudio] testSpeaker failed:', e)
    }
  }

  // ── media constraints for JsSIP ──────────────────────────────────

  /**
   * Build a MediaStreamConstraints object for getUserMedia / JsSIP calls.
   * Uses `ideal` (not `exact`) so the call degrades gracefully if the
   * preferred microphone is unplugged rather than throwing a hard error.
   */
  getAudioConstraints(micId?: string): MediaStreamConstraints {
    const audio: MediaTrackConstraints = {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl:  { ideal: true },
    }
    if (micId && micId !== 'default' && micId !== '') {
      audio.deviceId = { ideal: micId }
    }
    return { audio, video: false }
  }

  // ── synthesized tones ─────────────────────────────────────────────

  private startTone(pattern: TonePattern): void {
    this.stopTone()
    const ctx = this.ensureContext()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})

    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(ctx.destination)

    const oscs = pattern.freqs.map((f) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f
      osc.connect(gain)
      osc.start()
      return osc
    })

    this.toneGain = gain
    this.toneOscillators = oscs
    this.toneCycleActive = true

    const cycle = () => {
      if (!this.toneCycleActive || !this.toneGain || !this.ctx) return
      const now = this.ctx.currentTime
      this.toneGain.gain.cancelScheduledValues(now)
      this.toneGain.gain.setValueAtTime(0, now)
      this.toneGain.gain.linearRampToValueAtTime(pattern.volume, now + 0.02)
      this.toneGain.gain.setValueAtTime(pattern.volume, now + pattern.onMs / 1000)
      this.toneGain.gain.linearRampToValueAtTime(0, now + pattern.onMs / 1000 + 0.02)
    }

    cycle()
    this.toneTimer = window.setInterval(cycle, pattern.onMs + pattern.offMs)
  }

  private stopTone(): void {
    this.toneCycleActive = false
    this.activeToneKind = null
    if (this.toneTimer !== null) {
      window.clearInterval(this.toneTimer)
      this.toneTimer = null
    }
    for (const osc of this.toneOscillators) {
      try { osc.stop(); osc.disconnect() } catch { /* already stopped */ }
    }
    this.toneOscillators = []
    if (this.toneGain) {
      try { this.toneGain.disconnect() } catch { /* ignore */ }
      this.toneGain = null
    }
  }

  startRingback(): void {
    if (this.activeToneKind === 'ringback' && this.toneCycleActive) return
    this.activeToneKind = 'ringback'
    this.startTone({ freqs: [425], onMs: 1000, offMs: 4000, volume: 0.12 })
  }

  startRingtone(): void {
    if (this.activeToneKind === 'ringtone' && this.toneCycleActive) return
    this.activeToneKind = 'ringtone'
    this.startTone({ freqs: [440, 480], onMs: 1000, offMs: 2000, volume: 0.14 })
  }

  stopRingback(): void {
    if (this.activeToneKind === 'ringback') this.stopTone()
  }

  stopRingtone(): void {
    if (this.activeToneKind === 'ringtone') this.stopTone()
  }

  /** Stop ringtone/ringback immediately (e.g. inbound Answer). */
  stopAllLocalTones(): void {
    this.stopTone()
  }

  /** Stop local ringback when remote RTP carries real audio (desktop remote_audio_started). */
  startRemoteAudioProbe(stream: MediaStream, onDetected: () => void): void {
    this.stopRemoteAudioProbe()
    const Ctor = getAudioContextCtor()
    const tracks = stream.getAudioTracks().filter((t) => t.readyState === 'live')
    if (!Ctor || !tracks.length) return

    try {
      const ctx = new Ctor({ latencyHint: 'interactive' })
      this.audioProbeCtx = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)
      void ctx.resume()

      let consecutive = 0
      let waited = 0
      const intervalMs = 100
      const required = 3
      const maxWaitMs = 120_000

      const tick = () => {
        if (tracks[0]?.readyState === 'ended' || waited >= maxWaitMs) {
          this.stopRemoteAudioProbe()
          return
        }
        waited += intervalMs
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteTimeDomainData(data)
        let maxDeviation = 0
        let strong = 0
        for (let i = 0; i < data.length; i++) {
          const d = Math.abs(data[i]! - 128)
          if (d > maxDeviation) maxDeviation = d
          if (d > 10) strong++
        }
        if (maxDeviation > 10 && strong > 20) {
          consecutive++
          if (consecutive >= required) {
            appLog('info', '[audio] remote media signal detected', { waitedMs: waited })
            onDetected()
            this.stopRemoteAudioProbe()
            return
          }
        } else {
          consecutive = 0
        }
        this.audioProbeTimer = window.setTimeout(tick, intervalMs)
      }
      this.audioProbeTimer = window.setTimeout(tick, intervalMs)
    } catch (e) {
      appLog('warn', '[audio] remote audio probe failed', e)
    }
  }

  stopRemoteAudioProbe(): void {
    if (this.audioProbeTimer !== null) {
      window.clearTimeout(this.audioProbeTimer)
      this.audioProbeTimer = null
    }
    if (this.audioProbeCtx) {
      try {
        if (this.audioProbeCtx.state !== 'closed') void this.audioProbeCtx.close()
      } catch { /* ignore */ }
      this.audioProbeCtx = null
    }
  }

  reset(): void {
    this.stopTone()
    this.stopRemoteAudioProbe()
    this.clearRemoteStream()
  }
}

export const softphoneAudio = new SoftphoneAudio()

export async function isMicrophonePermissionGranted(): Promise<boolean | null> {
  if (!navigator.permissions?.query) return null
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state === 'granted'
  } catch {
    return null
  }
}
