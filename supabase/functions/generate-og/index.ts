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

function buildHeader(title: string): SatoriElement {
  const logo = buildLogoSvg(280, 70);

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
        gap: 28,
        padding: '0 80px',
        background: '#0a0a0c',
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
          color: '#fcfcfc',
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
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0c',
        boxSizing: 'border-box',
        flexShrink: 0,
      },
    },
    h(
      'div',
      {
        style: {
          width: 952,
          height: 140,
          borderRadius: 32,
          border: '3px dashed rgba(252, 252, 252, 0.55)',
          color: '#fcfcfc',
          background: 'rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: -1,
        },
      },
      '👇 터치해서 내 픽 남기기',
    ),
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
      { style: { fontSize: 40, fontWeight: 800, color: colors.accent, letterSpacing: -1 } },
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
        { bg: '#DCE8FF', accent: '#3E6BE0', text: '#152A5C' },
        'flex-end',
        { paddingTop: 48, paddingBottom: 150 },
      ),
      buildHalf(
        'B PICK',
        optionB,
        { bg: '#FFE0EA', accent: '#E23F72', text: '#5C1530' },
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
            background: '#fcfcfc',
            color: '#0a0a0c',
            fontSize: 56,
            fontWeight: 800,
            zIndex: 2,
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

function buildResultHeader(title: string): SatoriElement {
  return h(
    'div',
    {
      style: {
        background: '#000000',
        padding: '80px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
    },
    h(
      'div',
      {
        style: {
          fontSize: 56,
          fontWeight: 900,
          color: '#ffffff',
          textAlign: 'center',
          wordBreak: 'keep-all',
          lineHeight: 1.3,
        },
      },
      title,
    ),
  );
}

function buildResultHalf(
  name: string,
  pct: number,
  colors: { bg: string; pct: string },
  isWinner: boolean,
): SatoriElement {
  const children: SatoriChild[] = [];

  if (isWinner) {
    children.push(
      h(
        'div',
        {
          style: {
            position: 'absolute',
            top: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FFD700',
            color: '#000000',
            fontSize: 38,
            fontWeight: 900,
            padding: '16px 36px',
            borderRadius: 50,
            transform: 'rotate(-10deg)',
          },
        },
        '👑 WIN',
      ),
    );
  }

  children.push(
    h(
      'div',
      {
        style: {
          fontSize: 60,
          fontWeight: 800,
          color: '#333333',
          marginBottom: 24,
          textAlign: 'center',
          wordBreak: 'keep-all',
        },
      },
      name,
    ),
    h(
      'div',
      {
        style: {
          fontSize: 130,
          fontWeight: 900,
          color: colors.pct,
          textShadow: '2px 2px 0px rgba(255,255,255,0.5)',
        },
      },
      `${pct}%`,
    ),
  );

  return h(
    'div',
    {
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        background: colors.bg,
        padding: 40,
      },
    },
    ...children,
  );
}

function buildResultFooter(totalParticipants: number): SatoriElement {
  return h(
    'div',
    {
      style: {
        background: '#000000',
        padding: '45px 50px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
    },
    h(
      'div',
      {
        style: {
          fontSize: 36,
          fontWeight: 700,
          color: '#ffffff',
          background: '#222222',
          padding: '16px 32px',
          borderRadius: 20,
        },
      },
      `총 ${totalParticipants.toLocaleString()}명 참여 완료!`,
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 16, // 로고가 커진 만큼 슬로건과의 간격도 함께 넓혀 시각적 균형 유지
        },
      },
      h(
        'div',
        { style: { fontSize: 22, fontWeight: 600, color: '#aaaaaa' } },
        '톡 쏘는 논쟁과 재미 - 픽클',
      ),
      // 9:16 헤더와 동일한 SVG 소스를 재사용, 높이 55px(비율 유지 width 220px)에 맞춰 우측 정렬.
      buildLogoSvg(220, 55),
    ),
  );
}

function buildResultSquareTemplate(post: PostOgData, stats: VoteStats): SatoriElement {
  const title = truncateText(resolveTitle(post), 40);
  const optionA = truncateText(String(post.option_a_name || 'A 선택지'), 20);
  const optionB = truncateText(String(post.option_b_name || 'B 선택지'), 20);
  const pct = calcVotePercent(stats.votesA, stats.votesB);

  let winner: 'A' | 'B' | null = null;
  if (stats.votesA !== stats.votesB) {
    winner = stats.votesA > stats.votesB ? 'A' : 'B';
  }

  return h(
    'div',
    {
      style: {
        width: RESULT_SIZE,
        height: RESULT_SIZE,
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Pretendard',
      },
    },
    buildResultHeader(title),
    h(
      'div',
      { style: { display: 'flex', flex: 1 } },
      buildResultHalf(optionA, pct.pctA, { bg: '#E6F3FF', pct: '#0066CC' }, winner === 'A'),
      buildResultHalf(optionB, pct.pctB, { bg: '#FFF0F5', pct: '#CC0052' }, winner === 'B'),
    ),
    buildResultFooter(stats.total),
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