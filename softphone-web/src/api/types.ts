export type Me = {
  email: string
  extension: string
  must_change_password: boolean
  /** True when signed in via "shared computer" — session cookie expires with browser. */
  public_computer?: boolean
}

export type IceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

export type WebRtcConfig = {
  wsUrl: string
  sipHost: string
  extension: string
  iceServers: IceServer[]
  sipPassword?: string
  sipAuthUser?: string
  sipContactUserPart?: string
}

export type CallerIdItem = {
  number: string
  name: string
}

export type CallerIdsResponse = {
  extension: string
  callerids: string[]
  callerid_items: CallerIdItem[]
}

/** Mirrors the dict returned by cdr_client.py query_cdr / query_cdr_rest. */
export type CdrRecord = {
  /** Source extension / number (caller). */
  src_num: string
  /** Destination extension / number (callee). */
  dst_num: string
  /** Resolved outbound CallerID (may differ from src_num via trunk config). */
  caller_id: string
  /** Call start time: "YYYY-MM-DD HH:MM:SS" in PBX-local timezone. */
  start: string
  /** Answer time (empty when unanswered). */
  answer: string
  /** Total call duration in seconds (ring + talk). */
  duration: number
  /** Billed / talk-time seconds (0 when unanswered). */
  billsec: number
  /** "ANSWERED" | "NO ANSWER" | "BUSY" | "FAILED" */
  disposition: string
  /** Path to the recording file on the PBX host, or empty string. */
  recording: string
  /** MikoPBX linkedid — used to fetch the recording proxy. */
  linkedid: string
  /** Trunk provider uniqid (empty for internal calls). */
  trunk: string
  /** SIP Call-ID for the source leg. */
  src_call_id: string
}

export type CdrResponse = {
  result: boolean
  data: CdrRecord[]
}

export type UserPreferences = {
  micId?: string
  speakerId?: string
  ringtoneDeviceId?: string
  aec?: boolean
  ns?: boolean
  agc?: boolean
  ringtoneEnabled?: boolean
}

export type PreferencesResponse = {
  preferences: UserPreferences
}

/** Matches kommo_service.get_client_status_async() / get_client_status(). */
export type KommoStatus = {
  /** Gateway has Kommo integration enabled in config. */
  enabled: boolean
  /** OAuth token exists and is not expired (after async validation). */
  available: boolean
  /** OAuth access token is stored (may be expired). */
  authorized: boolean
  /** Token is structurally present but expired. */
  token_expired?: boolean
  /** Real-time token probe passed. */
  token_valid?: boolean
  /** Token is expired and needs re-authorization by admin. */
  needs_reauthorize?: boolean
  /** This SIP extension is in the admin-configured exclusion list. */
  excluded?: boolean
  /** `true` when integration is enabled AND this extension is not excluded. */
  offer_gateway?: boolean
  /** Kommo user id mapped to this extension in admin (if any). */
  kommo_user_id?: number | null
  /** Display name of mapped Kommo user. */
  kommo_user_name?: string
  /** `true` when gateway Kommo is allowed AND a Kommo user is mapped. */
  upload_enabled?: boolean
  /** Gateway subdomain (e.g. "mycompany"). */
  subdomain?: string
  /** Resolved account base URL (after session call). */
  account_base_url?: string
  /** Error message when available === false due to a recoverable fault. */
  error?: string
}

export type KommoSession = {
  access_token: string
  account_base_url: string
  kommo_user_id?: number
  kommo_user_name?: string
}

export type KommoContactLookup = {
  name: string | null
  contact_id: number | null
  lead_id: number | null
}

export type KommoProcessCallRequest = {
  phone: string
  call_time: string
  session_id?: string
  is_incoming: boolean
  duration_seconds: number
  was_answered: boolean
  lead_id?: number
  client_recording_enabled: boolean
  connection_slot?: string
  call_from_label?: string
  call_log?: string
  enable_recording_upload?: boolean
  answer_time?: string
  /** ISO timestamp when the call ended (browser clock). Helps CDR/recording match. */
  call_end_time?: string
}

export type KommoProcessCallJob = {
  id: string
  status: string
  lead_id?: number | null
  contact_id?: number | null
  crm_entity?: 'lead' | 'contact' | null
  upload_source?: string | null
  reason?: string | null
  created_at?: string
  updated_at?: string
}

export type KommoCallAttachment = {
  job_id?: string
  phone?: string
  call_time?: string
  session_id?: string | null
  status?: string
  lead_id?: number | null
  contact_id?: number | null
  crm_entity?: 'lead' | 'contact' | null
}

export type KommoCallAttachmentsResponse = {
  items: KommoCallAttachment[]
}
