import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RTCSession, PeerConnectionEvent, EndEvent } from 'jssip/lib/RTCSession'
import { softphoneAudio, isMicrophonePermissionGranted } from '@/audio/softphoneAudio'
import {
  sanitizeRemoteSdp,
  extractIceLines,
  hasIceCredentials,
  countCandidates,
  summarizeCandidateTypes,
  connectionIpFromSdp,
  rewritePrivateHostCandidates,
  dialUserForMikoWebRtc,
} from '@/audio/sdpSanitize'
import { buildLocalOfferSdpForSignaling, getCallIceBuffer, prepareInboundAnswerPc, prepareOutboundCallPc } from '@/audio/iceWarmup'
import { buildPcConfig, getActiveUA, useWebRtcStore } from '@/stores/webrtc'
import { usePreferencesStore } from '@/stores/preferences'
import { appLog } from '@/logging/logCapture'
import { api } from '@/api/client'
import { submitEndedCallToKommo } from '@/kommo/callUpload'
import { lookupKommoContact } from '@/kommo/contactLookup'
import { useKommoStore } from '@/stores/kommo'
import { useCallerIdsStore } from '@/stores/callerids'
import {
  acceptOriginateSession,
  beginOriginatePending,
  clearOriginateState,
  getOriginatePending,
  getOriginateHeader,
  isOriginateCallback,
  isForeignOriginateCallback,
  isOriginatePending,
  setOriginateId,
} from '@/sip/originateCoordinator'

export type CallDirection = 'inbound' | 'outbound' | null
export type CallStatus = 'idle' | 'ringing' | 'connecting' | 'active' | 'held'

let session: RTCSession | null = null
let callMicStream: MediaStream | null = null
/** Bumped on hangup/reset to cancel in-flight answer (inbound + originate). */
let answerAbortGen = 0
const boundRemoteAudioPcs = new WeakSet<RTCPeerConnection>()
let remoteAudioProbeStarted = false

