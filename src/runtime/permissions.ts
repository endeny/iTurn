import type { DomainPermission } from '@source/sdk'

export function hostMatches(host: string, pattern: string): boolean {
  const normalizedHost = host.toLowerCase()
  const normalizedPattern = pattern.toLowerCase()

  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(1)
    return normalizedHost.endsWith(suffix) && normalizedHost.length > suffix.length
  }

  return normalizedHost === normalizedPattern
}

export function isAllowedByDomainPermission(url: string, permission?: DomainPermission): boolean {
  if (!permission || permission.domains.length === 0) return false
  const host = new URL(url).hostname
  return permission.domains.some((domain) => hostMatches(host, domain))
}
