export async function onRequest({ request }) {
  const country = typeof request.cf?.country === 'string'
    ? request.cf.country.toUpperCase()
    : null
  const isVietnam = country === 'VN'

  return new Response(JSON.stringify({
    region: isVietnam ? 'VN' : 'OTHER',
    country,
    suggestedLanguage: isVietnam ? 'vi' : 'en',
  }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
    },
  })
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname
    if (pathname === '/api/region' || pathname === '/api/region/') {
      return onRequest({ request })
    }
    return env.ASSETS.fetch(request)
  },
}
