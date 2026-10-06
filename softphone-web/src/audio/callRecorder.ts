import { appLog } from '@/logging/logCapture'

let mediaRecorder: MediaRecorder | null = null
let recordingChunks: Blob[] = []
let recordingStream: MediaStream | null = null
let audioContext: AudioContext | null = null
let starting = false

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return 'audio/webm'
}

function cleanupGraph() {
  recordingStream?.getTracks().forEach((t) => t.stop())
  recordingStream = null
  if (audioContext && audioContext.state !== 'closed') {
    void audioContext.close().catch(() => {})
  }
  audioContext = null
}

/** Mix local + remote audio from the call PC into a single recording (desktop parity). */
export async function startCallRecording(pc: RTCPeerConnection): Promise<void> {
  if (starting) return
  if (mediaRecorder?.state === 'recording') return
  if (typeof MediaRecorder === 'undefined') {
    appLog('warn', '[record] MediaRecorder not available')
    return
  }

  starting = true
  try {
    cleanupGraph()
    recordingChunks = []
    mediaRecorder = null

    const ctx = new AudioContext()
    await ctx.resume()
    const dest = ctx.createMediaStreamDestination()
    let sources = 0

    for (const sender of pc.getSenders()) {
      const track = sender.track
      if (track?.kind === 'audio' && track.readyState === 'live') {
        ctx.createMediaStreamSource(new MediaStream([track])).connect(dest)
        sources++
      }
    }
    for (const receiver of pc.getReceivers()) {
      const track = receiver.track
      if (track?.kind === 'audio' && track.readyState === 'live') {
        ctx.createMediaStreamSource(new MediaStream([track])).connect(dest)
        sources++
      }
    }

    if (sources === 0) {
      appLog('warn', '[record] no live audio tracks — skip client recording')
      await ctx.close()
      return
    }

    audioContext = ctx
    recordingStream = dest.stream

    const mimeType = pickMimeType()
    mediaRecorder = new MediaRecorder(recordingStream, { mimeType })
    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) recordingChunks.push(ev.data)
    }
    mediaRecorder.start(1000)
    appLog('info', '[record] started', { mimeType, sources })
  } catch (e) {
    appLog('error', '[record] start failed', e)
    cleanupGraph()
    mediaRecorder = null
  } finally {
    starting = false
  }
}

export function stopCallRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const rec = mediaRecorder
    if (!rec || rec.state === 'inactive') {
      cleanupGraph()
      mediaRecorder = null
      recordingChunks = []
      resolve(null)
      return
    }

    rec.onstop = () => {
      const mime = rec.mimeType || pickMimeType()
      const blob =
        recordingChunks.length > 0 ? new Blob(recordingChunks, { type: mime }) : null
      appLog('info', '[record] stopped', { bytes: blob?.size ?? 0 })
      cleanupGraph()
      mediaRecorder = null
      recordingChunks = []
      resolve(blob && blob.size > 32 ? blob : null)
    }

    try {
      rec.stop()
    } catch (e) {
      appLog('warn', '[record] stop error', e)
      cleanupGraph()
      mediaRecorder = null
      recordingChunks = []
      resolve(null)
    }
  })
}
