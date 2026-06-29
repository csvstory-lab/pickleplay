/**
 * Vercel Edge Middleware — 카카오 스크랩 봇 등 JS 미실행 클라이언트용
 * site_meta.json(general_config 배포본)으로 HTML <head> 메타를 주입합니다.
 */
import {
  injectSiteMetaIntoHtml,
  fetchPublishedSiteMeta,
  buildWebManifest,
} from './scripts/site-meta-lib.mjs';

const META_CACHE_MS = 60 * 1000;
let metaCache = { data: null, at: 0 };

async function getSiteMeta() {
  const now = Date.now();
  if (metaCache.data && now - metaCache.at < META_CACHE_MS) {
    return metaCache.data;
  }
  const published = await fetchPublishedSiteMeta(fetch);
  if (published) {
    metaCache = { data: published, at: now };
    return published;
  }
  return null;
}

function resolveHtmlPath(pathname) {
  if (pathname === '/' || pathname === '') return '/index.html';
  if (pathname.endsWith('/')) return pathname + 'index.html';
  if (pathname.endsWith('.html')) return pathname;
  return null;
}

export default async function middleware(request) {
  const url = new URL(request.url);

  if (url.pathname === '/manifest.json') {
    const meta = await getSiteMeta();
    if (meta) {
      const body = JSON.stringify(buildWebManifest(meta), null, 2);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/manifest+json; charset=utf-8',
          'cache-control': 'public, max-age=60, must-revalidate',
        },
      });
    }
    return;
  }

  const htmlPath = resolveHtmlPath(url.pathname);
  if (!htmlPath) return;

  const staticUrl = new URL(htmlPath, url.origin);
  const htmlRes = await fetch(staticUrl.toString(), {
    headers: {
      'x-middleware-subrequest': '1',
    },
  });

  if (!htmlRes.ok) return;

  const contentType = htmlRes.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return;

  const html = await htmlRes.text();
  if (html.indexOf('P!CKLE-SITE-META:START') === -1) return;

  const meta = await getSiteMeta();
  if (!meta) return;

  const canonicalUrl = url.origin + (url.pathname === '/' ? '/' : url.pathname);
  const patched = injectSiteMetaIntoHtml(html, meta, canonicalUrl);

  return new Response(patched, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}

export const config = {
  matcher: ['/', '/index.html', '/user_app/:path*.html', '/manifest.json'],
};
