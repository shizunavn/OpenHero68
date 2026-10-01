export function serviceOrigins(port: number) {
  return new Set([
    'https://open-hero68.pages.dev',
    'https://shizuna.ddns.net:5173',
    'http://localhost:5173', 'https://localhost:5173',
    'http://127.0.0.1:5173', 'https://127.0.0.1:5173',
    `http://127.0.0.1:${port}`, `http://localhost:${port}`,
  ])
}

export function isAllowedServiceRequest(host: string | undefined, origin: string | undefined, origins: ReadonlySet<string>, port: number) {
  return (host === `127.0.0.1:${port}` || host === `localhost:${port}`) && (!origin || origins.has(origin))
}
