import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const postId = url.searchParams.get("id");
  const targetUrl = postId ? `https://pickleplay.kr/user_app/detail.html?id=${postId}` : "https://pickleplay.kr";

  // 1. 방문자의 정체(User-Agent) 파악하기
  const userAgent = req.headers.get("user-agent")?.toLowerCase() || "";
  const isBot = userAgent.includes("bot") || userAgent.includes("kakaotalk-scrap") || userAgent.includes("facebook") || userAgent.includes("twitter") || userAgent.includes("slack");

  // 🚨 [핵심 해결책] 2. 방문자가 '사람'이면 HTML 없이 즉시 불판으로 순간이동! (외계어 원천 차단)
  if (!isBot) {
    return Response.redirect(targetUrl, 302);
  }

  // 3. 방문자가 '봇(카카오톡 등)'이면 썸네일용 태그만 전달
  const host = url.host || "jszgznanptutwxcsnrep.supabase.co";
  const ogImageUrl = `https://${host}/functions/v1/generate-og?postId=${postId}`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>P!CKLE - 픽클</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="P!CKLE">
  <meta property="og:title" content="톡 쏘는 논쟁과 재미 - 픽클 (P!CKLE)">
  <meta property="og:description" content="나의 일상과 고민, 픽클에서 투표하고 이야기하세요!">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:url" content="${targetUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${ogImageUrl}">
</head>
<body></body>
</html>`;

  // 봇이 외계어로 읽지 못하도록 UTF-8 바이트 단위로 강제 인코딩하여 전달
  const body = new TextEncoder().encode(html);
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
    status: 200,
  });
});