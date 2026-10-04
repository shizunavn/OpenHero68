export function serviceOrigins(port: number, allowedOrigins = process.env.HERO68_ALLOWED_ORIGINS ?? '') {
  const origins = new Set([
    'https://open-hero68.pages.dev',
    'http://localhost:5173', 'https://localhost:5173',
    'http://127.0.0.1:5173', 'https://127.0.0.1:5173',
    `http://127.0.0.1:${port}`, `http://localhost:${port}`,
  ])
  for (const entry of allowedOrigins.split(',').map(origin => origin.trim()).filter(Boolean)) {
    const url = new URL(entry)
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname.includes('*') || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      throw new Error('HERO68_ALLOWED_ORIGINS must contain exact HTTP(S) origins without credentials, paths or wildcards.')
    }
    origins.add(url.origin)
  }
  return origins
}

export function isAllowedServiceRequest(host: string | undefined, origin: string | undefined, origins: ReadonlySet<string>, port: number) {
  return (host === `127.0.0.1:${port}` || host === `localhost:${port}`) && (!origin || origins.has(origin))
}
