/**
 * P!CKLE — 불판 링크 미리보기(OG) 전용 함수 (Vercel Serverless Function)
 *
 * 카카오톡·페이스북·X(트위터)·슬랙 등 "봇"이 /user_app/detail.html?id=<불판ID> 에 접속하면
 * vercel.json 의 rewrites 가 이 함수로 연결한다. (사람은 연결되지 않고 원래 페이지를 그대로 본다)
 * → 그 불판의 제목·선택지·이미지로 미리보기용 메타 태그만 만들어 준다.
 *
 * 직접 확인: https://pickleplay.kr/api/post-share?id=<불판ID>&debug=1  (HTML 소스를 글자로 보여줌)
 */
const SUPABASE_URL = 'https://jszgznanptutwxcsnrep.supabase.co';
// 공개용 anon 키 (js/supabase-config.js 와 동일, 브라우저에 이미 공개된 값)
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzemd6bmFucHR1dHd4Y3NucmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDc1MjIsImV4cCI6MjA5NjA4MzUyMn0.Czo-Cmw7JQktWMV77KSt2Yk3Pnkx89ZE1Ey0C0dk1G4';
const SITE_ORIGIN = 'https://pickleplay.kr';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_TITLE = '톡 쏘는 논쟁과 재미 - 픽클 (P!CKLE)';
const DEFAULT_DESC = '나의 일상과 고민, 픽클에서 투표하고 이야기하세요!';
const DEFAULT_IMAGE =
  SUPABASE_URL + '/storage/v1/object/public/system_assets/og/default_og.png';

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadPost(postId) {
  try {
    const res = await fetch(
      SUPABASE_URL +
        '/rest/v1/posts?select=title,option_a,option_b&id=eq.' +
        encodeURIComponent(postId) +
        '&limit=1',
      {
        headers: { apikey: SUPABASE_ANON_KEY, authorization: 'Bearer ' + SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) return { error: 'db-http-' + res.status };
    const rows = await res.json();
    const post = Array.isArray(rows) ? rows[0] : null;
    if (!post || !post.title) return { error: 'post-not-found' };
    return { post };
  } catch (e) {
    return { error: 'db-exception-' + String((e && e.name) || 'unknown') };
  }
}

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const postId = String(q.id || '').trim();
  const isDebug = String(q.debug || '') === '1';

  let title = DEFAULT_TITLE;
  let desc = DEFAULT_DESC;
  let image = DEFAULT_IMAGE;
  let pageUrl = SITE_ORIGIN + '/user_app/detail.html';
  let trace = 'no-valid-id';

  if (UUID_RE.test(postId)) {
    pageUrl += '?id=' + postId;
    const r = await loadPost(postId);
    if (r.post) {
      const a = String(r.post.option_a || '').trim();
      const b = String(r.post.option_b || '').trim();
      title = 'P!CKLE - ' + String(r.post.title).trim();
      desc = a || b ? a + ' vs ' + b + '. 지금 투표하세요!' : '지금 투표하세요!';
      image = SUPABASE_URL + '/functions/v1/generate-og?postId=' + encodeURIComponent(postId);
      trace = 'post-ok';
    } else {
      trace = 'post-fail:' + r.error;
    }
  }

  const html =
    '<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n' +
    '<!-- pickle-api:' + trace + ' -->\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta name="description" content="' + esc(desc) + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:site_name" content="P!CKLE">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n' +
    '<meta property="og:description" content="' + esc(desc) + '">\n' +
    '<meta property="og:image" content="' + esc(image) + '">\n' +
    '<meta property="og:url" content="' + esc(pageUrl) + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + esc(title) + '">\n' +
    '<meta name="twitter:description" content="' + esc(desc) + '">\n' +
    '<meta name="twitter:image" content="' + esc(image) + '">\n' +
    // 사람이 이 주소로 직접 들어온 경우를 위한 이동 (원래 페이지는 봇이 아니므로 다시 여기로 오지 않음)
    '<meta http-equiv="refresh" content="0; url=' + esc(pageUrl) + '">\n' +
    '</head>\n<body></body>\n</html>';

  res.statusCode = 200;
  res.setHeader('Content-Type', isDebug ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.end(html);
};
