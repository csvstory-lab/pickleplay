/**
 * admin_web/*.html (admin_login 제외)에 RBAC 스크립트 주입
 * node admin_web/scripts/inject-admin-auth.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.resolve(__dirname, '..');

const SNIPPET = [
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
  '<script src="../js/supabase-config.js"></script>',
  '<script src="js/admin-auth.js"></script>',
].join('\n');

const MARKER = 'js/admin-auth.js';

const files = fs.readdirSync(adminDir).filter((f) => {
  return f.startsWith('admin_') && f.endsWith('.html') && f !== 'admin_login.html';
});

let updated = 0;

for (const file of files) {
  const filePath = path.join(adminDir, file);
  let html = fs.readFileSync(filePath, 'utf8');

  if (html.includes(MARKER)) {
    console.log('skip (already):', file);
    continue;
  }

  if (html.includes('</body>')) {
    html = html.replace('</body>', SNIPPET + '\n</body>');
  } else {
    html += '\n' + SNIPPET;
  }

  fs.writeFileSync(filePath, html, 'utf8');
  console.log('injected:', file);
  updated++;
}

console.log('done. updated', updated, 'files');
