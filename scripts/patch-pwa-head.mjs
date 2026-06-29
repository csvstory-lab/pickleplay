/**
 * HTML <head>에 P!CKLE-PWA 마커 블록 삽입
 * 사용: node scripts/patch-pwa-head.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPwaHeadBlock, DEFAULT_FAVICON } from './site-meta-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TARGETS = [
  'index.html',
  'user_app/index.html',
  'user_app/detail.html',
  'user_app/create.html',
  'user_app/search.html',
  'user_app/ranking.html',
  'user_app/category.html',
  'user_app/hall_of_fame.html',
  'user_app/event.html',
  'user_app/mypage.html',
  'user_app/notifications.html',
  'user_app/result.html',
  'user_app/login.html',
];

const PWA_BLOCK = buildPwaHeadBlock(DEFAULT_FAVICON) + '\n';

for (const relativePath of TARGETS) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) {
    console.warn('skip missing:', relativePath);
    continue;
  }

  let html = fs.readFileSync(abs, 'utf8');
  if (html.includes('P!CKLE-PWA:START')) {
    console.log('already patched:', relativePath);
    continue;
  }

  if (html.includes('P!CKLE-SITE-META:END')) {
    html = html.replace('<!-- P!CKLE-SITE-META:END -->', '<!-- P!CKLE-SITE-META:END -->\n' + PWA_BLOCK);
  } else if (relativePath === 'user_app/login.html') {
    html = html.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n' +
        PWA_BLOCK
    );
  } else {
    console.warn('no insertion point:', relativePath);
    continue;
  }

  if (html.includes('pickle-system-settings.js') && !html.includes('pickle-pwa-defaults.js')) {
    html = html.replace(
      '<script src="../js/pickle-og-defaults.js"></script>',
      '<script src="../js/pickle-og-defaults.js"></script>\n<script src="../js/pickle-pwa-defaults.js"></script>'
    );
  }

  fs.writeFileSync(abs, html, 'utf8');
  console.log('patched:', relativePath);
}
