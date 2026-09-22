import { defineStore } from 'pinia'

import { computed, ref } from 'vue'

import JsSIP from 'jssip'

import type { UA } from 'jssip/lib/UA'

import type { RTCSessionEvent } from 'jssip/lib/UA'

import { api } from '@/api/client'

import type { WebRtcConfig } from '@/api/types'

import { useCallsStore } from '@/stores/calls'

import { primeIceGathering } from '@/audio/iceWarmup'

import { appLog } from '@/logging/logCapture'



export type RegistrationState =

  | 'idle'

  | 'loading'

  | 'connecting'

  | 'registered'

  | 'unregistered'

  | 'failed'



const DEFAULT_STUN: RTCIceServer[] = [

  { urls: 'stun:stun.l.google.com:19302' },

  { urls: 'stun:stun1.l.google.com:19302' },

]



// Kept out of Pinia state on purpose: JsSIP's UA must not be wrapped in a

// reactive proxy. The store exposes only serializable status.

let ua: UA | null = null



/** Accessor used by the calls store to place/answer calls on the active UA. */

export function getActiveUA(): UA | null {

  return ua

}



function isTurnServer(server: RTCIceServer): boolean {

  const urls = server.urls

  const joined = Array.isArray(urls) ? urls.join(' ') : String(urls ?? '')

  return /turn/i.test(joined)

}



/** Gateway merges STUN + env TURN; fall back to Google STUN (same as desktop / Miko). */

export function buildIceServers(config: WebRtcConfig | null): RTCIceServer[] {

  if (config && Array.isArray(config.iceServers) && config.iceServers.length > 0) {

    return config.iceServers as RTCIceServer[]

  }

  return [...DEFAULT_STUN]

}



function hostFromIceUrl(url: string): string {

  const m = url.match(/^turns?:\[?([^\]/?]+?)\]?(?::\d+)?(?:\?.*)?$/i)

  return (m?.[1] ?? '').trim().toLowerCase()

}



/**

 * coturn denies relaying to its own address, so relay-only never completes ICE

 * when the TURN server and the PBX share a host — keep TURN, but allow srflx too.

 */

export function turnSharesHostWithPbx(config: WebRtcConfig | null): boolean {

  const sipHost = (config?.sipHost ?? '').trim().toLowerCase()

  if (!sipHost) return false

  return buildIceServers(config)

    .filter(isTurnServer)

    .some((server) => {

      const urls = Array.isArray(server.urls) ? server.urls : [String(server.urls ?? '')]

      return urls.some((url) => hostFromIceUrl(url) === sipHost)

    })

}



/** pcConfig aligned with WebRtcClient/phone.js: relay-only when TURN is configured. */

export function buildPcConfig(config: WebRtcConfig | null): RTCConfiguration {

  const servers = buildIceServers(config)

  const turn = servers.filter(isTurnServer)

  const hairpin = turnSharesHostWithPbx(config)

  const iceServers = turn.length && !hairpin ? turn : servers



  const pcConfig: RTCConfiguration = { iceServers, iceCandidatePoolSize: turn.length ? 1 : 10 }

  if (turn.length > 0 && !hairpin) {

    pcConfig.iceTransportPolicy = 'relay'

  }

  return pcConfig

}



/** Miko WebRTC: AoR is `<ext>-WS`, digest username is usually the base extension. */

function buildSipRegistration(cfg: WebRtcConfig): {

  sipUri: string

  authUser: string

  aorUser: string

} {

  const ext = (cfg.extension || '').trim()

  const authUser = (cfg.sipAuthUser || ext).trim()

  const explicitAor = (cfg.sipContactUserPart || '').trim()

  let aorUser = explicitAor

  if (!aorUser) {

    if (ext.toUpperCase().endsWith('-WS')) {

      aorUser = ext

    } else if (ext) {

      aorUser = `${ext}-WS`

    } else {

      aorUser = authUser

    }

  }

  const sipUri = `sip:${aorUser}@${cfg.sipHost}`

  return { sipUri, authUser, aorUser }

}



