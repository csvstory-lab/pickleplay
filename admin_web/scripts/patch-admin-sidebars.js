/**
 * admin_*.html 사이드바 풀 스펙 통일 (일회성 패치 스크립트)
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');

const FILE_ACTIVE = {
  'admin_dashboard.html': ['dashboard'],
  'admin_users.html': ['users'],
  'admin_categories.html': ['categories'],
  'admin_board_list.html': ['board', 'board_list'],
  'admin_post.html': ['board', 'board_list'],
  'admin_post_detail.html': ['board', 'board_list'],
  'admin_events.html': ['events'],
  'admin_reports.html': ['reports'],
  'admin_ai_filter.html': ['ai'],
  'admin_statistics.html': ['statistics'],
  'admin_cs.html': ['cs'],
  'admin_settings.html': ['settings'],
  'dashboard.html': ['dashboard'],
};

function buildSidebar(activeKeys) {
  const set = new Set(activeKeys);
  const ac = (key) => (set.has(key) ? ' active' : '');

  return `<aside class="sidebar">
    <div class="logo-area">
        <h1 class="logo" onclick="location.href='admin_dashboard.html'">P!CKLE</h1>
        <div class="logo-sub">ADMINISTRATOR 2.6</div>
    </div>
    <ul class="nav-menu">
        <li class="nav-item${ac('dashboard')}" onclick="location.href='admin_dashboard.html'"><div class="nav-item-left"><span class="nav-icon">📊</span> 대시보드</div></li>
        <li class="nav-item${ac('users')}" onclick="return false;"><div class="nav-item-left"><span class="nav-icon">👥</span> 회원 관리</div></li>
        <li class="nav-item${ac('categories')}" onclick="location.href='admin_categories.html'"><div class="nav-item-left"><span class="nav-icon">📁</span> 카테고리 관리</div></li>
        <li class="nav-item${ac('board')}" onclick="location.href='admin_board_list.html'"><div class="nav-item-left"><span class="nav-icon">🔥</span> 불판 관리</div></li>
        <li class="nav-sub-item${ac('board_list')}" onclick="location.href='admin_board_list.html'">· 일반 불판 관리</li>
        <li class="nav-sub-item${ac('spawn')}" onclick="return false;">· 스폰(최애) 불판 설정</li>
        <li class="nav-item${ac('ads')}" onclick="return false;"><div class="nav-item-left"><span class="nav-icon">💰</span> 광고(스폰) 정산</div></li>
        <li class="nav-sub-item${ac('ads_client')}" onclick="return false;">· 광고주 및 정산 관리</li>
        <li class="nav-sub-item${ac('ads_partner')}" onclick="return false;">· 파트너(대행사) 관리</li>
        <li class="nav-item${ac('events')}" onclick="location.href='admin_events.html'"><div class="nav-item-left"><span class="nav-icon">🎁</span> 이벤트/프로모션</div></li>
        <li class="nav-item${ac('reports')}" onclick="location.href='admin_reports.html'"><div class="nav-item-left"><span class="nav-icon">🚨</span> 신고 및 제재 관리</div><span class="badge-danger">12</span></li>
        <li class="nav-item${ac('ai')}" onclick="location.href='admin_ai_filter.html'"><div class="nav-item-left"><span class="nav-icon">🤖</span> AI 필터링 설정</div></li>
        <li class="nav-item${ac('statistics')}" onclick="location.href='admin_statistics.html'"><div class="nav-item-left"><span class="nav-icon">📈</span> 통계 및 분석</div></li>
        <li class="nav-item${ac('cs')}" onclick="location.href='admin_cs.html'"><div class="nav-item-left"><span class="nav-icon">🎧</span> 고객센터 (CS)</div></li>
        <li class="nav-item${ac('settings')}" onclick="location.href='admin_settings.html'"><div class="nav-item-left"><span class="nav-icon">⚙️</span> 시스템 설정</div></li>
    </ul>
</aside>`;
}

const SIDEBAR_RE = /<aside class="sidebar">[\s\S]*?<\/aside>/;

for (const [file, keys] of Object.entries(FILE_ACTIVE)) {
  const fp = path.join(DIR, file);
  if (!fs.existsSync(fp)) {
    console.warn('skip (missing):', file);
    continue;
  }
  const html = fs.readFileSync(fp, 'utf8');
  if (!SIDEBAR_RE.test(html)) {
    console.warn('skip (no sidebar):', file);
    continue;
  }
  const next = html.replace(SIDEBAR_RE, buildSidebar(keys));
  fs.writeFileSync(fp, next, 'utf8');
  console.log('patched:', file, keys.join(', '));
}
