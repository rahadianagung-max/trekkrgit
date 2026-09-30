// liga.trekkr.online → halaman Liga Trekkr. Hanya berjalan di path "/" (matcher),
// karena rewrite di vercel.json kalah oleh index.html untuk root.
export const config = { matcher: '/' };

const LIGA_HOSTS = new Set(['liga.trekkr.online']);

export default function middleware(request) {
  const url = new URL(request.url);
  if (LIGA_HOSTS.has(url.hostname)) {
    return new Response(null, { headers: { 'x-middleware-rewrite': new URL('/liga-trekkr-v2.html', url).toString() } });
  }
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