export const useCallsStore = defineStore('calls', () => {
  const callStatus = ref<CallStatus>('idle')
  const direction = ref<CallDirection>(null)
  const remoteNumber = ref<string>('')
  const remoteDisplayName = ref<string>('')
  const resolvedLeadId = ref<number | null>(null)
  const muted = ref(false)
  const onHold = ref(false)
  const startedAt = ref<number | null>(null)
  const callPlacedAt = ref<number | null>(null)
  const audioContextUnlocked = ref(false)
  const lastError = ref<string | null>(null)
  /** Caller ID used for the current outbound call (originate path). */
  const outboundCallerId = ref<string | null>(null)

  const inCall = computed(() => callStatus.value !== 'idle')
  const isActive = computed(() => callStatus.value === 'active' || callStatus.value === 'held')

  async function lookupRemoteContact(phone: string) {
    const clean = phone.trim()
    if (!clean) return
    remoteDisplayName.value = ''
    resolvedLeadId.value = null
    const kommo = useKommoStore()
    if (!kommo.status) {
      try {
        await kommo.fetchKommoStatus()
      } catch {
        /* non-fatal */
      }
    }
    if (kommo.status?.excluded || !kommo.status?.enabled) return
    const result = await lookupKommoContact(clean)
    if (remoteNumber.value.trim() !== clean) return
    if (result?.name) remoteDisplayName.value = result.name
    resolvedLeadId.value = result?.lead_id ?? null
  }

  function resetCallState() {
    answerAbortGen++
    session = null
    callMicStream?.getTracks().forEach((t) => t.stop())
    callMicStream = null
    callStatus.value = 'idle'
    direction.value = null
    remoteNumber.value = ''
    remoteDisplayName.value = ''
    resolvedLeadId.value = null
    muted.value = false
    onHold.value = false
    startedAt.value = null
    callPlacedAt.value = null
    outboundCallerId.value = null
    clearOriginateState()
  }

  function queueKommoUpload(s: RTCSession) {
    const phone = remoteNumber.value?.trim()
    const placedAt = callPlacedAt.value
    if (!phone || !placedAt) return
    let sessionId: string | undefined
    try {
      sessionId = s.id
    } catch {
      sessionId = undefined
    }
    void submitEndedCallToKommo({
      phone,
      sessionId,
      isIncoming: direction.value === 'inbound',
      callPlacedAt: placedAt,
      answeredAt: startedAt.value,
      // Kommo note must say "Call from <outbound caller ID>", not the PBX ext.
      callFromLabel:
        direction.value === 'inbound' ? undefined : outboundCallerId.value ?? undefined,
    })
  }

  async function unlockAudio(options?: { feedback?: boolean }): Promise<boolean> {
    const ok = await softphoneAudio.unlock({ playFeedback: options?.feedback })
    audioContextUnlocked.value = ok
    appLog('info', '[audio] unlock', { ok, micPermission: await isMicrophonePermissionGranted() })
    return ok
  }

  /** Hide "Enable sound" when mic is already granted (e.g. via browser site settings). */
  async function syncAudioUnlockState(): Promise<boolean> {
    if (audioContextUnlocked.value) return true
    const granted = await isMicrophonePermissionGranted()
    if (granted === true) {
      audioContextUnlocked.value = true
      softphoneAudio.unlocked = true
      appLog('info', '[audio] auto-unlocked — mic permission already granted')
      return true
    }
    return false
  }

  function iceSnapshot(pc: RTCPeerConnection) {
    const localSdp = pc.localDescription?.sdp ?? ''
    const remoteSdp = pc.remoteDescription?.sdp ?? ''
    return {
      ice: pc.iceConnectionState,
      connection: pc.connectionState,
      gathering: pc.iceGatheringState,
      signaling: pc.signalingState,
      localCandidates: countCandidates(localSdp),
      remoteCandidates: countCandidates(remoteSdp),
      localTypes: summarizeCandidateTypes(localSdp),
      remoteTypes: summarizeCandidateTypes(remoteSdp),
    }
  }

  async function logIcePairStats(pc: RTCPeerConnection, label: string) {
    try {
      const pairs: Array<{ state?: string; localType?: string; remoteType?: string }> = []
      const candTypes = new Map<string, string>()
      const stats = await pc.getStats()
      stats.forEach((r) => {
        if (r.type === 'local-candidate' || r.type === 'remote-candidate') {
          const c = r as RTCIceCandidateStats
          candTypes.set(r.id, c.candidateType ?? 'unknown')
        }
      })
      stats.forEach((r) => {
        if (r.type !== 'candidate-pair') return
        const p = r as RTCIceCandidatePairStats
        pairs.push({
          state: p.state,
          localType: p.localCandidateId ? candTypes.get(p.localCandidateId) : undefined,
          remoteType: p.remoteCandidateId ? candTypes.get(p.remoteCandidateId) : undefined,
        })
      })
      appLog('warn', `[call] ${label}`, { pairs: pairs.slice(0, 12) })
    } catch {
      /* ignore */
    }
  }

  function scheduleIceRestart(s: RTCSession, pc: RTCPeerConnection) {
    window.setTimeout(() => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return
      if (pc.iceConnectionState === 'closed' || pc.iceConnectionState === 'failed') return
      if (countCandidates(pc.localDescription?.sdp ?? '') === 0) return
      appLog('warn', '[call] ICE restart — not connected after 3s', iceSnapshot(pc))
      try {
        s.renegotiate({
          rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false, iceRestart: true },
        })
      } catch (err) {
        appLog('error', '[call] ICE restart failed', err)
      }
    }, 3000)
  }

  function scheduleIceDiagnostics(pc: RTCPeerConnection, s: RTCSession) {
    const snap = (label: string) => appLog('info', `[call] ICE watch ${label}`, iceSnapshot(pc))
    window.setTimeout(() => snap('2s'), 2000)
    window.setTimeout(() => snap('5s'), 5000)
    window.setTimeout(async () => {
      snap('8s')
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return
      await logIcePairStats(pc, 'ICE not connected after 8s')
    }, 8000)
    scheduleIceRestart(s, pc)
  }

  async function audioBytesReceived(pc: RTCPeerConnection): Promise<number> {
    try {
      let bytes = 0
      const stats = await pc.getStats()
      stats.forEach((r) => {
        if (r.type === 'inbound-rtp' && (r as RTCInboundRtpStreamStats).kind === 'audio') {
          bytes += (r as RTCInboundRtpStreamStats).bytesReceived ?? 0
        }
      })
      return bytes
    } catch {
      return 0
    }
  }

  /**
   * phone.js scheduleInboundMediaRecovery(): Miko bridges the trunk without
   * refreshing WS RTP, so re-INVITE once when a live call has no inbound audio.
   */
  function scheduleOriginateMediaRecovery(s: RTCSession, reason: string) {
    const tagged = s as RTCSession & { _softphoneRecoveryScheduled?: boolean }
    if (tagged._softphoneRecoveryScheduled) return
    tagged._softphoneRecoveryScheduled = true

    window.setTimeout(async () => {
      const pc = s.connection
      if (!pc || callStatus.value === 'idle') return
      if (await audioBytesReceived(pc)) return
      attachRemoteFromPc(pc, 'originate-recovery')
      if (typeof s.renegotiate !== 'function') return
      try {
        s.renegotiate({
          useUpdate: false,
          rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
        })
        appLog('info', '[call] originate media renegotiate — no inbound RTP', { reason })
      } catch (err) {
        appLog('warn', '[call] originate media renegotiate failed', { reason, err })
      }
    }, 2200)
  }

  /** Diagnostics only — relay↔host pairs stuck in-progress mean TURN cannot reach the PBX. */
  function watchOriginateIce(pc: RTCPeerConnection) {
    window.setTimeout(() => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return
      void logIcePairStats(pc, `originate ICE still ${pc.iceConnectionState} after 4s`)
    }, 4000)
  }

  function canPlayInboundRemoteAudio(): boolean {
    return callStatus.value === 'active' || callStatus.value === 'held'
  }

  function attachRemoteFromPc(pc: RTCPeerConnection, reason: string): boolean {
    if (direction.value === 'inbound' && !canPlayInboundRemoteAudio()) {
      appLog('info', '[call] defer inbound remote audio until active', { reason })
      return false
    }
    softphoneAudio.applyReceiverJitterBufferHints(pc)
    const tracks = (pc.getReceivers?.() ?? [])
      .map((r) => r.track)
      .filter((t): t is MediaStreamTrack => !!t && t.kind === 'audio' && t.readyState !== 'ended')
    if (!tracks.length) return false
    if (reason !== 'signaling-reneg' && softphoneAudio.isAttachedToTracks(tracks)) {
      return false
    }
    const stream = new MediaStream(tracks)
    if (reason === 'signaling-reneg') {
      softphoneAudio.reconnectRemoteStream(stream)
    } else {
      softphoneAudio.attachRemoteStream(stream)
    }
    softphoneAudio.stopRingback()
    softphoneAudio.stopRingtone()
    if (
      direction.value === 'outbound' &&
      callStatus.value === 'ringing' &&
      !remoteAudioProbeStarted
    ) {
      remoteAudioProbeStarted = true
      softphoneAudio.startRemoteAudioProbe(stream, () => {
        softphoneAudio.stopRingback()
      })
    }
    appLog('info', '[call] remote audio attached', { reason, tracks: tracks.length })
    return true
  }

  function sessionHasEarlyMedia(pc: RTCPeerConnection | null | undefined): boolean {
    if (!pc?.remoteDescription?.sdp) return false
    const sdp = pc.remoteDescription.sdp
    if (!/^m=audio/im.test(sdp)) return false
    const hasLiveTrack = (pc.getReceivers?.() ?? []).some(
      (r) => r.track?.kind === 'audio' && r.track.readyState === 'live',
    )
    if (hasLiveTrack) return true
    return /a=(sendrecv|recvonly|sendonly)/im.test(sdp)
  }

  function cancelDeferredRingback(timer: { value: number | null }) {
    if (timer.value !== null) {
      window.clearTimeout(timer.value)
      timer.value = null
    }
  }

  function bindRemoteAudio(pc: RTCPeerConnection) {
    if (!boundRemoteAudioPcs.has(pc)) {
      boundRemoteAudioPcs.add(pc)
      pc.addEventListener('track', (ev: RTCTrackEvent) => {
        if (ev.track.kind !== 'audio') return
        softphoneAudio.applyReceiverJitterBufferHints(pc)
        attachRemoteFromPc(pc, 'track')
        appLog('info', '[call] remote audio track', { id: ev.track.id.slice(0, 8) })
      })
    }
    attachRemoteFromPc(pc, 'bind')
  }

  /**
   * Session wiring aligned with WebRtcClient/phone.js wireSessionEvents():
   * stock JsSIP + icecandidate/ready() shortcut (3s outbound / 1.6s inbound).
   */
  function wireSession(s: RTCSession, originator: 'local' | 'remote' | 'system') {
    let cachedRemoteIce: string[] = []
    let sessionFixedSyntheticIce: string[] = []
    const ringbackDeferTimer = { value: null as number | null }
    const earlyMediaPollTimer = { value: null as number | null }
    let earlyMediaSdpSeen = false
    let sdpStableCount = 0
    remoteAudioProbeStarted = false

    const stopEarlyMediaPoll = () => {
      if (earlyMediaPollTimer.value !== null) {
        window.clearTimeout(earlyMediaPollTimer.value)
        earlyMediaPollTimer.value = null
      }
    }

    const startEarlyMediaPoll = () => {
      if (earlyMediaPollTimer.value !== null) return
      const poll = () => {
        if (callStatus.value !== 'ringing' && callStatus.value !== 'connecting') {
          stopEarlyMediaPoll()
          return
        }
        const pc = s.connection
        if (pc) {
          const hasTracks = (pc.getReceivers?.() ?? []).some(
            (r) => r.track?.kind === 'audio' && r.track.readyState === 'live',
          )
          if (hasTracks) {
            attachRemoteFromPc(pc, 'early-media')
            cancelDeferredRingback(ringbackDeferTimer)
            softphoneAudio.stopRingback()
            if (softphoneAudio.isRemoteAttached()) {
              stopEarlyMediaPoll()
              return
            }
          }
        }
        earlyMediaPollTimer.value = window.setTimeout(poll, 250)
      }
      earlyMediaPollTimer.value = window.setTimeout(poll, 100)
    }

    const onEarlyMediaSdp = (source: string) => {
      if (direction.value !== 'outbound' || earlyMediaSdpSeen) return
      earlyMediaSdpSeen = true
      cancelDeferredRingback(ringbackDeferTimer)
      softphoneAudio.stopRingback()
      appLog('info', '[call] early media SDP — use PBX audio', { source })
      startEarlyMediaPoll()
      window.setTimeout(() => {
        const pc = s.connection
        if (pc) attachRemoteFromPc(pc, 'early-media-sdp')
      }, 50)
    }

    const maybeSkipLocalRingback = (source: string) => {
      if (earlyMediaSdpSeen) {
        cancelDeferredRingback(ringbackDeferTimer)
        softphoneAudio.stopRingback()
        appLog('info', '[call] skip local ringback — early media SDP cached', { source })
        return true
      }
      const pc = s.connection
      if (!sessionHasEarlyMedia(pc)) return false
      cancelDeferredRingback(ringbackDeferTimer)
      softphoneAudio.stopRingback()
      appLog('info', '[call] skip local ringback — PBX early media', { source })
      return true
    }

    const patchAndLogRemoteSdp = (sdp: string, type: string): string => {
      const hostRewrite = rewritePrivateHostCandidates(sdp)
      const patched = sanitizeRemoteSdp(hostRewrite.sdp, {
        cachedIceLines: cachedRemoteIce,
        fixedIceLines: sessionFixedSyntheticIce,
        allowSyntheticIce: true,
      })
      if (hostRewrite.rewritten > 0) {
        appLog('info', '[call] rewrote private PBX host candidates', {
          count: hostRewrite.rewritten,
          publicIp: hostRewrite.publicIp,
          connectionIp: connectionIpFromSdp(sdp),
        })
      }
      if (!hasIceCredentials(sdp) && hasIceCredentials(patched) && !sessionFixedSyntheticIce.length) {
        sessionFixedSyntheticIce = extractIceLines(patched).filter((l) =>
          /^a=ice-(ufrag|pwd):/i.test(l) || /^a=candidate:/i.test(l) || /^a=end-of-candidates/i.test(l),
        )
      }
      if (patched !== sdp) {
        appLog('info', `[call] patched remote ${type} SDP`, {
          iceFrom: !hasIceCredentials(sdp)
            ? cachedRemoteIce.length
              ? 'progress'
              : sessionFixedSyntheticIce.length
                ? 'fixed'
                : 'synthetic'
            : 'recvonly-fmt',
          candidates: countCandidates(patched),
          hasIce: hasIceCredentials(patched),
          types: summarizeCandidateTypes(patched),
        })
        return patched
      }
      appLog('info', `[call] remote ${type} SDP`, {
        candidates: countCandidates(sdp),
        hasIce: hasIceCredentials(sdp),
        types: summarizeCandidateTypes(sdp),
      })
      return sdp
    }

    s.on('sdp', (e: { originator?: string; type?: string; sdp?: string }) => {
      if (!e.sdp) return
      if (e.originator === 'remote') {
        const ice = extractIceLines(e.sdp)
        if (hasIceCredentials(e.sdp)) cachedRemoteIce = ice

        if (e.type === 'offer' || e.type === 'answer') {
          e.sdp = patchAndLogRemoteSdp(e.sdp, e.type)
          if (direction.value === 'outbound' && e.type === 'answer') {
            onEarlyMediaSdp('remote-answer-sdp')
          }
        }
      } else if (e.originator === 'local' && (e.type === 'offer' || e.type === 'answer')) {
        const pc = s.connection
        const buffer = pc ? getCallIceBuffer(pc) : null
        const merged = buildLocalOfferSdpForSignaling(pc, buffer)
        if (merged && countCandidates(merged) >= countCandidates(e.sdp ?? '')) {
          e.sdp = merged
        }
        appLog('info', `[call] local ${e.type} SDP`, {
          candidates: countCandidates(e.sdp ?? ''),
          hasIce: hasIceCredentials(e.sdp ?? ''),
          types: summarizeCandidateTypes(e.sdp ?? ''),
        })
      }
    })

    // phone.js: without s.on('icecandidate') + ready(), JsSIP waits for gathering complete (~30s if STUN slow).
    let iceReadyCalled = false
    let lastReadyFn: (() => void) | null = null
    let hasSrflx = false
    let candidateCount = 0
    let iceGatherActive = originator !== 'remote'
    const relayOnly = buildPcConfig(useWebRtcStore().config).iceTransportPolicy === 'relay'
    const baseGatherTimeoutMs = originator === 'remote' ? 1600 : 3000
    const ICE_GATHER_TIMEOUT_MS = relayOnly ? Math.max(baseGatherTimeoutMs, 4000) : baseGatherTimeoutMs
    const ICE_GATHER_MAX_WAIT_MS = relayOnly ? 9000 : ICE_GATHER_TIMEOUT_MS
    let gatherTimer: number | null = null
    let gatherStartedAt = 0

    const callReady = (reason: string) => {
      if (iceReadyCalled) return
      iceReadyCalled = true
      const pc = s.connection
      const buffer = pc ? getCallIceBuffer(pc) : null
      if (buffer?.hasRelay && candidateCount === 0) {
        candidateCount = buffer.lines.length
      }
      appLog('info', '[call] ice ready — send SDP', {
        reason,
        candidateCount,
        hasSrflx,
        hasRelay: buffer?.hasRelay ?? false,
      })
      lastReadyFn?.()
    }

    const relayReadyFromPc = (): boolean => {
      const pc = s.connection
      const buffer = pc ? getCallIceBuffer(pc) : null
      if (buffer?.hasRelay || (buffer?.lines.length ?? 0) > 0) {
        candidateCount = Math.max(candidateCount, buffer?.lines.length ?? 0)
        callReady(buffer?.hasRelay ? 'relay in PC buffer' : 'host in PC buffer')
        return true
      }
      return false
    }

    const startIceGatherTimer = () => {
      if (gatherTimer) window.clearTimeout(gatherTimer)
      gatherStartedAt = Date.now()
      const onGatherTimeout = () => {
        if (relayReadyFromPc()) return
        const waitedMs = Date.now() - gatherStartedAt
        if (relayOnly && candidateCount === 0 && waitedMs < ICE_GATHER_MAX_WAIT_MS) {
          gatherTimer = window.setTimeout(onGatherTimeout, Math.min(1000, ICE_GATHER_MAX_WAIT_MS - waitedMs))
          return
        }
        callReady(`${waitedMs}ms timeout (TURN/STUN may be unreachable)`)
      }
      gatherTimer = window.setTimeout(onGatherTimeout, ICE_GATHER_TIMEOUT_MS)
    }

    const beginAnswerIceGather = () => {
      iceGatherActive = true
      iceReadyCalled = false
      lastReadyFn = null
      candidateCount = 0
      hasSrflx = false
      appLog('info', '[call] inbound answer ICE gather started')
      startIceGatherTimer()
    }

    if (originator !== 'remote') {
      startIceGatherTimer()
    }

    s.on('icecandidate', (evt: { candidate?: RTCIceCandidate | null; ready?: () => void }) => {
      if (evt.ready) lastReadyFn = evt.ready
      if (!iceGatherActive) return
      if (!evt.candidate) {
        if (gatherTimer) window.clearTimeout(gatherTimer)
        callReady('ICE gathering complete (null candidate)')
        return
      }
      candidateCount++
      const c = evt.candidate.candidate ?? ''
      appLog('info', '[call] icecandidate', c.slice(0, 96))
      if (c.includes('srflx') || /\btyp relay\b/i.test(c)) {
        if (c.includes('srflx')) hasSrflx = true
        if (gatherTimer) window.clearTimeout(gatherTimer)
        callReady(c.includes('srflx') ? 'srflx candidate found' : 'relay candidate found')
      }
    })

    s.on('peerconnection:setlocaldescriptionfailed', (err: unknown) => {
      appLog('error', '[call] setLocalDescription failed', err)
    })

    s.on('peerconnection:setremotedescriptionfailed', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Called in wrong state: stable')) {
        appLog('warn', '[call] ignored duplicate remote answer (already stable)')
        return
      }
      appLog('error', '[call] setRemoteDescription failed', err)
    })

    const isOriginateOutbound = direction.value === 'outbound' && originator === 'remote'

    s.on('peerconnection', (e: PeerConnectionEvent) => {
      appLog('info', '[call] peerconnection created')
      const pc = e.peerconnection
      if (originator === 'local') {
        prepareOutboundCallPc(pc, { timeoutMs: 8000, minWaitMs: 3000 })
      } else {
        const buffer = prepareInboundAnswerPc(pc, {
          timeoutMs: relayOnly ? 9000 : 3000,
          minWaitMs: 800,
        })
        beginAnswerIceGather()
        pc.addEventListener('icecandidate', (ev: RTCPeerConnectionIceEvent) => {
          const raw = ev.candidate?.candidate ?? ''
          if (!raw || iceReadyCalled || !iceGatherActive) return
          if (/\btyp relay\b/i.test(raw) || buffer.hasRelay) {
            if (gatherTimer) window.clearTimeout(gatherTimer)
            callReady('relay in PC buffer')
          }
        })
      }
      const nativeSetRemote = pc.setRemoteDescription.bind(pc)
      pc.setRemoteDescription = async (desc) => {
        if (
          desc.type === 'answer' &&
          pc.signalingState === 'stable' &&
          pc.remoteDescription?.type === 'answer'
        ) {
          appLog('warn', '[call] skip duplicate remote answer (already stable)')
          return
        }
        let toSet = desc
        if ((desc.type === 'offer' || desc.type === 'answer') && desc.sdp) {
          const patched = patchAndLogRemoteSdp(desc.sdp, desc.type)
          if (patched !== desc.sdp) {
            toSet = { ...desc, sdp: patched }
          }
        }
        return nativeSetRemote(toSet)
      }
      bindRemoteAudio(pc)
      if (isOriginateOutbound) watchOriginateIce(pc)
      pc.addEventListener('iceconnectionstatechange', () => {
        appLog('info', '[call] iceConnectionState', pc.iceConnectionState)
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          if (attachRemoteFromPc(pc, 'ice-connected')) stopEarlyMediaPoll()
        }
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          void logIcePairStats(pc, `ICE ${pc.iceConnectionState}`)
        }
      })
      pc.addEventListener('connectionstatechange', () => {
        appLog('info', '[call] connectionState', pc.connectionState)
        if (pc.connectionState === 'connected') {
          if (attachRemoteFromPc(pc, 'pc-connected')) stopEarlyMediaPoll()
        }
      })
      pc.addEventListener('icecandidateerror', (ev: Event) => {
        const e2 = ev as RTCPeerConnectionIceErrorEvent
        appLog('warn', '[call] icecandidateerror', {
          url: e2.url,
          code: e2.errorCode,
          text: e2.errorText,
        })
      })
      if (originator === 'local') {
        pc.addEventListener('signalingstatechange', () => {
          if (pc.signalingState !== 'stable') return
          sdpStableCount++
          softphoneAudio.applyReceiverJitterBufferHints(pc)
          if (sdpStableCount > 1) {
            appLog('info', '[call] signaling stable after re-INVITE', { count: sdpStableCount })
            attachRemoteFromPc(pc, 'signaling-reneg')
          }
        })
      }
    })

    s.on('getusermediafailed', (err: unknown) => {
      appLog('error', '[call] getUserMedia failed', err)
      lastError.value = 'Microphone access denied or unavailable'
    })

    s.on('sending', (ev: { request?: { body?: string; method?: string } }) => {
      const pc = s.connection
      const buffer = pc ? getCallIceBuffer(pc) : null
      const merged = buildLocalOfferSdpForSignaling(pc, buffer)
      const body = ev.request?.body ?? ''
      if (ev.request && merged && countCandidates(merged) > countCandidates(body)) {
        ev.request.body = merged
      }
      appLog('info', '[call] sending SIP', {
        method: ev.request?.method,
        candidates: countCandidates(ev.request?.body ?? merged),
      })
    })

    s.on('connecting', () => {
      appLog('info', '[call] connecting')
      if (direction.value === 'outbound') callStatus.value = 'connecting'
    })

    s.on('progress', () => {
      appLog('info', '[call] progress (ringing)')
      if (direction.value === 'outbound') {
        callStatus.value = 'ringing'
        startEarlyMediaPoll()
        if (maybeSkipLocalRingback('progress')) return
        cancelDeferredRingback(ringbackDeferTimer)
        ringbackDeferTimer.value = window.setTimeout(() => {
          ringbackDeferTimer.value = null
          if (callStatus.value !== 'ringing' || direction.value !== 'outbound') return
          if (maybeSkipLocalRingback('progress-deferred')) return
          softphoneAudio.startRingback()
          appLog('info', '[call] local ringback started')
        }, 400)
      }
    })

    s.on('accepted', () => {
      cancelDeferredRingback(ringbackDeferTimer)
      stopEarlyMediaPoll()
      softphoneAudio.stopRemoteAudioProbe()
      appLog('info', '[call] accepted')
      softphoneAudio.stopAllLocalTones()
      softphoneAudio.stopRingback()
      softphoneAudio.stopRingtone()
      callStatus.value = 'active'
      if (!startedAt.value) startedAt.value = Date.now()
      const pc = s.connection
      if (pc) {
        attachRemoteFromPc(pc, 'accepted')
        const recv = pc.getReceivers?.().filter((r) => r.track?.kind === 'audio').length ?? 0
        const send = pc.getSenders?.().filter((r) => r.track?.kind === 'audio').length ?? 0
        appLog('info', '[call] media tracks', { ...iceSnapshot(pc), audioReceivers: recv, audioSenders: send })
        scheduleIceDiagnostics(pc, s)
        if (isOriginateOutbound) scheduleOriginateMediaRecovery(s, 'accepted')
      }
    })

    s.on('confirmed', () => {
      appLog('info', '[call] confirmed')
      softphoneAudio.stopAllLocalTones()
      callStatus.value = 'active'
      if (!startedAt.value) startedAt.value = Date.now()
      softphoneAudio.stopRingback()
      const pc = s.connection
      if (pc && !softphoneAudio.isRemoteAttached()) {
        attachRemoteFromPc(pc, 'confirmed')
      } else if (pc) {
        softphoneAudio.applyReceiverJitterBufferHints(pc)
      }
    })

    s.on('hold', () => {
      onHold.value = true
      if (callStatus.value === 'active') callStatus.value = 'held'
    })
    s.on('unhold', () => {
      onHold.value = false
      if (callStatus.value === 'held') callStatus.value = 'active'
    })

    s.on('muted', () => {
      muted.value = true
    })
    s.on('unmuted', () => {
      muted.value = false
    })

    s.on('failed', (e: EndEvent) => {
      if (gatherTimer) window.clearTimeout(gatherTimer)
      cancelDeferredRingback(ringbackDeferTimer)
      stopEarlyMediaPoll()
      const cause = e?.cause ?? 'Call failed'
      if (cause === 'Busy') lastError.value = 'Number is busy — callee rejected or unavailable'
      else if (cause === 'Rejected') lastError.value = 'Call declined by the other party'
      else if (cause === 'User Denied Media Access') lastError.value = 'Microphone access denied'
      else if (cause === 'Canceled') {
        if (!lastError.value) lastError.value = 'Call canceled'
      } else if (cause === 'Bad Media Description' || cause === 'WebRTC Error') {
        lastError.value = 'Media setup failed — check microphone, STUN/TURN (UDP), or try again'
      }       else lastError.value = cause
      appLog('error', '[call] failed', cause, e)
      queueKommoUpload(s)
      softphoneAudio.reset()
      resetCallState()
    })

    s.on('ended', () => {
      if (gatherTimer) window.clearTimeout(gatherTimer)
      cancelDeferredRingback(ringbackDeferTimer)
      stopEarlyMediaPoll()
      softphoneAudio.stopRemoteAudioProbe()
      appLog('info', '[call] ended')
      queueKommoUpload(s)
      softphoneAudio.reset()
      resetCallState()
    })
  }

  function handleNewSession(s: RTCSession, originator: 'local' | 'remote' | 'system') {
    const pendingOriginate = getOriginatePending()

    if (originator === 'remote' && pendingOriginate && isOriginateCallback(s, pendingOriginate)) {
      session = s
      lastError.value = null
      if (!callPlacedAt.value) callPlacedAt.value = Date.now()
      direction.value = 'outbound'
      remoteNumber.value = pendingOriginate.destination
      outboundCallerId.value = pendingOriginate.callerId
      callStatus.value = 'connecting'
      acceptOriginateSession(s.id ?? '')
      wireSession(s, originator)
      appLog('info', '[call] originate callback INVITE — auto-answer', {
        destination: pendingOriginate.destination,
        callerId: pendingOriginate.callerId,
      })
      void lookupRemoteContact(pendingOriginate.destination)
      answerOriginateCallback(s)
      return
    }

    if (originator === 'remote') {
      const allowedCallerIds = useCallerIdsStore().items.map((item) => item.number)
      if (isForeignOriginateCallback(s, allowedCallerIds)) {
        const caller = s.remote_identity?.uri?.user ?? ''
        appLog('info', '[call] silently rejecting foreign originate callback', {
          caller,
          originateHeader: getOriginateHeader(s),
        })
        try {
          s.terminate({ status_code: 486, reason_phrase: 'Busy Here' })
        } catch {
          /* session may already be gone */
        }
        return
      }
    }

    session = s
    lastError.value = null
    callPlacedAt.value = Date.now()
    wireSession(s, originator)
    appLog('info', '[call] handleNewSession', originator)

    if (originator === 'remote') {
      direction.value = 'inbound'
      callStatus.value = 'ringing'
      try {
        remoteNumber.value = s.remote_identity?.uri?.user ?? 'Unknown'
      } catch {
        remoteNumber.value = 'Unknown'
      }
      void lookupRemoteContact(remoteNumber.value)
      softphoneAudio.startRingtone()
    } else {
      direction.value = 'outbound'
      if (callStatus.value === 'idle') callStatus.value = 'connecting'
    }
  }

  async function ensureMicForCall(): Promise<boolean> {
    if (!window.isSecureContext) {
      lastError.value = 'Microphone requires HTTPS.'
      appLog('error', '[call] insecure context — getUserMedia blocked', location.href)
      return false
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      lastError.value = 'Microphone API is not available in this browser'
      return false
    }
    try {
      callMicStream?.getTracks().forEach((t) => t.stop())
      callMicStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      audioContextUnlocked.value = true
      softphoneAudio.unlocked = true
      appLog('info', '[call] microphone access OK')
      callMicStream.getTracks().forEach((t) => t.stop())
      callMicStream = null
      return true
    } catch (err) {
      lastError.value = 'Allow microphone access in the browser to place calls'
      appLog('error', '[call] microphone permission denied', err)
      return false
    }
  }

  /** Auto-answer PBX originate callback — must be synchronous (no await before s.answer). */
  function answerOriginateCallback(s: RTCSession): void {
    const gen = answerAbortGen
    const webrtc = useWebRtcStore()
    const prefs = usePreferencesStore()
    const pcConfig = buildPcConfig(webrtc.config)
    softphoneAudio.stopRingtone()
    softphoneAudio.stopRingback()

    if (gen !== answerAbortGen || session !== s || callStatus.value === 'idle') {
      appLog('info', '[call] originate answer skipped — call ended or superseded')
      return
    }

    try {
      // Do not await unlockAudio/getUserMedia here — Chrome requires a user gesture and
      // the dial click is already spent on ensureMicForCall(); blocking here waits until hangup.
      s.answer({
        mediaConstraints: softphoneAudio.getAudioConstraints(prefs.microphoneId),
        pcConfig,
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      })
      appLog('info', '[call] originate callback answered')
    } catch (err) {
      if (gen !== answerAbortGen || session !== s) return
      appLog('error', '[call] originate answer failed', err)
      lastError.value = 'Could not answer PBX callback — allow microphone and try again'
      try {
        s.terminate()
      } catch {
        /* ignore */
      }
      resetCallState()
    }
  }

  function shouldUseOriginate(): boolean {
    const cids = useCallerIdsStore()
    const selected = cids.selectedCallerId.trim()
    if (!selected || !cids.items.length) return false
    return cids.items.some((item) => item.number === selected)
  }

  async function makeCallViaOriginate(clean: string, callerId: string): Promise<void> {
    const webrtc = useWebRtcStore()
    direction.value = 'outbound'
    remoteNumber.value = clean
    outboundCallerId.value = callerId
    callStatus.value = 'connecting'
    callPlacedAt.value = Date.now()
    void lookupRemoteContact(clean)

    // Acquire mic during the dial-button user gesture (required before async originate POST).
    const micOk = await ensureMicForCall()
    if (!micOk) {
      resetCallState()
      return
    }
    void unlockAudio()

    const ext = (webrtc.config?.extension ?? '').trim()
    const ringExtension = ext.toUpperCase().endsWith('-WS') ? ext : ext ? `${ext}-WS` : ''

    beginOriginatePending(clean, callerId, () => {
      if (callStatus.value === 'connecting' && direction.value === 'outbound' && !session) {
        lastError.value =
          'PBX did not callback within 20s — check gateway originate or WebRTC registration'
        appLog('error', '[call] originate callback timeout', { destination: clean, callerId })
        resetCallState()
      }
    })

    try {
      appLog('info', '[call] originate request', {
        destination: clean,
        callerId,
        ringExtension: ringExtension || undefined,
      })
      const body: Record<string, string> = { destination: clean, callerid: callerId }
      if (ringExtension) body.ring_extension = ringExtension
      const res = await api.post<{ success?: boolean; originate_id?: string; detail?: string }>(
        'originate',
        body,
      )
      if (!res?.success) {
        throw new Error(typeof res?.detail === 'string' ? res.detail : 'Originate failed')
      }
      setOriginateId(res.originate_id)
      appLog('info', '[call] originate accepted', { originateId: res.originate_id })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Originate failed'
      lastError.value = msg
      appLog('error', '[call] originate failed', msg)
      resetCallState()
    }
  }

  async function makeCall(target: string): Promise<void> {
    const ua = getActiveUA()
    const webrtc = useWebRtcStore()
    const prefs = usePreferencesStore()
    if (!ua) {
      lastError.value = 'SIP UA is not registered'
      return
    }
    if (callStatus.value !== 'idle') {
      lastError.value = 'Another call is already in progress'
      return
    }
    lastError.value = null

    const cfg = webrtc.config
    const sipHost = cfg?.sipHost ?? ''
    const clean = target.trim()
    if (shouldUseOriginate()) {
      const cids = useCallerIdsStore()
      const callerId = cids.selectedCallerId.trim()
      lastError.value = null
      if (isOriginatePending()) {
        lastError.value = 'Another originate call is already in progress'
        return
      }
      await makeCallViaOriginate(clean, callerId)
      return
    }

    const dialUser = dialUserForMikoWebRtc(clean, cfg?.extension)
    const targetUri = clean.includes('@')
      ? clean.startsWith('sip:')
        ? clean
        : `sip:${clean}`
      : `sip:${dialUser}@${sipHost}`

    const pcConfig = buildPcConfig(cfg ?? null)

    direction.value = 'outbound'
    remoteNumber.value = clean
    callStatus.value = 'connecting'
    void lookupRemoteContact(clean)
    appLog('info', '[call] makeCall started →', targetUri)

    const micOk = await ensureMicForCall()
    if (!micOk) {
      resetCallState()
      return
    }

    void unlockAudio()
    await new Promise((r) => setTimeout(r, 100))

    const mediaConstraints = softphoneAudio.getAudioConstraints(prefs.microphoneId)

    try {
      ua.call(targetUri, {
        eventHandlers: {
          peerconnection: (e: PeerConnectionEvent) => {
            prepareOutboundCallPc(e.peerconnection, { timeoutMs: 8000, minWaitMs: 3000 })
          },
        },
        mediaConstraints,
        pcConfig,
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      })
      appLog('info', '[call] ua.call invoked')
    } catch (e) {
      appLog('error', '[call] ua.call failed', e)
      lastError.value = e instanceof Error ? e.message : 'Failed to place the call'
      softphoneAudio.reset()
      resetCallState()
    }
  }

  /**
   * Answer inbound INVITE. Must not await before session.answer() — Chrome needs the
   * user-gesture chain, and hangup during slow getUserMedia used to null out session
   * (see answer getUserMedia failed: Cannot read properties of null).
   */
  function answer(): void {
    appLog('info', '[call] answer requested', {
      hasSession: !!session,
      direction: direction.value,
      status: callStatus.value,
    })
    const s = session
    if (!s) {
      lastError.value = 'Call session is no longer available'
      appLog('error', '[call] answer failed — no session')
      return
    }
    if (direction.value !== 'inbound') {
      appLog('warn', '[call] answer ignored — not inbound')
      return
    }
    if (callStatus.value !== 'ringing') {
      appLog('warn', '[call] answer ignored — status', callStatus.value)
      return
    }

    const gen = answerAbortGen
    const webrtc = useWebRtcStore()
    const prefs = usePreferencesStore()
    const pcConfig = buildPcConfig(webrtc.config)
    const mediaConstraints = softphoneAudio.getAudioConstraints(prefs.microphoneId)

    callStatus.value = 'connecting'
    softphoneAudio.stopAllLocalTones()
    softphoneAudio.clearRemoteStream()
    void unlockAudio()

    if (gen !== answerAbortGen || session !== s) {
      appLog('info', '[call] answer aborted — call ended before answer')
      return
    }

    try {
      s.answer({
        mediaConstraints,
        pcConfig,
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      })
      appLog('info', '[call] session.answer invoked')
    } catch (err) {
      if (gen !== answerAbortGen || session !== s) return
      appLog('error', '[call] answer failed', err)
      lastError.value = 'Microphone access denied or unavailable'
      if (callStatus.value === 'connecting') callStatus.value = 'ringing'
    }
  }

  function hangup(): void {
    if (!session) {
      if (callStatus.value !== 'idle') {
        softphoneAudio.reset()
        resetCallState()
      }
      return
    }
    appLog('info', '[call] hangup')
    try {
      if (direction.value === 'inbound' && callStatus.value === 'ringing') {
        session.terminate({ status_code: 486, reason_phrase: 'Busy Here' })
      } else {
        session.terminate()
      }
    } catch {
      /* session may already be gone */
    } finally {
      softphoneAudio.reset()
      resetCallState()
    }
  }

  function toggleMute(): void {
    if (!session) return
    if (muted.value) {
      session.unmute({ audio: true })
      muted.value = false
    } else {
      session.mute({ audio: true })
      muted.value = true
    }
  }

  function toggleHold(): void {
    if (!session) return
    if (onHold.value) session.unhold()
    else session.hold()
  }

  function sendDtmf(tone: string): void {
    if (!session) return
    try {
      session.sendDTMF(tone)
    } catch {
      /* ignore */
    }
  }

  return {
    callStatus,
    direction,
    remoteNumber,
    remoteDisplayName,
    resolvedLeadId,
    muted,
    onHold,
    startedAt,
    audioContextUnlocked,
    lastError,
    outboundCallerId,
    inCall,
    isActive,
    unlockAudio,
    syncAudioUnlockState,
    handleNewSession,
    makeCall,
    answer,
    hangup,
    toggleMute,
    toggleHold,
    sendDtmf,
    lookupRemoteContact,
  }
})

interface RTCIceCandidatePairStats extends RTCStats {
  state?: string
  localCandidateId?: string
  remoteCandidateId?: string
}

interface RTCIceCandidateStats extends RTCStats {
  candidateType?: string
}
