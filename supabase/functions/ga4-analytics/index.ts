import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { importPKCS8, SignJWT } from "https://deno.land/x/jose@v4.14.4/index.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const PROPERTY_ID = Deno.env.get('GA4_PROPERTY_ID');
    const CLIENT_EMAIL = Deno.env.get('GA4_CLIENT_EMAIL');
    const PRIVATE_KEY = Deno.env.get('GA4_PRIVATE_KEY')?.replace(/\\n/g, '\n').replace(/"/g, '');

    if (!PROPERTY_ID || !CLIENT_EMAIL || !PRIVATE_KEY) throw new Error("환경 변수 누락");

    const privateKey = await importPKCS8(PRIVATE_KEY, "RS256");
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

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) throw new Error("토큰 발급 실패");

    const { startDate = '7daysAgo', endDate = 'today' } = await req.json().catch(() => ({}));

    // 구글에 질문을 던지는 공통 함수
    const fetchReport = async (bodyParams) => {
      const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dateRanges: [{ startDate, endDate }], ...bodyParams })
      });
      return res.json();
    };

    // 🚀 5가지 리포트를 동시에 요청합니다!
    const [kpi, acq, os, demo, region] = await Promise.all([
      // 1. 핵심 지표 (방문자, 체류시간, 조회수, 세션수)
      fetchReport({ metrics: [{ name: "activeUsers" }, { name: "userEngagementDuration" }, { name: "screenPageViews" }, { name: "sessions" }] }),
      // 2. 유입 경로
      fetchReport({ dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "activeUsers" }] }),
      // 3. 접속 환경 (OS)
      fetchReport({ dimensions: [{ name: "operatingSystem" }], metrics: [{ name: "activeUsers" }] }),
      // 4. 인구 통계 (성별)
      fetchReport({ dimensions: [{ name: "userGender" }], metrics: [{ name: "activeUsers" }] }),
      // 5. 지리적 위치 (지역/도시)
      fetchReport({ dimensions: [{ name: "region" }], metrics: [{ name: "activeUsers" }] })
    ]);

    // 결과를 하나로 묶어서 프론트엔드로 전달
    return new Response(JSON.stringify({ kpi, acq, os, demo, region }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
})