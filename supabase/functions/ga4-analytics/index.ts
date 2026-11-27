import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { importPKCS8, SignJWT } from "https://deno.land/x/jose@v4.14.4/index.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 통계 화면을 볼 수 있는 관리자 역할 (admin-auth.js 의 statistics 메뉴 권한과 동일)
const ALLOWED_ROLES = ['super', 'marketer', 'account']

// 화면에서 보낼 수 있는 기간 값만 허용 (임의 문자열 차단)
const ALLOWED_START = ['today', 'yesterday', '7daysAgo', '14daysAgo', '28daysAgo', '30daysAgo', '90daysAgo']

function reply(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── 0. 관리자 로그인 확인 (직원이 아니면 구글 데이터를 주지 않음) ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return reply({ error: '로그인이 필요합니다.', code: 'unauthorized' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) return reply({ error: '로그인이 필요합니다.', code: 'unauthorized' }, 401)

    const { data: roleData, error: roleErr } = await userClient.rpc('pickle_get_my_user_role')
    if (roleErr || !roleData?.ok || !roleData?.is_admin || !ALLOWED_ROLES.includes(roleData.role)) {
      return reply({ error: '통계를 볼 수 있는 관리자 권한이 없습니다.', code: 'forbidden' }, 403)
    }

    const PROPERTY_ID = Deno.env.get('GA4_PROPERTY_ID');
    const CLIENT_EMAIL = Deno.env.get('GA4_CLIENT_EMAIL');
    const PRIVATE_KEY = Deno.env.get('GA4_PRIVATE_KEY')?.replace(/\\n/g, '\n').replace(/"/g, '');

    if (!PROPERTY_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
      return reply({ error: 'GA4 연결 설정(환경 변수)이 비어 있습니다. Supabase 함수 Secrets 를 확인해 주세요.', code: 'env_missing' }, 400)
    }

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
    if (!tokenData.access_token) {
      return reply({ error: '구글 토큰 발급 실패: 서비스 계정 키(GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY)를 확인해 주세요.', code: 'token_failed' }, 400)
    }

    const body = await req.json().catch(() => ({}))
    const startDate = ALLOWED_START.includes(body?.startDate) ? body.startDate : '7daysAgo'
    const endDate = 'today'

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
    // 구글이 오류(권한 없음/속성 ID 오류 등)를 돌려주면 화면에 이유를 보여주기 위해 그대로 전달
    const gaError = [kpi, acq, os, demo, region].find((r) => r && r.error)
    if (gaError) {
      return reply({ error: 'GA4 응답 오류: ' + (gaError.error.message || 'unknown'), code: 'ga_error' }, 400)
    }

    return reply({ kpi, acq, os, demo, region })

  } catch (error) {
    return reply({ error: error.message }, 400)
  }
})