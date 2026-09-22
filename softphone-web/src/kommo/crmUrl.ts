/** Gateway session returns API base (…/api/v4); browser cards use web UI base. */
export function kommoWebBaseUrl(baseUrl: string | null | undefined): string | null {
  if (!baseUrl?.trim()) return null
  let base = baseUrl.trim().replace(/\/$/, '')
  base = base.replace(/\/api\/v4$/i, '')
  if (!base) return null
  if (base.startsWith('http://') || base.startsWith('https://')) return base
  return `https://${base}`
}

/** Build Kommo/AmoCRM detail URL for a lead or contact card. */
export function kommoDetailUrl(
  baseUrl: string | null | undefined,
  entity: 'lead' | 'contact',
  id: number,
): string | null {
  const base = kommoWebBaseUrl(baseUrl)
  if (!base || !id) return null
  const segment = entity === 'lead' ? 'leads' : 'contacts'
  return `${base}/${segment}/detail/${id}`
}
