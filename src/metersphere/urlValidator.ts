import { URL } from 'url'
import * as net from 'net'
import * as dns from 'dns'

function isIPv4Blocked(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) {
    return false
  }
  // 10.0.0.0/8
  if (parts[0] === 10) {
    return true
  }
  // 127.0.0.0/8 loopback
  if (parts[0] === 127) {
    return true
  }
  // 169.254.0.0/16 link-local (includes cloud metadata 169.254.169.254)
  if (parts[0] === 169 && parts[1] === 254) {
    return true
  }
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true
  }
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) {
    return true
  }
  return false
}

function isIPv6Blocked(ip: string): boolean {
  const lower = ip.toLowerCase()
  // ::1 loopback
  if (lower === '::1') {
    return true
  }
  // fc00::/7 unique local addresses
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true
  }
  // fe80::/10 link-local
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true
  }
  return false
}

export function validateMsUrl(
  url: string,
  options?: { allowlist?: string[] }
): { valid: boolean; error?: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { valid: false, error: 'Invalid URL' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http/https schemes are allowed' }
  }

  const hostname = parsed.hostname.toLowerCase()
  const allowlist = options?.allowlist || []

  if (allowlist.some((allowed) => allowed.toLowerCase() === hostname)) {
    return { valid: true }
  }

  if (hostname === '169.254.169.254') {
    return { valid: false, error: 'Cloud metadata endpoint is blocked' }
  }

  const ipVersion = net.isIP(hostname)
  if (ipVersion === 4) {
    if (isIPv4Blocked(hostname)) {
      return { valid: false, error: 'Private/link-local/loopback IP is blocked' }
    }
    return { valid: true }
  }

  if (ipVersion === 6) {
    if (isIPv6Blocked(hostname)) {
      return { valid: false, error: 'Private/link-local/loopback IPv6 is blocked' }
    }
    return { valid: true }
  }

  // For hostnames (non-IP literals), try to resolve if possible (pragmatic)
  try {
    const dnsAny = dns as any
    if (typeof dnsAny.lookupSync === 'function') {
      const res = dnsAny.lookupSync(hostname)
      const ip = typeof res === 'string' ? res : res?.address
      if (typeof ip === 'string') {
        const resolvedIpVersion = net.isIP(ip)
        if (resolvedIpVersion === 4 && isIPv4Blocked(ip)) {
          return { valid: false, error: 'Hostname resolves to blocked IP range' }
        }
        if (resolvedIpVersion === 6 && isIPv6Blocked(ip)) {
          return { valid: false, error: 'Hostname resolves to blocked IPv6 range' }
        }
      }
    }
  } catch {
    // Ignore resolution errors and fall through to allow
  }

  // Public hostname/IP that is not in a blocked range - allow
  return { valid: true }
}
