/**
 * P!CKLE Admin — dashboard KPI + Top 5 불판
 */
(function () {
  'use strict';

  function getClient() {
    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) return window.supabaseClient;
    throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
  }

  function formatKpi(value) {
    return Number(value || 0).toLocaleString();
  }

  function setKpiText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = formatKpi(value);
  }

  function setRevenueText(text) {
    var el = document.getElementById('dashboard-total-revenue');
    if (el) el.textContent = text;
  }

  var INQUIRY_TYPE_LABELS = {
    general: '일반',
    account: '계정/로그인',
    point: '포인트/리워드',
    ad: '광고',
    report: '신고/제재',
    other: '기타',
  };

  function inquiryTypeLabel(type) {
    return INQUIRY_TYPE_LABELS[type] || type || '일반';
  }

  function formatRelativeTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    var diffMs = Date.now() - d.getTime();
    if (diffMs < 0) diffMs = 0;
    var mins = Math.floor(diffMs / 60000);
    if (mins < 1) return '방금 전';
    if (mins < 60) return mins + '분 전';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + '시간 전';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + '일 전';
    return formatDateShort(iso);
  }

  function formatDateShort(iso) {
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return (
      d.getFullYear() +
      '.' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '.' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function extractVoteSum(data) {
    if (!data || !data.length) return 0;
    var row = data[0];
    if (row.sum != null) return Number(row.sum) || 0;
    if (row['vote_count.sum'] != null) return Number(row['vote_count.sum']) || 0;
    return 0;
  }

  async function sumPostVoteCounts(sb) {
    var total = 0;
    var from = 0;
    var pageSize = 1000;

    while (true) {
      var res = await sb.from('posts').select('vote_count').range(from, from + pageSize - 1);
      if (res.error) throw res.error;
      if (!res.data || !res.data.length) break;
      res.data.forEach(function (row) {
        total += Number(row.vote_count) || 0;
      });
      if (res.data.length < pageSize) break;
      from += pageSize;
    }

    return total;
  }

  async function loadSponsorRevenue(sb) {
    try {
      var res = await sb.from('sponsor_settlements').select('paid_amount_krw');
      if (res.error) throw res.error;
      var total = (res.data || []).reduce(function (sum, row) {
        return sum + (Number(row.paid_amount_krw) || 0);
      }, 0);
      setRevenueText('₩ ' + Math.round(total).toLocaleString('ko-KR'));
    } catch (err) {
      console.warn('[Admin Dashboard] sponsor revenue', err);
      setRevenueText('₩ 0');
    }
  }

  async function loadTotalVotes(sb) {
    try {
      var agg = await sb.from('posts').select('vote_count.sum()');
      if (!agg.error && agg.data) {
        setKpiText('dashboard-total-votes', extractVoteSum(agg.data));
        return;
      }
      setKpiText('dashboard-total-votes', await sumPostVoteCounts(sb));
    } catch (err) {
      console.warn('[Admin Dashboard] total votes', err);
      setKpiText('dashboard-total-votes', 0);
    }
  }

  function renderCsList(rows) {
    var container = document.getElementById('dashboard-cs-list');
    if (!container) return;

    if (!rows || !rows.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = rows
      .map(function (row) {
        var title = row.title ? String(row.title).trim() : '제목 없음';
        var typeLabel = inquiryTypeLabel(row.inquiry_type);
        if (typeLabel) title = title + ' (' + typeLabel + ')';

        var userMeta = row.users || {};
        var author = userMeta.nickname ? String(userMeta.nickname).trim() : '알 수 없음';
        var urgentBadge =
          row.inquiry_type === 'report'
            ? '<span class="badge-urgent">긴급</span>'
            : '';

        return (
          '<div class="list-item" onclick="location.href=\'admin_cs.html\'">' +
          '<div>' +
          '<div class="cs-title">' +
          escapeHtml(title) +
          '</div>' +
          '<div class="cs-meta">' +
          '<span>작성자: ' +
          escapeHtml(author) +
          '</span>' +
          '<span>' +
          escapeHtml(formatRelativeTime(row.created_at)) +
          '</span>' +
          '</div>' +
          '</div>' +
          urgentBadge +
          '</div>'
        );
      })
      .join('');
  }

  async function loadPendingInquiries(sb) {
    var container = document.getElementById('dashboard-cs-list');
    if (!container) return;

    try {
      var res = await sb
        .from('inquiries')
        .select('id, inquiry_type, title, status, created_at, users:user_id ( nickname )')
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(3);

      if (res.error) {
        console.warn('[Admin Dashboard] inquiries 조회 실패:', res.error);
        container.innerHTML = '';
        return;
      }

      renderCsList(res.data || []);
    } catch (err) {
      console.warn('[Admin Dashboard] loadPendingInquiries', err);
      container.innerHTML = '';
    }
  }

  function getTodayStartIso() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  function setStatText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function resetAnalyticsPlaceholders() {
    setKpiText('dashboard-today-votes', 0);
    setKpiText('dashboard-today-posts', 0);
    setKpiText('valIssue', 0);
    setKpiText('valBurn', 0);
    setKpiText('valDebt', 0);
  }

  // 오늘 투표/새 불판 + 포인트 경제 지표 (RPC: admin_dashboard_extra)
  async function loadDashboardExtra(sb, todayStart) {
    try {
      var res = await sb.rpc('admin_dashboard_extra', { p_today_start: todayStart });
      if (res.error || !Array.isArray(res.data) || !res.data[0]) throw res.error || new Error('no data');
      var d = res.data[0];
      setKpiText('dashboard-today-votes', d.today_votes);
      setKpiText('dashboard-today-posts', d.today_posts);
      setKpiText('valIssue', d.points_issued);
      setKpiText('valBurn', d.points_burned);
      setKpiText('valDebt', d.points_outstanding);
    } catch (err) {
      console.warn('[Admin Dashboard] admin_dashboard_extra 미적용 또는 실패', err);
      resetAnalyticsPlaceholders();
    }
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolvePostTitle(post) {
    if (post.title && String(post.title).trim()) return String(post.title).trim();
    var a = post.option_a_name ? String(post.option_a_name).trim() : '';
    var b = post.option_b_name ? String(post.option_b_name).trim() : '';
    if (a || b) return (a || 'A') + ' vs ' + (b || 'B');
    return '제목 없음';
  }

  function renderTopPosts(posts) {
    var container = document.getElementById('dashboard-top-posts');
    if (!container) return;

    if (!posts || !posts.length) {
      container.innerHTML =
        '<div class="list-item" style="justify-content:center;color:#71717a;cursor:default;">표시할 불판이 없습니다.</div>';
      return;
    }

    container.innerHTML = posts
      .map(function (post, index) {
        var rank = index + 1;
        var rankStyle = rank >= 3 ? ' style="color:#52525b;"' : '';
        var title = resolvePostTitle(post);
        if (post.is_sponsor && title.indexOf('[스폰서]') === -1) {
          title = '[스폰서] ' + title;
        }
        var detailUrl = 'admin_post_detail.html?id=' + encodeURIComponent(post.id);

        return (
          '<div class="list-item" onclick="location.href=\'' +
          detailUrl +
          '\'">' +
          '<div class="trend-left">' +
          '<span class="trend-rank"' +
          rankStyle +
          '>' +
          rank +
          '</span>' +
          '<span class="trend-title">' +
          escapeHtml(title) +
          '</span>' +
          '</div>' +
          '<span class="trend-stats">투표 ' +
          formatKpi(post.vote_count) +
          ' / 참견 ' +
          formatKpi(post.comment_count) +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function resetDashboardFallbacks() {
    setKpiText('dashboard-total-users', 0);
    setKpiText('dashboard-total-votes', 0);
    setRevenueText('₩ 0');
    setKpiText('dashboard-active-posts', 0);
    setKpiText('dashboard-today-users', 0);
    setKpiText('dashboard-today-reports', 0);
    resetAnalyticsPlaceholders();
    renderTopPosts([]);
    renderCsList([]);
  }

  // 관리자/스폰서/대행사 등 user_roles 에 등록된 내부·파트너 계정은 "회원"이 아니므로
  // 대시보드의 총 회원수/오늘 가입 수에서 제외한다. RPC(admin_user_counts)가 아직
  // 배포되지 않은 환경(SQL 미적용)에서는 예전 방식(내부 계정 포함한 단순 count)으로
  // 자동 대체되어 대시보드 자체가 깨지지는 않는다.
  async function loadUserCounts(sb, todayStart) {
    var rpcResult = await sb.rpc('admin_user_counts', { p_today_start: todayStart });
    if (!rpcResult.error && Array.isArray(rpcResult.data) && rpcResult.data[0]) {
      return {
        total: rpcResult.data[0].total_count ?? 0,
        today: rpcResult.data[0].today_count ?? 0,
      };
    }
    console.warn('[Admin Dashboard] admin_user_counts RPC 미적용, 단순 count 로 대체(내부 계정 포함될 수 있음)', rpcResult.error);
    var fallback = await Promise.all([
      sb.from('users').select('*', { count: 'exact', head: true }),
      sb.from('users').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    ]);
    if (fallback[0].error) throw fallback[0].error;
    if (fallback[1].error) throw fallback[1].error;
    return { total: fallback[0].count ?? 0, today: fallback[1].count ?? 0 };
  }

  async function loadDashboardKPIs() {
    try {
      var sb = getClient();
      var nowIso = new Date().toISOString();
      var todayStart = getTodayStartIso();

      var results = await Promise.all([
        loadUserCounts(sb, todayStart),
        sb
          .from('posts')
          .select('*', { count: 'exact', head: true })
          .eq('visibility_status', 'visible')
          .or('expires_at.is.null,expires_at.gt.' + JSON.stringify(nowIso)),
        sb
          .from('reports')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayStart),
        sb
          .from('posts')
          .select('id, title, option_a_name, option_b_name, vote_count, comment_count, is_sponsor')
          .order('vote_count', { ascending: false })
          .limit(5),
      ]);

      if (results[1].error) throw results[1].error;
      if (results[2].error) throw results[2].error;
      if (results[3].error) throw results[3].error;

      setKpiText('dashboard-total-users', results[0].total);
      setKpiText('dashboard-active-posts', results[1].count ?? 0);
      setKpiText('dashboard-today-users', results[0].today);
      setKpiText('dashboard-today-reports', results[2].count ?? 0);
      renderTopPosts(results[3].data || []);

      await Promise.all([loadTotalVotes(sb), loadPendingInquiries(sb), loadSponsorRevenue(sb), loadDashboardExtra(sb, todayStart)]);
    } catch (err) {
      console.error('[Admin Dashboard] loadDashboardKPIs', err);
      resetDashboardFallbacks();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadDashboardKPIs);
  } else {
    loadDashboardKPIs();
  }

  window.loadDashboardKPIs = loadDashboardKPIs;
})();
