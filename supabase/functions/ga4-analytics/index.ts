import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// 💡 기존 djwt 대신 전 세계 표준으로 쓰이는 더 안정적인 jose 라이브러리로 교체했습니다!
import { importPKCS8, SignJWT } from "https://deno.land/x/jose@v4.14.4/index.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const PROPERTY_ID = Deno.env.get('GA4_PROPERTY_ID');
    const CLIENT_EMAIL = Deno.env.get('GA4_CLIENT_EMAIL');
    // 복사할 때 따옴표가 섞여 들어가도 자동으로 걸러주는 안전장치 추가
    const PRIVATE_KEY = Deno.env.get('GA4_PRIVATE_KEY')?.replace(/\\n/g, '\n').replace(/"/g, '');

    if (!PROPERTY_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
      throw new Error("환경 변수(Secrets)가 등록되지 않았습니다.");
    }

    // 1. 구글 비밀키(텍스트)를 서버용 정식 암호화 키로 완벽하게 변환 (에러 해결 핵심!)
    const privateKey = await importPKCS8(PRIVATE_KEY, "RS256");

    // 2. 변환된 키를 사용해 구글 인증 출입증(JWT) 생성
    const jwt = await new SignJWT({
        iss: CLIENT_EMAIL,
        sub: CLIENT_EMAIL,
        aud: "https://oauth2.googleapis.com/token",
        scope: "https://www.googleapis.com/auth/analytics.readonly",
      })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

    // 3. 구글에 출입증 내밀고 임시 Access Token 받아오기
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
       throw new Error("구글 Access Token 발급 실패: " + JSON.stringify(tokenData));
    }

    const { startDate = '7daysAgo', endDate = 'today' } = await req.json().catch(() => ({}));

    // 4. GA4 Data API에 리포트(UV, 체류시간 등) 요청하기
    const gaResponse = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "activeUsers" },
          { name: "userEngagementDuration" },
          { name: "screenPageViews" }
        ]
      })
    });

    const gaData = await gaResponse.json();

    if (gaData.error) {
       throw new Error("GA4 API 통신 거절됨: " + gaData.error.message);
    }

    return new Response(JSON.stringify(gaData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})