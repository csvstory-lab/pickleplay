/**
 * P!CKLE — 사이트 메타(OG) 공통 로직 (middleware · sync 스크립트 공용)
 */

export const SITE_META_MARKER_START = '<!-- P!CKLE-SITE-META:START -->';
export const SITE_META_MARKER_END = '<!-- P!CKLE-SITE-META:END -->';

export const SUPABASE_PROJECT_REF = 'jszgznanptutwxcsnrep';
export const DEFAULT_OG_IMAGE =
  'https://' +
  SUPABASE_PROJECT_REF +
  '.supabase.co/storage/v1/object/public/system_assets/og/default_og.png';

export const PUBLISHED_META_JSON_URL =
  'https://' +
  SUPABASE_PROJECT_REF +
  '.supabase.co/storage/v1/object/public/system_assets/site_meta.json';

export const DEFAULT_SITE_META = {
  meta_title: '픽클 (P!CKLE) - 도파민 터지는 투표 커뮤니티',
  meta_description: '세상의 모든 논쟁거리, 픽클에서 투표하고 이야기하세요!',
  meta_keywords: '투표,밸런스게임,도파민,픽클,이슈,커뮤니티,MBTI,연애상담,썰',
  og_image_url: DEFAULT_OG_IMAGE,
  site_origin: 'https://pickleplay.kr',
};

export function escapeHtmlAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeSiteMeta(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const title = String(src.meta_title || DEFAULT_SITE_META.meta_title).trim();
  const description = String(
    src.meta_description || DEFAULT_SITE_META.meta_description
  ).trim();
  const keywords = String(src.meta_keywords || DEFAULT_SITE_META.meta_keywords).trim();
  const ogImage = String(src.og_image_url || DEFAULT_SITE_META.og_image_url).trim();
  const siteOrigin = String(src.site_origin || DEFAULT_SITE_META.site_origin).trim();

  return {
    meta_title: title,
    meta_description: description,
    meta_keywords: keywords,
    og_image_url: ogImage || DEFAULT_OG_IMAGE,
    site_origin: siteOrigin.replace(/\/$/, ''),
    updated_at: src.updated_at || null,
    version: src.version || null,
  };
}

export function buildSiteMetaBlock(meta, pageUrl) {
  const cfg = normalizeSiteMeta(meta);
  const title = escapeHtmlAttr(cfg.meta_title);
  const description = escapeHtmlAttr(cfg.meta_description);
  const keywords = escapeHtmlAttr(cfg.meta_keywords);
  const image = escapeHtmlAttr(cfg.og_image_url);
  const ogUrl = escapeHtmlAttr(pageUrl || cfg.site_origin + '/');

  return (
    SITE_META_MARKER_START +
    '\n' +
    '<meta name="description" content="' +
    description +
    '">\n' +
    '<meta name="keywords" content="' +
    keywords +
    '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:site_name" content="P!CKLE">\n' +
    '<meta property="og:title" content="' +
    title +
    '">\n' +
    '<meta property="og:description" content="' +
    description +
    '">\n' +
    '<meta property="og:image" content="' +
    image +
    '">\n' +
    '<meta property="og:url" content="' +
    ogUrl +
    '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' +
    title +
    '">\n' +
    '<meta name="twitter:description" content="' +
    description +
    '">\n' +
    '<meta name="twitter:image" content="' +
    image +
    '">\n' +
    '<title>' +
    title +
    '</title>\n' +
    SITE_META_MARKER_END
  );
}

export function injectSiteMetaIntoHtml(html, meta, pageUrl) {
  const block = buildSiteMetaBlock(meta, pageUrl);
  const pattern = new RegExp(
    SITE_META_MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '[\\s\\S]*?' +
      SITE_META_MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'm'
  );

  if (pattern.test(html)) {
    return html.replace(pattern, block);
  }

  return html;
}

export function buildPublishedMetaPayload(generalConfig) {
  const cfg = normalizeSiteMeta(generalConfig || {});
  return {
    meta_title: cfg.meta_title,
    meta_description: cfg.meta_description,
    meta_keywords: cfg.meta_keywords,
    og_image_url: cfg.og_image_url,
    site_origin: cfg.site_origin,
    updated_at: new Date().toISOString(),
    version: Date.now(),
  };
}

export async function fetchPublishedSiteMeta(fetchImpl) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (!fetchFn) return null;

  try {
    const res = await fetchFn(PUBLISHED_META_JSON_URL + '?v=' + Date.now(), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeSiteMeta(data);
  } catch (err) {
    return null;
  }
}
