/**
 * Vercel Edge Middleware — 카카오 스크랩 봇 등 JS 미실행 클라이언트용
 * site_meta.json(general_config 배포본)으로 HTML <head> 메타를 주입합니다.
 */
import {
  injectSiteMetaIntoHtml,
  fetchPublishedSiteMeta,
  buildWebManifest,
  SUPABASE_PROJECT_REF,
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

const SUPABASE_URL = 'https://' + SUPABASE_PROJECT_REF + '.supabase.co';
// 공개용 anon 키 (js/supabase-config.js 와 동일, 브라우저에 이미 공개된 값)
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzemd6bmFucHR1dHd4Y3NucmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDc1MjIsImV4cCI6MjA5NjA4MzUyMn0.Czo-Cmw7JQktWMV77KSt2Yk3Pnkx89ZE1Ey0C0dk1G4';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 불판 상세 링크(/user_app/detail.html?id=...)를 카톡·SNS에 붙여넣으면
 * 봇(JS 미실행)이 읽는 미리보기(제목·설명·이미지)를 "그 불판" 내용으로 만들어 준다.
 * 조회 실패/비공개/없는 불판이면 null → 기존 사이트 공통 메타를 그대로 사용.
 */
async function fetchPostShareMeta(postId) {
  try {
    const res = await fetch(
      SUPABASE_URL +
        '/rest/v1/posts?select=title,option_a,option_b&id=eq.' +
        encodeURIComponent(postId) +
        '&limit=1',
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        },
        signal: AbortSignal.timeout(2500),
      }
    );
    if (!res.ok) return { error: 'db-http-' + res.status };
    const rows = await res.json();
    const post = Array.isArray(rows) ? rows[0] : null;
    if (!post || !post.title) return { error: 'post-not-found' };

    const title = 'P!CKLE - ' + String(post.title).trim();
    const a = String(post.option_a || '').trim();
    const b = String(post.option_b || '').trim();
    const description = a || b ? a + ' vs ' + b + '. 지금 투표하세요!' : '지금 투표하세요!';
    return {
      meta: {
        meta_title: title,
        meta_description: description,
        og_image_url:
          SUPABASE_URL + '/functions/v1/generate-og?postId=' + encodeURIComponent(postId),
      },
    };
  } catch (e) {
    return { error: 'db-exception-' + String((e && e.name) || 'unknown') };
  }
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

  const siteMeta = await getSiteMeta();

  // 불판 상세 페이지: 해당 불판의 제목·선택지·이미지로 미리보기 메타를 덮어쓴다.
  let postMeta = null;
  let trace = 'site-meta';
  let canonicalUrl = url.origin + (url.pathname === '/' ? '/' : url.pathname);
  if (url.pathname === '/user_app/detail.html') {
    const postId = (url.searchParams.get('id') || '').trim();
    if (UUID_RE.test(postId)) {
      const r = await fetchPostShareMeta(postId);
      if (r.meta) {
        postMeta = r.meta;
        canonicalUrl += '?id=' + postId;
        trace = 'post-ok';
      } else {
        trace = 'post-fail:' + r.error;
      }
    } else {
      trace = 'no-valid-id';
    }
  }

  if (!siteMeta && !postMeta) return;
  const meta = Object.assign({}, siteMeta || {}, postMeta || {});
  // 진단용 표시: 페이지 소스 맨 위에서 이 줄이 보이면 미들웨어가 실행된 것이다.
  const patched = injectSiteMetaIntoHtml(html, meta, canonicalUrl).replace(
    '<head>',
    '<head>\n<!-- pickle-mw:' + trace + (siteMeta ? '' : ':no-site-meta') + ' -->'
  );

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