export const useWebRtcStore = defineStore('webrtc', () => {

  const config = ref<WebRtcConfig | null>(null)

  const registrationState = ref<RegistrationState>('idle')

  const wsConnected = ref(false)

  const error = ref<string | null>(null)



  const canRegister = computed(() => !!config.value?.wsUrl && !!config.value?.sipPassword)

  const isRegistered = computed(() => registrationState.value === 'registered')



  async function loadConfig(): Promise<WebRtcConfig> {

    registrationState.value = 'loading'

    error.value = null

    appLog('info', '[webrtc] loading config…')

    try {

      const cfg = await api.get<WebRtcConfig>('webrtc/config')

      config.value = cfg

      appLog('info', '[webrtc] config loaded', {

        wsUrl: cfg.wsUrl,

        sipHost: cfg.sipHost,

        extension: cfg.extension,

        sipAuthUser: cfg.sipAuthUser,

        iceServers: cfg.iceServers?.length ?? 0,

        iceUrls: (cfg.iceServers as RTCIceServer[] | undefined)?.map((s) => s.urls),

        turnAuth: (cfg.iceServers as RTCIceServer[] | undefined)?.some((s) => isTurnServer(s) && !!(s as RTCIceServer).username),

        forceRelay: buildPcConfig(cfg).iceTransportPolicy === 'relay',

      })

      if (!cfg.wsUrl) {

        registrationState.value = 'failed'

        error.value = 'WebRTC is not configured on the gateway'

        appLog('error', '[webrtc] no wsUrl in config')

      } else {

        registrationState.value = 'idle'

      }

      return cfg

    } catch (e) {

      registrationState.value = 'failed'

      error.value = e instanceof Error ? e.message : 'Failed to load WebRTC config'

      config.value = null

      appLog('error', '[webrtc] config load failed', error.value)

      throw e

    }

  }



  function setRegistrationState(state: RegistrationState, message?: string) {

    registrationState.value = state

    error.value = message ?? null

  }



  /**

   * Create the JsSIP UA and register over WSS directly against MikoPBX.

   * Mirrors WebRtcClient/phone.js: the AoR/auth user is the WebRTC id

   * (`<ext>-WS`) resolved by the gateway, ICE comes from /api/webrtc/config.

   */

  async function startUA(): Promise<void> {

    if (ua) return

    const cfg = config.value ?? (await loadConfig())

    if (!cfg.wsUrl || !cfg.sipPassword) {

      setRegistrationState('failed', 'Missing WSS URL or SIP credentials')

      return

    }



    const authUser = (cfg.sipAuthUser || cfg.extension || '').trim()

    if (!authUser) {

      setRegistrationState('failed', 'No SIP extension to register')

      return

    }



    const { sipUri, authUser: digestUser, aorUser } = buildSipRegistration(cfg)

    const pcConfig = buildPcConfig(cfg)

    appLog('info', '[webrtc] starting UA', {

      sipUri,

      authUser: digestUser,

      aorUser,

      wsUrl: cfg.wsUrl,

    })



    try {

      const socket = new JsSIP.WebSocketInterface(cfg.wsUrl)

      ua = new JsSIP.UA({

        sockets: [socket],

        uri: sipUri,

        authorization_user: digestUser,

        password: cfg.sipPassword,

        register: true,

        register_expires: 300,

        session_timers: false,

        connection_recovery_min_interval: 2,

        connection_recovery_max_interval: 30,

        pcConfig,

      })



      ua.on('connecting', () => {

        appLog('info', '[webrtc] connecting…')

        setRegistrationState('connecting')

      })

      ua.on('connected', () => {

        appLog('info', '[webrtc] WebSocket connected')

        wsConnected.value = true

      })

      ua.on('disconnected', () => {

        appLog('warn', '[webrtc] WebSocket disconnected')

        wsConnected.value = false

      })

      ua.on('registered', () => {

        appLog('info', '[webrtc] SIP registered', aorUser, `(auth ${digestUser})`)

        setRegistrationState('registered')

        primeIceGathering(pcConfig)

      })

      ua.on('unregistered', () => {

        appLog('info', '[webrtc] SIP unregistered')

        if (registrationState.value !== 'failed') setRegistrationState('unregistered')

      })

      ua.on('registrationFailed', (e) => {

        const cause = (e?.cause as string | undefined) ?? 'Registration failed'

        appLog('error', '[webrtc] registration failed', cause, e)

        setRegistrationState('failed', cause)

        void api

          .get(`/api/sip-auth-failures?ext=${encodeURIComponent(digestUser)}`)

          .catch(() => undefined)

      })



      ua.on('newRTCSession', (e: RTCSessionEvent) => {

        appLog('info', '[webrtc] newRTCSession', e.originator, e.session?.direction)

        const calls = useCallsStore()

        calls.handleNewSession(e.session, e.originator)

      })



      setRegistrationState('connecting')

      ua.start()

      appLog('info', '[webrtc] UA started')

    } catch (e) {

      ua = null

      const msg = e instanceof Error ? e.message : 'Failed to start SIP UA'

      appLog('error', '[webrtc] UA start failed', msg)

      setRegistrationState('failed', msg)

    }

  }



  function stopUA(): void {

    if (ua) {

      appLog('info', '[webrtc] stopping UA')

      try {

        ua.stop()

      } catch {

        /* ignore */

      }

      ua = null

    }

    wsConnected.value = false

    registrationState.value = 'idle'

  }



  function clearCredentials(): void {

    stopUA()

    config.value = null

    error.value = null

  }



  return {

    config,

    registrationState,

    wsConnected,

    error,

    canRegister,

    isRegistered,

    loadConfig,

    setRegistrationState,

    startUA,

    stopUA,

    clearCredentials,

  }

})


