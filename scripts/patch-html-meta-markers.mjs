/**
 * 기존 고정 OG 블록 → P!CKLE-SITE-META 마커 블록으로 1회 변환
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSiteMetaBlock, DEFAULT_SITE_META } from './site-meta-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TARGETS = [
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

const STATIC_OG_RE =
  /<!-- P!CKLE static OG \(카카오 스크랩 봇용\) -->[\s\S]*?<title>[^<]*<\/title>\n?/m;

const EVENT_OG_RE =
  /<meta property="og:title"[\s\S]*?<title>[^<]*<\/title>\n?/m;

const block = buildSiteMetaBlock(DEFAULT_SITE_META, '');

for (const target of TARGETS) {
  const abs = path.join(ROOT, target.file);
  if (!fs.existsSync(abs)) {
    console.warn('skip missing:', target.file);
    continue;
  }

  let html = fs.readFileSync(abs, 'utf8');
  if (html.includes('P!CKLE-SITE-META:START')) {
    console.log('already patched:', target.file);
    continue;
  }

  const replacement = buildSiteMetaBlock(DEFAULT_SITE_META, target.pageUrl) + '\n';
  const re = target.file.endsWith('event.html') ? EVENT_OG_RE : STATIC_OG_RE;

  if (!re.test(html)) {
    console.warn('pattern not found:', target.file);
    continue;
  }

  html = html.replace(re, replacement);
  fs.writeFileSync(abs, html, 'utf8');
  console.log('patched:', target.file);
}
