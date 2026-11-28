/**
 * P!CKLE — Dynamic 9:16 OG / Instagram Story image generator
 *
 * GET /functions/v1/generate-og?postId=<uuid>
 *
 * Render pipeline:
 *   posts row -> Satori React-like tree -> SVG -> resvg-wasm -> PNG
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import satori from 'npm:satori@0.10.14';
import { Resvg, initWasm } from 'npm:@resvg/resvg-wasm@2.6.2';
import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';

const WIDTH = 1080;
const HEIGHT = 1920;

// 종료된 불판(투표 결과) 공유용 1:1 정방형 캔버스 — 9:16 스토리 캔버스와는 완전히 분리된 상수.
const RESULT_SIZE = 1080;

const PRETENDARD_BOLD_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.8/packages/pretendard/dist/web/static/woff/Pretendard-Bold.woff';
const RESVG_WASM_URL = 'https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm';

type SatoriChild = string | number | SatoriElement | Array<SatoriChild>;
type SatoriElement = {
  type: string;
  props: Record<string, unknown> & { children?: SatoriChild };
};

type PostOgData = {
  title: string | null;
  option_a_name: string | null;
  option_a_image_url: string | null;
  option_b_name: string | null;
  option_b_image_url: string | null;
  expires_at: string | null;
};

type VoteStats = {
  votesA: number;
  votesB: number;
  total: number;
};

let fontDataPromise: Promise<{ bold: ArrayBuffer }> | null = null;
let resvgInitPromise: Promise<void> | null = null;

function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: SatoriChild[]
): SatoriElement {
  return {
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 1 ? children[0] : children,
    },
  };
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = String(value || '').trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength - 1).trimEnd() + '…';
}

function resolveTitle(post: PostOgData): string {
  const title = String(post.title || '').trim();
  if (title) return title;
  return `${String(post.option_a_name || 'A 선택지').trim()} vs ${String(
    post.option_b_name || 'B 선택지',
  ).trim()}`;
}

// user_app 프론트엔드(js/pickle-detail.js)의 calcVotePercent와 동일한 계산 규칙(SSOT 일치).
function calcVotePercent(votesA: number, votesB: number): { pctA: number; pctB: number } {
  const a = Number(votesA) || 0;
  const b = Number(votesB) || 0;
  const total = a + b;
  if (total <= 0) return { pctA: 0, pctB: 0 };
  const pctA = Math.round((a / total) * 100);
  return { pctA, pctB: 100 - pctA };
}

function isPostClosed(post: PostOgData): boolean {
  const raw = post.expires_at;
  if (!raw) return false;
  const expireDate = new Date(raw);
  if (Number.isNaN(expireDate.getTime())) return false;
  return Date.now() > expireDate.getTime();
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`asset_fetch_failed: ${url} (${res.status})`);
  }
  return await res.arrayBuffer();
}

async function loadFonts(): Promise<{ bold: ArrayBuffer }> {
  if (!fontDataPromise) {
    fontDataPromise = fetchArrayBuffer(PRETENDARD_BOLD_URL).then((bold) => ({ bold }));
  }
  return await fontDataPromise;
}

async function ensureResvgReady(): Promise<void> {
  if (!resvgInitPromise) {
    resvgInitPromise = fetchArrayBuffer(RESVG_WASM_URL).then((wasm) => initWasm(wasm));
  }
  await resvgInitPromise;
}

// js/pickle-detail.js의 fetchVoteStats와 동일한 우선순위(RPC 우선, 실패 시 votes 테이블 직접 집계)로 동작.
// deno-lint-ignore no-explicit-any
async function fetchVoteStats(supabase: any, postId: string): Promise<VoteStats> {
  const empty: VoteStats = { votesA: 0, votesB: 0, total: 0 };

  const rpc = await supabase.rpc('get_post_vote_stats', { post_ids: [postId] });
  if (!rpc.error && rpc.data && rpc.data.length) {
    const row = rpc.data[0] as { votes_a?: number; votes_b?: number; total?: number };
    return {
      votesA: Number(row.votes_a) || 0,
      votesB: Number(row.votes_b) || 0,
      total: Number(row.total) || 0,
    };
  }

  const fallback = await supabase.from('votes').select('choice').eq('post_id', postId);
  if (fallback.error || !fallback.data) {
    console.warn('[generate-og] vote stats fetch failed', fallback.error);
    return empty;
  }

  const stats: VoteStats = { votesA: 0, votesB: 0, total: 0 };
  for (const row of fallback.data as Array<{ choice: string }>) {
    if (row.choice === 'A') stats.votesA += 1;
    if (row.choice === 'B') stats.votesB += 1;
    stats.total += 1;
  }
  return stats;
}

// P!CKLE 로고 SVG — js/pickle-logo.js에서 추출한 원본 path를 그대로 사용.
// 9:16 헤더와 1:1 결과 푸터가 동일한 소스를 공유하도록 크기만 파라미터로 분리.
function buildLogoSvg(width: number, height: number): SatoriElement {
  return h(
    'svg',
    { viewBox: '0 0 202.42 50.55', width, height },
    h('path', {
      fill: '#fff',
      d:
        'M33.02,7.68c2.43,1.16,4.31,2.81,5.63,4.94,1.33,2.14,1.99,4.66,1.99,7.57s-.66,5.38-1.99,7.51c-1.33,2.14-3.2,3.77-5.63,4.92-2.43,1.14-5.28,1.71-8.56,1.71h-6.79v10.27h-9.61V5.94h16.4c3.28,0,6.13.58,8.56,1.74ZM29.13,24.59c1.2-1.05,1.8-2.51,1.8-4.39s-.6-3.45-1.8-4.5c-1.2-1.05-2.95-1.57-5.27-1.57h-6.19v12.04h6.19c2.32,0,4.08-.52,5.27-1.57Z',
    }),
    h('path', {
      fill: '#fff',
      d:
        'M66.98,42.76c-3.06-1.71-5.45-4.1-7.18-7.15-1.73-3.06-2.6-6.5-2.6-10.33s.87-7.27,2.62-10.33c1.75-3.06,4.15-5.44,7.21-7.15,3.06-1.71,6.48-2.57,10.27-2.57,3.28,0,6.24.61,8.89,1.82,2.65,1.22,4.86,2.98,6.63,5.3l-6.19,5.97c-2.39-3.02-5.34-4.53-8.84-4.53-2.1,0-3.97.48-5.61,1.44-1.64.96-2.92,2.31-3.84,4.06-.92,1.75-1.38,3.75-1.38,5.99s.46,4.24,1.38,5.99c.92,1.75,2.2,3.1,3.84,4.06,1.64.96,3.51,1.44,5.61,1.44,3.57,0,6.52-1.53,8.84-4.58l6.19,5.97c-1.77,2.32-3.98,4.1-6.63,5.33-2.65,1.23-5.63,1.85-8.95,1.85-3.79,0-7.22-.86-10.27-2.57Z',
    }),
    h('path', {
      fill: '#fff',
      d:
        'M105.81,34.89v9.72h-9.56V5.94h9.56v16.79l14.97-16.79h10.61l-15.02,17.18,15.85,21.49h-11.16l-10.99-14.47-4.25,4.75Z',
    }),
    h('path', {
      fill: '#fff',
      d: 'M144.43,5.94v30.49h17.9v8.17h-27.51V5.94h9.61Z',
    }),
    h('path', {
      fill: '#fff',
      d: 'M194.36,44.61h-29V5.94h28.28v8.06h-18.78v7.07h16.63v7.84h-16.63v7.62h19.5v8.06Z',
    }),
    h('path', {
      fill: '#85db67',
      d:
        'M49.15,5.23c1.25,0,2.35.47,3.31,1.4.96.93,1.44,2.1,1.44,3.49v18.38c0,1.39-.48,2.55-1.44,3.49-.96.93-2.06,1.4-3.31,1.4-1.39,0-2.57-.47-3.52-1.4-.96-.93-1.44-2.1-1.44-3.49V10.12c0-1.39.48-2.55,1.44-3.49.96-.93,2.13-1.4,3.52-1.4ZM53.9,40.51c0,1.29-.48,2.42-1.44,3.38-.96.96-2.06,1.44-3.31,1.44-1.39,0-2.57-.48-3.52-1.44-.96-.96-1.44-2.09-1.44-3.38s.48-2.49,1.44-3.45c.96-.96,2.13-1.44,3.52-1.44,1.25,0,2.35.48,3.31,1.44.96.96,1.44,2.11,1.44,3.45Z',
    }),
  );
}

// -----------------------------------------------------------------------------
// 공통 디자인 토큰 — 앱(user_app)의 다크 테마·파스텔 포인트 색과 동일하게 맞춤.
// 이모지는 사용하지 않는다(Pretendard에 이모지 글리프가 없어 이미지에서 네모(▤)로 깨짐).
// -----------------------------------------------------------------------------
const C = {
  bg: '#0a0a0c',
  card: '#1c1c1e',
  mint: '#4ADE80',
  blue: '#73A5FF',
  pink: '#FF85A1',
  gold: '#FCD34D',
  text: '#fcfcfc',
  sub: '#a1a1aa',
};
const SITE_HOST = 'pickleplay.kr';

function buildArrowSvg(size: number, color: string): SatoriElement {
  return h(
    'svg',
    { viewBox: '0 0 24 24', width: size, height: size, fill: 'none' },
    h('path', {
      d: 'M5 12h14M13 6l6 6-6 6',
      stroke: color,
      'stroke-width': 3,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
}

function buildCrownSvg(size: number, color: string): SatoriElement {
  return h(
    'svg',
    { viewBox: '0 0 24 24', width: size, height: size },
    h('path', { d: 'M3 18l-1-11 5.5 4L12 4l4.5 7L22 7l-1 11H3zm0 2h18v2H3v-2z', fill: color }),
  );
}

function buildHeader(title: string): SatoriElement {
  const logo = buildLogoSvg(340, 85);

  return h(
    'div',
    {
      style: {
        height: 420,
        width: WIDTH,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 30,
        padding: '0 80px',
        background: C.bg,
        boxSizing: 'border-box',
        flexShrink: 0,
      },
    },
    logo,
    h(
      'div',
      {
        style: {
          fontSize: 54,
          fontWeight: 800,
          lineHeight: 1.25,
          letterSpacing: -1,
          color: C.text,
          wordBreak: 'keep-all',
          textAlign: 'center',
        },
      },
      title,
    ),
  );
}

function buildFooter(): SatoriElement {
  return h(
    'div',
    {
      style: {
        height: 420,
        width: WIDTH,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
        background: C.bg,
        boxSizing: 'border-box',
        flexShrink: 0,
      },
    },
    h(
      'div',
      {
        style: {
          width: 952,
          height: 150,
          borderRadius: 75,
          background: C.mint,
          color: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          fontSize: 52,
          fontWeight: 800,
          letterSpacing: -1,
        },
      },
      '터치해서 내 픽 남기기',
      buildArrowSvg(54, C.bg),
    ),
    h('div', { style: { fontSize: 34, fontWeight: 700, color: C.sub } }, SITE_HOST),
  );
}

function buildHalf(
  label: string,
  optionText: string,
  colors: { bg: string; accent: string; text: string },
  justify: 'flex-start' | 'flex-end',
  edgePadding: { paddingTop: number; paddingBottom: number },
): SatoriElement {
  return h(
    'div',
    {
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: justify,
        gap: 20,
        paddingLeft: 80,
        paddingRight: 80,
        paddingTop: edgePadding.paddingTop,
        paddingBottom: edgePadding.paddingBottom,
        background: colors.bg,
        boxSizing: 'border-box',
      },
    },
    h(
      'div',
      { style: { fontSize: 40, fontWeight: 800, color: colors.accent, letterSpacing: 1 } },
      label,
    ),
    h(
      'div',
      {
        style: {
          fontSize: 88,
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: -1.5,
          color: colors.text,
          wordBreak: 'keep-all',
          textAlign: 'center',
        },
      },
      optionText,
    ),
  );
}

function buildStoryTemplate(post: PostOgData): SatoriElement {
  const title = truncateText(resolveTitle(post), 40);
  const optionA = truncateText(String(post.option_a_name || 'A 선택지'), 44);
  const optionB = truncateText(String(post.option_b_name || 'B 선택지'), 44);

  return h(
    'div',
    {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Pretendard',
        overflow: 'hidden',
      },
    },
    // 상단 위험 구역(Y 0~420): 로고 + 투표 제목
    buildHeader(title),
    h(
      'div',
      {
        style: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        },
      },
      // 중앙 안전 구역(Y 420~1500) 안에서, VS 뱃지와 겹치지 않도록
      // A 영역은 아래쪽에 paddingBottom, B 영역은 위쪽에 paddingTop 여백을 확보해 텍스트를 모은다.
      buildHalf(
        'A PICK',
        optionA,
        { bg: '#111c36', accent: C.blue, text: C.text },
        'flex-end',
        { paddingTop: 48, paddingBottom: 150 },
      ),
      buildHalf(
        'B PICK',
        optionB,
        { bg: '#2e1320', accent: C.pink, text: C.text },
        'flex-start',
        { paddingTop: 150, paddingBottom: 48 },
      ),
      h(
        'div',
        {
          style: {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 176,
            height: 176,
            borderRadius: 88,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: C.mint,
            color: C.bg,
            fontSize: 60,
            fontWeight: 800,
            border: `10px solid ${C.bg}`,
          },
        },
        'VS',
      ),
    ),
    // 하단 위험 구역(Y 1500~1920): CTA 바
    buildFooter(),
  );
}

// =============================================================================
// 종료된 불판(투표 결과) 공유용 1:1 정방형 템플릿 — 위 9:16 스토리 템플릿과는 독립적으로 동작.
// =============================================================================

function buildResultCard(
  label: string,
  name: string,
  pct: number,
  accent: string,
  state: 'win' | 'lose' | 'draw',
): SatoriElement {
  const isWin = state === 'win';
  const badge =
    state === 'win'
      ? h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(252, 211, 77, 0.16)',
              color: C.gold,
              fontSize: 34,
              fontWeight: 800,
              padding: '10px 26px',
              borderRadius: 40,
            },
          },
          buildCrownSvg(36, C.gold),
          'WIN',
        )
      : state === 'draw'
        ? h(
            'div',
            {
              style: {
                display: 'flex',
                background: 'rgba(252, 211, 77, 0.16)',
                color: C.gold,
                fontSize: 34,
                fontWeight: 800,
                padding: '10px 26px',
                borderRadius: 40,
              },
            },
            'DRAW',
          )
        : h('div', { style: { display: 'flex', height: 58 } }, ' ');

  return h(
    'div',
    {
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '28px 24px',
        borderRadius: 40,
        background: isWin ? 'rgba(255,255,255,0.07)' : C.card,
        border: isWin ? `5px solid ${accent}` : '2px solid rgba(255,255,255,0.10)',
        boxSizing: 'border-box',
      },
    },
    badge,
    h('div', { style: { fontSize: 32, fontWeight: 800, color: accent, letterSpacing: 1 } }, `${label} PICK`),
    h(
      'div',
      {
        style: {
          fontSize: 46,
          fontWeight: 800,
          lineHeight: 1.25,
          color: isWin ? C.text : '#d4d4d8',
          textAlign: 'center',
          wordBreak: 'keep-all',
          minHeight: 116,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      name,
    ),
    h(
      'div',
      { style: { fontSize: 150, fontWeight: 900, lineHeight: 1, color: accent, letterSpacing: -4 } },
      `${pct}%`,
    ),
  );
}

function buildRatioBar(pctA: number, pctB: number, total: number): SatoriElement {
  if (total <= 0) {
    return h('div', {
      style: { display: 'flex', height: 26, borderRadius: 13, background: 'rgba(255,255,255,0.12)' },
    });
  }
  return h(
    'div',
    { style: { display: 'flex', height: 26, borderRadius: 13, overflow: 'hidden', background: 'rgba(255,255,255,0.12)' } },
    h('div', { style: { display: 'flex', width: `${pctA}%`, background: C.blue } }),
    h('div', { style: { display: 'flex', width: `${pctB}%`, background: C.pink } }),
  );
}

function buildResultSquareTemplate(post: PostOgData, stats: VoteStats): SatoriElement {
  const title = truncateText(resolveTitle(post), 40);
  const optionA = truncateText(String(post.option_a_name || 'A 선택지'), 20);
  const optionB = truncateText(String(post.option_b_name || 'B 선택지'), 20);
  const pct = calcVotePercent(stats.votesA, stats.votesB);

  const draw = stats.votesA === stats.votesB;
  const aState = draw ? 'draw' : stats.votesA > stats.votesB ? 'win' : 'lose';
  const bState = draw ? 'draw' : stats.votesB > stats.votesA ? 'win' : 'lose';

  return h(
    'div',
    {
      style: {
        width: RESULT_SIZE,
        height: RESULT_SIZE,
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Pretendard',
        padding: '44px 48px 40px',
        boxSizing: 'border-box',
      },
    },
    // 상단: 로고 + 결과 라벨
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      buildLogoSvg(220, 55),
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 30,
            fontWeight: 800,
            color: C.mint,
            border: `3px solid ${C.mint}`,
            borderRadius: 40,
            padding: '8px 26px',
          },
        },
        '투표 결과',
      ),
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          marginTop: 26,
          fontSize: 54,
          fontWeight: 800,
          lineHeight: 1.28,
          letterSpacing: -1,
          color: C.text,
          wordBreak: 'keep-all',
        },
      },
      title,
    ),
    // 중앙: A / B 결과 카드
    h(
      'div',
      { style: { display: 'flex', flex: 1, gap: 20, marginTop: 28 } },
      buildResultCard('A', optionA, pct.pctA, C.blue, aState),
      buildResultCard('B', optionB, pct.pctB, C.pink, bState),
    ),
    // 비율 막대
    h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 28 } }, buildRatioBar(pct.pctA, pct.pctB, stats.total)),
    // 하단: 참여 인원 + CTA
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 30 } },
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h('div', { style: { display: 'flex', fontSize: 38, fontWeight: 800, color: C.text } }, `총 ${stats.total.toLocaleString()}명 참여`),
        h('div', { style: { display: 'flex', fontSize: 28, fontWeight: 700, color: C.sub } }, SITE_HOST),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: C.mint,
            color: C.bg,
            fontSize: 40,
            fontWeight: 800,
            padding: '22px 40px',
            borderRadius: 60,
          },
        },
        '나도 투표하기',
        buildArrowSvg(40, C.bg),
      ),
    ),
  );
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') {
    return jsonResponse({ ok: false, reason: 'method_not_allowed' }, 405);
  }

  try {
    const url = new URL(req.url);
    const postId = String(url.searchParams.get('postId') || '').trim();
    if (!postId) {
      return jsonResponse({ ok: false, reason: 'postId_required' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ ok: false, reason: 'supabase_env_missing' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: post, error } = await supabase
      .from('posts')
      .select(
        'title, option_a_name, option_a_image_url, option_b_name, option_b_image_url, expires_at',
      )
      .eq('id', postId)
      .maybeSingle();

    if (error) {
      console.error('[generate-og] post fetch failed', error);
      return jsonResponse({ ok: false, reason: 'post_fetch_failed', error: error.message }, 500);
    }

    if (!post) {
      return jsonResponse({ ok: false, reason: 'post_not_found' }, 404);
    }

    const postData = post as PostOgData;
    const fonts = await loadFonts();

    // 분기: 진행 중인 불판 → 기존 9:16 스토리 템플릿(변경 없음).
    //       종료된 불판 → 투표 결과를 담은 1:1 정방형 템플릿(신규).
    let svg: string;
    let renderWidth: number;

    if (isPostClosed(postData)) {
      const stats = await fetchVoteStats(supabase, postId);
      svg = await satori(buildResultSquareTemplate(postData, stats), {
        width: RESULT_SIZE,
        height: RESULT_SIZE,
        fonts: [{ name: 'Pretendard', data: fonts.bold, weight: 800, style: 'normal' }],
      });
      renderWidth = RESULT_SIZE;
    } else {
      svg = await satori(buildStoryTemplate(postData), {
        width: WIDTH,
        height: HEIGHT,
        fonts: [{ name: 'Pretendard', data: fonts.bold, weight: 800, style: 'normal' }],
      });
      renderWidth = WIDTH;
    }

    await ensureResvgReady();
    const pngData = new Resvg(svg, {
      fitTo: { mode: 'width', value: renderWidth },
    }).render();
    const png = pngData.asPng();

    return new Response(png, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
      },
    });
  } catch (err) {
    console.error('[generate-og] failed', err);
    return jsonResponse(
      { ok: false, reason: 'render_failed', error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});