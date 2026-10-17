/**
 * versionProbe — resolves the MeterSphere server version for the upload payload.
 *
 * metersphere.serverVersion: 'auto' probes GET /system/version/current
 * (200 = v3, 404 = v2 — v2 has no /system/version endpoint); 'v2'/'v3' force
 * the value. Probe results are cached in-memory for the session; failures fall
 * back to the cached value or 'v2' with a warning and NEVER block the upload.
 * v3 remains experimental/untested: the probe only selects the payload shape.
 */
import { SettingsManager } from './settingsManager'

export type ServerVersion = 'v2' | 'v3'

export interface ProbeResult {
  version: ServerVersion
  /** True when the value came from the session cache, not a fresh probe. */
  cached: boolean
  warning?: string
}

export async function resolveServerVersion(
  msUrl: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch
): Promise<ProbeResult> {
  const configured = SettingsManager.getServerVersion()
  if (configured === 'v2' || configured === 'v3') {
    return { version: configured, cached: false }
  }
  const cached = SettingsManager.getCachedServerVersion()
  try {
    const resp = await fetchImpl(`${msUrl}/system/version/current`, { method: 'GET', headers })
    if (resp.ok) {
      SettingsManager.setCachedServerVersion('v3')
      return { version: 'v3', cached: false }
    }
    if (resp.status === 404) {
      SettingsManager.setCachedServerVersion('v2')
      return { version: 'v2', cached: false }
    }
    const fallback = cached ?? 'v2'
    return {
      version: fallback,
      cached: cached !== undefined,
      warning: `Version probe returned HTTP ${resp.status}; using ${fallback}`,
    }
  } catch (error) {
    const fallback = cached ?? 'v2'
    return {
      version: fallback,
      cached: cached !== undefined,
      warning: `Version probe failed (${error instanceof Error ? error.message : String(error)}); using ${fallback}`,
    }
  }
}
