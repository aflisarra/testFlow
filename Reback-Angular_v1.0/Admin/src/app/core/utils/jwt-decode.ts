function base64UrlToUtf8(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')

  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function jwt_decode<T = unknown>(token: string): T {
  const parts = token.split('.')
  if (parts.length < 2) {
    throw new Error('Invalid JWT token')
  }

  const payload = parts[1]
  const decoded = base64UrlToUtf8(payload)
  return JSON.parse(decoded) as T
}

