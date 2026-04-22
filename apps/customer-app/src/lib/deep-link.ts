export function parseResetPasswordUrl(url: string): string | null {
  try {
    const u = new URL(url.replace('redeemo://', 'https://placeholder/'))
    const onPath = u.pathname.includes('reset-password')
    const token = u.searchParams.get('token')
    return onPath && token ? token : null
  } catch { return null }
}
