/**
 * P!CKLE — Dynamic 9:16 OG / Instagram Story image generator
 *
 * GET /functions/v1/generate-og?postId=<uuid>
 *
 * Render pipeline:
 *   posts row -> Satori React-like tree -> SVG -> resvg-wasm -> PNG
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import satori from 'https://esm.sh/satori@0.10.14';
import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2';
import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';

const WIDTH = 1080;
const HEIGHT = 1920;

const PRETENDARD_REGULAR_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.8/dist/web/static/woff/Pretendard-Regular.woff';
const PRETENDARD_BOLD_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.8/dist/web/static/woff/Pretendard-Bold.woff';
const RESVG_WASM_URL = 'https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm';

type SatoriChild = string | number | SatoriElement | Array<SatoriChild>;
type SatoriElement = {
  type: string;
  props: Record<string, unknown> & { children?: SatoriChild };
};

type PostOgData = {
  title: string | null;
  option_a_name: string | null;
  option_b_name: string | null;
};

let fontDataPromise: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> | null = null;
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

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`asset_fetch_failed: ${url} (${res.status})`);
  }
  return await res.arrayBuffer();
}

async function loadFonts(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all([
      fetchArrayBuffer(PRETENDARD_REGULAR_URL),
      fetchArrayBuffer(PRETENDARD_BOLD_URL),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return await fontDataPromise;
}

async function ensureResvgReady(): Promise<void> {
  if (!resvgInitPromise) {
    resvgInitPromise = fetchArrayBuffer(RESVG_WASM_URL).then((wasm) => initWasm(wasm));
  }
  await resvgInitPromise;
}

function buildStoryTemplate(post: PostOgData): SatoriElement {
  const title = truncateText(resolveTitle(post), 72);
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
        background: '#0a0a0c',
        color: '#fcfcfc',
        fontFamily: 'Pretendard',
        padding: '96px 78px 88px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      },
    },
    h('div', {
      style: {
        position: 'absolute',
        top: -180,
        right: -160,
        width: 520,
        height: 520,
        borderRadius: 260,
        background: 'rgba(115, 165, 255, 0.18)',
      },
    }),
    h('div', {
      style: {
        position: 'absolute',
        bottom: -220,
        left: -160,
        width: 620,
        height: 620,
        borderRadius: 310,
        background: 'rgba(255, 133, 161, 0.16)',
      },
    }),
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 30,
          zIndex: 1,
        },
      },
      h(
        'div',
        {
          style: {
            fontSize: 54,
            fontWeight: 800,
            letterSpacing: -2,
            color: '#4ADE80',
          },
        },
        'P!CKLE',
      ),
      h(
        'div',
        {
          style: {
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.16,
            letterSpacing: -3,
            wordBreak: 'keep-all',
          },
        },
        title,
      ),
    ),
    h(
      'div',
      {
        style: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 34,
          position: 'relative',
          zIndex: 1,
        },
      },
      h(
        'div',
        {
          style: {
            minHeight: 430,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '54px 58px',
            borderRadius: 44,
            border: '5px solid #73A5FF',
            background: 'rgba(115, 165, 255, 0.18)',
            boxShadow: '0 32px 90px rgba(115, 165, 255, 0.18)',
          },
        },
        h(
          'div',
          { style: { fontSize: 40, fontWeight: 800, color: '#73A5FF', marginBottom: 24 } },
          'A PICK',
        ),
        h(
          'div',
          {
            style: {
              fontSize: 68,
              fontWeight: 800,
              lineHeight: 1.18,
              wordBreak: 'keep-all',
            },
          },
          optionA,
        ),
      ),
      h(
        'div',
        {
          style: {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 136,
            height: 136,
            borderRadius: 68,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fcfcfc',
            color: '#0a0a0c',
            border: '7px solid #0a0a0c',
            fontSize: 42,
            fontWeight: 800,
            zIndex: 2,
            boxShadow: '0 18px 54px rgba(0, 0, 0, 0.45)',
          },
        },
        'VS',
      ),
      h(
        'div',
        {
          style: {
            minHeight: 430,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '54px 58px',
            borderRadius: 44,
            border: '5px solid #FF85A1',
            background: 'rgba(255, 133, 161, 0.18)',
            boxShadow: '0 32px 90px rgba(255, 133, 161, 0.18)',
          },
        },
        h(
          'div',
          { style: { fontSize: 40, fontWeight: 800, color: '#FF85A1', marginBottom: 24 } },
          'B PICK',
        ),
        h(
          'div',
          {
            style: {
              fontSize: 68,
              fontWeight: 800,
              lineHeight: 1.18,
              wordBreak: 'keep-all',
            },
          },
          optionB,
        ),
      ),
    ),
    h(
      'div',
      {
        style: {
          zIndex: 1,
          height: 152,
          borderRadius: 34,
          border: '4px dashed rgba(252, 252, 252, 0.55)',
          color: '#fcfcfc',
          background: 'rgba(255, 255, 255, 0.055)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          fontWeight: 800,
          letterSpacing: -1,
        },
      },
      '👇 터치해서 내 픽 남기기',
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
      .select('title, option_a_name, option_b_name')
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
    const svg = await satori(buildStoryTemplate(postData), {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: 'Pretendard', data: fonts.regular, weight: 400, style: 'normal' },
        { name: 'Pretendard', data: fonts.bold, weight: 800, style: 'normal' },
      ],
    });

    await ensureResvgReady();
    const pngData = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
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
