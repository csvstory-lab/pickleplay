/**
 * P!CKLE Admin — 시스템 설정 > 작업 기록 (admin_audit_logs, 최고관리자 전용)
 * SQL: pickle_admin_audit_unban_117.sql
 */
(function () {
  'use strict';

  var rows = [];
  var loaded = false;

  var TABLE_LABEL = {
    system_settings: '시스템 설정',
    pickle_feed_config: '메인 노출 알고리즘',
    cs_settings: 'CS 설정',
    user_roles: '관리자 권한',
    users: '회원 상태',
    posts: '불판',
    comments: '댓글',
    reports: '신고',
    inquiries: '1:1 문의',
    penalty_logs: '제재 기록',
    notices: '공지사항',
    faqs: 'FAQ',
    events: '이벤트',
    popups: '팝업',
    banned_keywords: '금칙어',
    categories: '카테고리',
  };
  var OP_LABEL = { insert: '등록', update: '변경', delete: '삭제' };
  var SPECIAL = { 'user.ban': '🚫 영구 차단', 'user.unban': '🔓 차단 해제', 'post_appeal.accept': '✅ 이의제기 승인(재게시)', 'post_appeal.reject': '⛔ 이의제기 반려' };
  var GROUPS = {
    sanction: ['user.ban', 'user.unban', 'post_appeal.accept', 'post_appeal.reject', 'users.update', 'penalty_logs.insert', 'reports.update', 'posts.update', 'comments.update'],
    settings: ['system_settings.update', 'pickle_feed_config.update', 'cs_settings.update', 'user_roles.insert', 'user_roles.update', 'user_roles.delete'],
    content: ['notices', 'faqs', 'events', 'popups', 'banned_keywords', 'categories', 'inquiries'],
  };
  var ROLE_LABEL = { super: '최고관리자', marketer: '마케터', cs: 'CS 매니저', account: '재무/정산' };

  function sb() {
    if (typeof window.getPickleSupabaseClient === 'function') return window.getPickleSupabaseClient();
    if (window.supabaseClient) return window.supabaseClient;
    throw new Error('Supabase 클라이언트를 초기화할 수 없습니다.');
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function p2(n) {
    return String(n).padStart(2, '0');
  }

  function fmt(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + p2(d.getMonth() + 1) + '.' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  }

  function actionLabel(a) {
    if (SPECIAL[a]) return SPECIAL[a];
    var parts = String(a || '').split('.');
    var t = TABLE_LABEL[parts[0]] || parts[0];
    if (a === 'user_roles.insert') return '관리자 권한 부여';
    if (a === 'user_roles.delete') return '관리자 권한 회수';
    if (a === 'penalty_logs.insert') return '제재/벌점 기록 추가';
    return t + ' ' + (OP_LABEL[parts[1]] || parts[1] || '');
  }

  function short(v, n) {
    v = String(v == null ? '' : v);
    return v.length > n ? v.slice(0, n) + '…' : v;
  }

  function detailText(r) {
    var d = r.detail;
    if (!d || typeof d !== 'object') return '';
    if (d.row) {
      return Object.keys(d.row)
        .map(function (k) {
          return k + ': ' + short(d.row[k], 60);
        })
        .join(' · ');
    }
    if (d.reason !== undefined || d.reset_points !== undefined) {
      var out = [];
      if (d.reason) out.push('사유: ' + short(d.reason, 80));
      if (d.reset_points) out.push('벌점 초기화');
      return out.join(' · ');
    }
    return Object.keys(d)
      .map(function (k) {
        var c = d[k] || {};
        return k + ': ' + short(c.from, 40) + ' → ' + short(c.to, 40);
      })
      .join(' / ');
  }

  function matchesGroup(r, g) {
    if (!g) return true;
    var list = GROUPS[g] || [];
    return list.some(function (x) {
      return r.action === x || String(r.action).indexOf(x + '.') === 0;
    });
  }

  function render() {
    var tbody = document.getElementById('auditLogBody');
    if (!tbody) return;
    var g = (document.getElementById('auditGroup') || {}).value || '';
    var q = ((document.getElementById('auditSearch') || {}).value || '').trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (!matchesGroup(r, g)) return false;
      if (!q) return true;
      return [r.actor_email, r.target_label, r.target_id, actionLabel(r.action), detailText(r)]
        .join(' ')
        .toLowerCase()
        .indexOf(q) !== -1;
    });
    var cnt = document.getElementById('auditCount');
    if (cnt) cnt.textContent = list.length + '건' + (rows.length >= 300 ? ' (최근 300건까지 표시)' : '');
    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--text-sub);padding:40px;">조건에 맞는 작업 기록이 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(function (r) {
        return (
          '<tr>' +
          '<td style="white-space:nowrap;color:var(--text-sub);font-size:0.82rem;">' + esc(fmt(r.created_at)) + '</td>' +
          '<td style="font-size:0.85rem;"><div style="color:#fff;font-weight:600;">' + esc(r.actor_email || '(알 수 없음)') + '</div>' +
          '<div style="color:var(--text-sub);font-size:0.75rem;">' + esc(ROLE_LABEL[r.actor_role] || r.actor_role || '') + '</div></td>' +
          '<td style="font-weight:700;white-space:nowrap;">' + esc(actionLabel(r.action)) + '</td>' +
          '<td style="font-size:0.85rem;">' + esc(short(r.target_label || r.target_id || '', 40)) + '</td>' +
          '<td style="font-size:0.8rem;color:var(--text-sub);word-break:break-all;">' + esc(detailText(r)) + '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  async function load() {
    var tbody = document.getElementById('auditLogBody');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--text-sub);padding:40px;">불러오는 중...</td></tr>';
    }
    try {
      var res = await sb()
        .from('admin_audit_logs')
        .select('id, created_at, actor_email, actor_role, action, target_type, target_id, target_label, detail')
        .order('created_at', { ascending: false })
        .limit(300);
      if (res.error) throw res.error;
      rows = res.data || [];
      loaded = true;
      render();
    } catch (err) {
      console.error('[Admin Audit] 불러오기 실패:', err);
      var needSql = /admin_audit_logs|relation|schema cache/i.test(String(err && err.message));
      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="5" style="text-align:center;color:var(--neon-pink);padding:40px;">' +
          (needSql
            ? '작업 기록 테이블이 아직 없습니다. Supabase에서 pickle_admin_audit_unban_117.sql 을 먼저 실행해 주세요.'
            : '작업 기록을 불러오지 못했습니다: ' + esc(err && err.message)) +
          '</td></tr>';
      }
    }
  }

  window.PickleAdminAudit = {
    load: load,
    render: render,
    ensureLoaded: function () {
      if (!loaded) load();
    },
  };
})();
