// JsSIP ships its own typings, but UAConfiguration omits the WebRTC peer-connection
// options we rely on (`pcConfig` / legacy `ice_servers`) and the JsSIP logger config.
// Augment the published interface instead of redeclaring the whole module.
import 'jssip'

declare module 'jssip/lib/UA' {
  interface UAConfiguration {
    /** RTCPeerConnection config passed through to every session (ICE servers, transport policy). */
    pcConfig?: RTCConfiguration
    /** Legacy alias kept for back-compat with older JsSIP builds. */
    ice_servers?: RTCIceServer[]
    /** JsSIP logger configuration (level + custom logger). */
    log?: {
      level?: 'debug' | 'log' | 'warn' | 'error'
      logger?: {
        debug?: (...args: unknown[]) => void
        log?: (...args: unknown[]) => void
        warn?: (...args: unknown[]) => void
        error?: (...args: unknown[]) => void
      }
    }
  }
}
