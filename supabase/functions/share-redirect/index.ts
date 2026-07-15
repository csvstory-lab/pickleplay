/**
 * P!CKLE — 카카오톡/SNS 공유용 OG 리다이렉트 (ScrapBot 대응)
 *
 * GET /functions/v1/share-redirect?id=<postId>
 *
 * 크롤러 봇(카카오톡 ScrapBot, 페이스북, 트위터 등)은 JS를 실행하지 않으므로
 * <head>의 OG/Twitter 메타 태그만 읽어 미리보기 카드를 만들고,
 * 실제 유저의 브라우저는 <body>의 스크립트가 즉시 실행되어
 * 불판 상세 페이지로 리다이렉트된다. 하나의 HTML 응답으로 양쪽을 모두 처리한다.
 */

const SITE_ORIGIN = 'https://pickleplay.kr';

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve((req) => {
  const url = new URL(req.url);
  const postId = String(url.searchParams.get('id') || '').trim();

  // 요청받은 URL의 protocol/host를 그대로 재사용해 같은 프로젝트의 generate-og 함수 주소를 동적으로 완성한다.
  // 주의: generate-og 함수는 게시물 ID를 'postId' 쿼리 파라미터로 받으므로 이름을 반드시 맞춰야 한다.
  const ogImageUrl = `${url.protocol}//${url.host}/functions/v1/generate-og?postId=${encodeURIComponent(postId)}`;
  const detailUrl = postId
    ? `${SITE_ORIGIN}/user_app/detail.html?id=${encodeURIComponent(postId)}`
    : `${SITE_ORIGIN}/user_app/index.html`;

  const safeOgImageUrl = escapeHtml(ogImageUrl);
  const safeDetailUrl = escapeHtml(detailUrl);

  const html = `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>톡 쏘는 논쟁과 재미 - 픽클 (P!CKLE)</title>
<meta property="og:type" content="website">
<meta property="og:title" content="톡 쏘는 논쟁과 재미 - 픽클 (P!CKLE)">
<meta property="og:description" content="나의 일상과 고민, 픽클에서 투표하고 이야기하세요!">
<meta property="og:image" content="${safeOgImageUrl}">
<meta property="og:url" content="${safeDetailUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${safeOgImageUrl}">
</head><body>
<script>window.location.replace("${detailUrl}");</script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
