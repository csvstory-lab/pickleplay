/**
 * general_config / site_meta.json 기준으로 HTML <head> 메타 블록 동기화
 * 사용: node scripts/sync-static-site-meta.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSiteMetaBlock,
  injectSiteMetaIntoHtml,
  fetchPublishedSiteMeta,
  normalizeSiteMeta,
  DEFAULT_SITE_META,
} from './site-meta-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const HTML_TARGETS = [
  { file: 'index.html', pageUrl: 'https://pickleplay.kr/' },
  { file: 'user_app/index.html', pageUrl: 'https://pickleplay.kr/user_app/index.html' },
  { file: 'user_app/detail.html', pageUrl: 'https://pickleplay.kr/user_app/detail.html' },
  { file: 'user_app/create.html', pageUrl: 'https://pickleplay.kr/user_app/create.html' },
  { file: 'user_app/search.html', pageUrl: 'https://pickleplay.kr/user_app/search.html' },
  { file: 'user_app/ranking.html', pageUrl: 'https://pickleplay.kr/user_app/ranking.html' },
  { file: 'user_app/category.html', pageUrl: 'https://pickleplay.kr/user_app/category.html' },
  { file: 'user_app/hall_of_fame.html', pageUrl: 'https://pickleplay.kr/user_app/hall_of_fame.html' },
  { file: 'user_app/event.html', pageUrl: 'https://pickleplay.kr/user_app/event.html' },
  { file: 'user_app/mypage.html', pageUrl: 'https://pickleplay.kr/user_app/mypage.html' },
  { file: 'user_app/notifications.html', pageUrl: 'https://pickleplay.kr/user_app/notifications.html' },
  { file: 'user_app/result.html', pageUrl: 'https://pickleplay.kr/user_app/result.html' },
];

async function loadMeta() {
  const published = await fetchPublishedSiteMeta(fetch);
  if (published) return published;

  const configPath = path.join(ROOT, 'js', 'supabase-config.js');
  if (!fs.existsSync(configPath)) {
    console.warn('[sync-site-meta] supabase-config.js 없음 — 기본값 사용');
    return normalizeSiteMeta(DEFAULT_SITE_META);
  }

  const configSrc = fs.readFileSync(configPath, 'utf8');
  const urlMatch = configSrc.match(/url:\s*['"]([^'"]+)['"]/);
  const keyMatch = configSrc.match(/anonKey:\s*['"]([^'"]+)['"]/);
  if (!urlMatch || !keyMatch) {
    console.warn('[sync-site-meta] Supabase 설정 파싱 실패 — 기본값 사용');
    return normalizeSiteMeta(DEFAULT_SITE_META);
  }

  const apiUrl =
    String(urlMatch[1]).replace(/\/$/, '') +
    '/rest/v1/system_settings?id=eq.1&select=general_config';
  const res = await fetch(apiUrl, {
    headers: {
      apikey: keyMatch[1],
      Authorization: 'Bearer ' + keyMatch[1],
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    console.warn('[sync-site-meta] DB 조회 실패 — 기본값 사용', res.status);
    return normalizeSiteMeta(DEFAULT_SITE_META);
  }

  const rows = await res.json();
  const general = rows && rows[0] && rows[0].general_config;
  return normalizeSiteMeta(general || DEFAULT_SITE_META);
}

function syncFile(relativePath, meta, pageUrl) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) {
    console.warn('[sync-site-meta] skip (missing):', relativePath);
    return false;
  }

  const html = fs.readFileSync(abs, 'utf8');
  const next = injectSiteMetaIntoHtml(html, meta, pageUrl);
  if (next === html) {
    console.warn('[sync-site-meta] markers not found:', relativePath);
    return false;
  }

  fs.writeFileSync(abs, next, 'utf8');
  console.log('[sync-site-meta] updated:', relativePath);
  return true;
}

const meta = await loadMeta();
console.log('[sync-site-meta] meta_title:', meta.meta_title);
console.log('[sync-site-meta] meta_description:', meta.meta_description);

let count = 0;
for (const target of HTML_TARGETS) {
  if (syncFile(target.file, meta, target.pageUrl)) count += 1;
}

console.log('[sync-site-meta] done —', count, 'files');
