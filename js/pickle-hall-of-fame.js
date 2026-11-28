/**
 * P!CKLE — 🏅 전당 후보작 (hall_of_fame.html)
 * 알고리즘(허들·4대 천왕)은 supabase/24_notification_triggers.sql honor 알림과 동기화됨
 * 허들(활성 유저 수 포함)은 서버 함수 pickle_hall_hurdle_info() 로 계산 — 브라우저는 다른 회원의 투표를 읽을 수 없어
 * 예전 방식(브라우저 집계)은 늘 최소값(50표)만 나왔음. (함수가 없을 때만 예전 방식으로 대체)
 */
(function () {
  'use strict';

  var BASE_MIN_VOTES = 50;
  var ACTIVE_USER_DAYS = 30;
  var ACTIVE_USER_RATE = 0.05;

  var BADGE_DEFS = [
    {
      id: 'scale',
      emoji: '⚔️',
      label: '신의 저울',
      className: 'hof-badge--scale',
      test: function (ctx) {
        return ctx.pctA >= 49 && ctx.pctA <= 51;
      },
    },
    {
      id: 'landslide',
      emoji: '👊',
      label: '반박불가 팩폭',
      className: 'hof-badge--landslide',
      test: function (ctx) {
        return ctx.pctA >= 90 || ctx.pctB >= 90;
      },
    },
    {
      id: 'debate',
      emoji: '📢',
      label: '방구석 100분 토론',
      className: 'hof-badge--debate',
      test: function (ctx) {
        return ctx.totalVotes > 0 && ctx.commentCount / ctx.totalVotes >= 0.3;
      },
    },
    {
      id: 'dopamine',
      emoji: '🚀',
      label: '도파민 급발진',
      className: 'hof-badge--dopamine',
      test: function (ctx) {
        return ctx.durationHours > 0 && ctx.totalVotes / ctx.durationHours >= 10;
      },
    },
  ];

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getClient() {
    if (!window.PickleSupabase || !window.PickleSupabase.getClient) {
      throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
    }
    return window.PickleSupabase.getClient();
  }

  function getFeedApi() {
    if (!window.PickleFeed) throw new Error('PickleFeed 모듈을 불러오지 못했습니다.');
    return window.PickleFeed;
  }

  function calcVotePercent(votesA, votesB) {
    var a = Number(votesA) || 0;
    var b = Number(votesB) || 0;
    var total = a + b;
    if (total === 0) return { pctA: 50, pctB: 50, total: 0 };
    var pctA = Math.round((a / total) * 100);
    return { pctA: pctA, pctB: 100 - pctA, total: total };
  }

  function getPostDurationHours(post) {
    if (!post) return 0;
    var start = post.created_at ? new Date(post.created_at).getTime() : NaN;
    var endRaw = post.expires_at;
    var end = endRaw ? new Date(endRaw).getTime() : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    var hours = (end - start) / (1000 * 60 * 60);
    return hours > 0 ? hours : 0;
  }

  function buildBadgeContext(post) {
    var pct = calcVotePercent(post.votesA, post.votesB);
    return {
      pctA: pct.pctA,
      pctB: pct.pctB,
      totalVotes: pct.total,
      commentCount: Number(post.commentCount) || 0,
      durationHours: getPostDurationHours(post),
    };
  }

  function resolveBadges(post) {
    var ctx = buildBadgeContext(post);
    return BADGE_DEFS.filter(function (def) {
      try {
        return def.test(ctx);
      } catch (_) {
        return false;
      }
    });
  }

  function computeVoteHurdle(activeUserCount) {
    var dynamic = Math.ceil(Number(activeUserCount) * ACTIVE_USER_RATE);
    return Math.max(BASE_MIN_VOTES, dynamic);
  }

  async function fetchActiveUserCount(sb) {
    var sinceIso = new Date(
      Date.now() - ACTIVE_USER_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    var activeIds = new Set();

    try {
      var voteRes = await sb
        .from('votes')
        .select('user_id')
        .gte('created_at', sinceIso);

      if (!voteRes.error) {
        (voteRes.data || []).forEach(function (row) {
          if (row && row.user_id) activeIds.add(row.user_id);
        });
      }
    } catch (err) {
      console.warn('[P!CKLE Hall] votes 활성 유저 집계 실패', err);
    }

    try {
      var commentRes = await sb
        .from('comments')
        .select('user_id')
        .gte('created_at', sinceIso)
        .eq('visibility_status', 'visible');

      if (!commentRes.error) {
        (commentRes.data || []).forEach(function (row) {
          if (row && row.user_id) activeIds.add(row.user_id);
        });
      }
    } catch (err) {
      console.warn('[P!CKLE Hall] comments 활성 유저 집계 실패', err);
    }

    return activeIds.size;
  }

  async function fetchHurdleInfo(sb) {
    try {
      var res = await sb.rpc('pickle_hall_hurdle_info');
      if (!res.error && res.data && res.data.hurdle != null) {
        return {
          hurdle: Number(res.data.hurdle) || BASE_MIN_VOTES,
          activeUsers: Number(res.data.active_users) || 0,
        };
      }
    } catch (err) {
      console.warn('[P!CKLE Hall] 서버 허들 조회 실패 — 브라우저 계산으로 대체', err);
    }
    var activeUsers = await fetchActiveUserCount(sb);
    return { hurdle: computeVoteHurdle(activeUsers), activeUsers: activeUsers };
  }

  /** 관리자 검토 결과: 제외된 불판은 숨기고, 선정된 불판은 허들과 무관하게 공식 등재로 표시 (155 SQL 적용 전에는 빈 값) */
  async function fetchDecisions(sb) {
    try {
      var res = await sb.rpc('pickle_hall_decisions_public');
      if (!res.error && res.data) {
        return {
          excluded: new Set((res.data.excluded || []).map(String)),
          approved: new Set((res.data.approved || []).map(String)),
        };
      }
    } catch (err) {
      console.warn('[P!CKLE Hall] 검토 결과 조회 실패 — 자동 기준만 적용', err);
    }
    return { excluded: new Set(), approved: new Set() };
  }

  async function fetchApprovedPosts(missingIds) {
    if (!missingIds.length) return [];
    var feed = getFeedApi();
    var result = await feed.fetchPostRows(function (q) {
      return q.eq('visibility_status', 'visible').in('id', missingIds);
    });
    if (result.error) return [];
    return feed.enrichRowsToPosts(result.rows, result.source);
  }

  async function fetchEndedPostRows() {
    var feed = getFeedApi();
    var nowIso = new Date().toISOString();

    return feed.fetchPostRows(function (q) {
      return q
        .eq('visibility_status', 'visible')
        .lt('expires_at', nowIso)
        .order('expires_at', { ascending: false })
        .limit(180);
    });
  }

  function passesVoteHurdle(post, hurdle) {
    var total = Number(post.totalVotes) || 0;
    return total >= hurdle;
  }

  function passesLegendBadgeFilter(post) {
    return resolveBadges(post).length > 0;
  }

  function renderBadgeRow(badges, approved) {
    if ((!badges || !badges.length) && !approved) return '';

    var html = (approved
      ? '<span class="hof-badge hof-badge--approved">' + escapeHtml('🏅 공식 선정') + '</span>'
      : '') + (badges || [])
      .map(function (b) {
        return (
          '<span class="hof-badge ' +
          b.className +
          '">' +
          escapeHtml(b.emoji + ' ' + b.label) +
          '</span>'
        );
      })
      .join('');

    return '<div class="hof-badge-row">' + html + '</div>';
  }

  function renderHallResultMeta(post) {
    var pct = calcVotePercent(post.votesA, post.votesB);
    return (
      '<div class="hof-result-meta">' +
      '<span class="hof-result-pct hof-result-pct--a">A ' +
      pct.pctA +
      '%</span>' +
      '<span class="hof-result-vs">VS</span>' +
      '<span class="hof-result-pct hof-result-pct--b">B ' +
      pct.pctB +
      '%</span>' +
      '<span class="hof-result-votes">🔥 ' +
      pct.total.toLocaleString() +
      '표 · 💬 ' +
      (Number(post.commentCount) || 0).toLocaleString() +
      '</span>' +
      '</div>'
    );
  }

  function buildHallCardHtml(post) {
    if (!post || post.id == null) return '';

    var badges = resolveBadges(post);
    var feed = getFeedApi();
    var thumbHtml =
      typeof feed.renderCardThumbTop === 'function'
        ? feed.renderCardThumbTop(post)
        : '';

    var sponsorClass = post.is_sponsor ? ' sponsor-card' : '';

    return (
      '<article class="hof-card list-card' +
      sponsorClass +
      '" data-id="' +
      escapeHtml(post.id) +
      '" role="button" tabindex="0">' +
      renderBadgeRow(badges, post._hallApproved) +
      thumbHtml +
      '<div class="card-body">' +
      '<h3 class="title">' +
      escapeHtml(post.title || '제목 없음') +
      '</h3>' +
      renderHallResultMeta(post) +
      '</div>' +
      '</article>'
    );
  }

  function bindCardNavigation(container) {
    if (!container || !window.PickleFeed) return;
    container.querySelectorAll('.hof-card[data-id]').forEach(function (card) {
      var id = card.dataset.id;
      if (!id) return;
      card.addEventListener('click', function () {
        window.PickleFeed.goDetail(id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.PickleFeed.goDetail(id);
        }
      });
    });
  }

  function updateHurdleDisplay(hurdle, activeUsers) {
    var el = document.getElementById('hofHurdleMeta');
    if (!el) return;
    el.textContent =
      '현재 허들: 최소 ' +
      hurdle.toLocaleString() +
      '표 · 최근 30일 활성 유저 ' +
      activeUsers.toLocaleString() +
      '명 기준';
  }

  function emptyHtml() {
    return (
      '<div class="feed-empty">' +
      '<p class="feed-empty-title">아직 전당 후보 조건을 충족한<br>레전드 불판이 없습니다.</p>' +
      '<p style="font-size:0.8rem;color:var(--text-sub);margin:0;">4대 천왕 뱃지 조건을 만족하고<br>동적 허들을 넘긴 종료 불판만 표시됩니다.</p>' +
      '</div>'
    );
  }

  async function loadHallOfFame() {
    var container = document.getElementById('hofFeedList');
    if (!container) return;

    var feed = getFeedApi();
    feed.showLoading(container);

    try {
      if (window.PickleCategories && window.PickleCategories.load) {
        await window.PickleCategories.load();
      }

      var sb = getClient();
      var hurdleInfo = await fetchHurdleInfo(sb);
      var activeUsers = hurdleInfo.activeUsers;
      var hurdle = hurdleInfo.hurdle;
      updateHurdleDisplay(hurdle, activeUsers);

      var result = await fetchEndedPostRows();
      if (result.error) {
        throw new Error(result.error.message || String(result.error));
      }

      var posts = await feed.enrichRowsToPosts(result.rows, result.source);

      var decisions = await fetchDecisions(sb);

      // 관리자가 선정한 불판 중 위 목록(최근 180건)에 없는 것도 가져옴
      var have = new Set(posts.map(function (p) { return String(p.id); }));
      var missing = Array.from(decisions.approved).filter(function (id) { return !have.has(id); });
      if (missing.length) {
        try {
          posts = posts.concat(await fetchApprovedPosts(missing));
        } catch (err) {
          console.warn('[P!CKLE Hall] 선정 불판 추가 조회 실패', err);
        }
      }

      posts = posts
        .filter(function (p) {
          return !decisions.excluded.has(String(p.id));
        })
        .filter(function (p) {
          var approved = decisions.approved.has(String(p.id));
          p._hallApproved = approved;
          return approved || (passesVoteHurdle(p, hurdle) && passesLegendBadgeFilter(p));
        })
        .sort(function (a, b) {
          if (!!b._hallApproved !== !!a._hallApproved) return b._hallApproved ? 1 : -1;
          return (Number(b.totalVotes) || 0) - (Number(a.totalVotes) || 0);
        });

      if (!posts.length) {
        container.innerHTML = emptyHtml();
        return;
      }

      var htmlParts = [];
      posts.forEach(function (post) {
        var card = buildHallCardHtml(post);
        if (card) htmlParts.push(card);
      });

      container.style.opacity = '0';
      container.innerHTML = htmlParts.join('');
      bindCardNavigation(container);
      requestAnimationFrame(function () {
        container.style.transition = 'opacity 0.3s ease';
        container.style.opacity = '1';
      });
    } catch (err) {
      console.error('[P!CKLE Hall]', err);
      container.innerHTML =
        '<div class="feed-empty feed-error">전당 후보작을 불러오지 못했습니다.<p style="font-size:0.75rem;margin-top:8px;word-break:break-all;">' +
        escapeHtml(err.message || String(err)) +
        '</p></div>';
    }
  }

  window.PickleHallOfFame = {
    load: loadHallOfFame,
    computeVoteHurdle: computeVoteHurdle,
    resolveBadges: resolveBadges,
  };

  document.addEventListener('DOMContentLoaded', loadHallOfFame);
})();
