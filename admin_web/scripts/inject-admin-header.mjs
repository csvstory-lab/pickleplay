/**
 * admin_web/*.html 헤더 유저 영역 표준화 + admin-header.css 링크
 * node admin_web/scripts/inject-admin-header.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.resolve(__dirname, '..');

const CSS_LINK = '<link rel="stylesheet" href="css/admin-header.css">';

const USER_BLOCK = `<div class="admin-profile admin-header-user" id="adminHeaderUser">
            <button type="button" class="admin-header-user-btn" id="btnHeaderUserMenu" aria-haspopup="true" aria-expanded="false">
                <span id="header-user-info"></span>
                <span class="admin-header-caret">▾</span>
            </button>
            <div class="admin-avatar" id="header-user-avatar">A</div>
            <div class="admin-header-dropdown" id="headerUserDropdown" hidden>
                <button type="button" class="admin-header-menu-item" id="btnHeaderChangePassword">🔐 비밀번호 변경</button>
                <button type="button" class="admin-header-menu-item admin-header-menu-logout" id="btnHeaderLogout">로그아웃</button>
            </div>
        </div>`;

const PROFILE_PATTERNS = [
  /<div class="admin-profile">\s*<span[^>]*>최고관리자 님<\/span>\s*<div class="admin-avatar">A<\/div>\s*<\/div>/g,
  /<div class="admin-profile">\s*<span[^>]*>최고관리자 님<\/span>\s*<div class="admin-avatar"[^>]*>A<\/div>\s*<\/div>/g,
];

const SKIP = new Set(['admin_login.html', 'admin_reset_password.html']);

const files = fs.readdirSync(adminDir).filter((f) => f.startsWith('admin_') && f.endsWith('.html') && !SKIP.has(f));

let updated = 0;

for (const file of files) {
  const filePath = path.join(adminDir, file);
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  if (!html.includes('css/admin-header.css')) {
    if (html.includes('</head>')) {
      html = html.replace('</head>', `  ${CSS_LINK}\n</head>`);
      changed = true;
    }
  }

  for (const re of PROFILE_PATTERNS) {
    if (re.test(html)) {
      html = html.replace(re, USER_BLOCK);
      changed = true;
    }
  }

  if (!html.includes('id="header-user-info"')) {
    const headerClose = html.match(/<header class="top-header">[\s\S]*?<\/header>/);
    if (headerClose) {
      const block = headerClose[0];
      if (!block.includes('header-user-info')) {
        const injected = block.replace(/<\/header>/, `\n        ${USER_BLOCK}\n    </header>`);
        html = html.replace(block, injected);
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, html, 'utf8');
    console.log('updated:', file);
    updated++;
  } else {
    console.log('skip:', file);
  }
}

console.log('done. updated', updated, 'files');
