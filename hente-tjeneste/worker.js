// Hverdag – hente-tjeneste (Cloudflare Worker)
// Henter KUN kalenderen fra itslearning og giver den videre til Hverdag-appen.
// Alle andre adresser og alle andre hjemmesider bliver afvist.

const ALLOWED_HOSTS = ['via.itslearning.com'];
const ALLOWED_ORIGIN = 'https://nicholasrnilsson.github.io';

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Kun GET', { status: 405, headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('Hente-tjenesten kører. Mangler ?url=', { status: 400, headers: cors });

    let u;
    try { u = new URL(target.replace(/^webcal:\/\//i, 'https://')); }
    catch { return new Response('Ugyldigt link', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) {
      return new Response('Dette link er ikke tilladt', { status: 403, headers: cors });
    }

    const res = await fetch(u.toString(), { headers: { 'User-Agent': 'Mozilla/5.0 (Hverdag-app)' } });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
};
