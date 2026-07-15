import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const postId = url.searchParams.get("id");

  if (!postId) {
    return Response.redirect("https://pickleplay.kr", 302);
  }

  const host = url.host || "jszgznanptutwxcsnrep.supabase.co";
  const ogImageUrl = `https://${host}/functions/v1/generate-og?id=${postId}`;
  const targetUrl = `https://pickleplay.kr/user_app/detail.html?id=${postId}`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>톡 쏘는 논쟁과 재미 - 픽클 (P!CKLE)</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="P!CKLE">
  <meta property="og:title" content="톡 쏘는 논쟁과 재미 - 픽클 (P!CKLE)">
  <meta property="og:description" content="나의 일상과 고민, 픽클에서 투표하고 이야기하세요!">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:url" content="${targetUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${ogImageUrl}">
  <script>window.location.replace("${targetUrl}");</script>
</head>
<body></body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
});