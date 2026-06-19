/**
 * P!CKLE — event.html 이벤트 DB 연동
 * @build 20260613_events11
 */
(function () {
  'use strict';

  var EMPTY_MSG = '이벤트가 없습니다.';
  var eventRows = [];
  var eventMap = new Map();
  var currentEventId = null;
  var currentEventData = null;
  var participatedIds = new Set();
  var detailBarRenderSeq = 0;
  var detailHistoryActive = false;
  var suppressDetailPopstate = false;
  var PARTICIPATE_DONE_MSG = '🎉 응모가 완료되었습니다! 당첨자 발표일을 기대해 주세요.';

  var SHARE_PROMO_TEXT = '지금 P!CKLE에서 혜택을 확인해 보세요!';
  var NATIVE_SHARE_TEXT = '🎁 픽클 이벤트에 참여하고 혜택을 받아보세요!';
  var SHARE_SITE_ORIGIN = 'https://pickleplay.kr';
  var SHARE_EVENT_PAGE = SHARE_SITE_ORIGIN + '/user_app/event.html';
  var DEFAULT_EVENT_SHARE_IMAGE = SHARE_SITE_ORIGIN + '/images/default_share.jpg';

  var ONGOING_NOTICE_LINES = [
    '당첨자는 이벤트 마감 후 3~7일 이내에 푸시 알림으로 안내됩니다.',
    '종료된 해당 이벤트에서 당첨자 리스트를 확인하실 수 있습니다.',
    '당첨자 아래 "경품 수령 정보 입력하기"를 클릭해서 입력해 주십시오.',
  ];

  var ENDED_NOTICE_SECTIONS = [
    {
      label: '경품 지급 안내',
      text: '당첨 시 제출해주신 구글 폼 연락처를 통해 개별 문자(또는 카카오톡)로 직접 발송합니다.',
    },
    {
      label: '당첨 취소',
      text: '당첨자 발표 후 7일 이내에 경품 수령 정보를 입력하지 않으실 경우, 당첨이 취소되며 추가 보상은 불가합니다.',
    },
    {
      label: '개인정보 활용',
      text: '수집된 개인정보는 경품 발송 목적으로만 사용되며, 발송 완료 후 안전하게 파기됩니다.',
    },
  ];

  function buildOngoingNoticeHtml() {
    return (
      '<div class="d-notice-box">' +
      '<div class="notice-title">📌 꼭 확인해주세요</div>' +
      '<ul class="notice-list">' +
      ONGOING_NOTICE_LINES.map(function (line) {
        return '<li>' + escapeHtml(line) + '</li>';
      }).join('') +
      '</ul>' +
      '</div>'
    );
  }

  function buildEndedNoticeHtml() {
    return (
      '<div class="d-notice-box">' +
      '<div class="notice-title">📌 꼭 확인해주세요!</div>' +
      ENDED_NOTICE_SECTIONS.map(function (section) {
        return (
          '<div class="notice-section">' +
          '<div class="notice-subtitle">' +
          escapeHtml(section.label) +
          '</div>' +
          '<p class="notice-section-text">- ' +
          escapeHtml(section.text) +
          '</p>' +
          '</div>'
        );
      }).join('') +
      '</div>'
    );
  }

  function getEventGoogleFormUrl(row) {
    if (!row) return '';
    return String(row.google_form_url || row.winner_form_url || '').trim();
  }

  function ensureAbsoluteShareUrl(value, fallback) {
    var raw = value ? String(value).trim() : '';
    if (!raw) return fallback;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.indexOf('//') === 0) return 'https:' + raw;
    if (raw.charAt(0) === '/') return SHARE_SITE_ORIGIN + raw;
    return SHARE_SITE_ORIGIN + '/' + raw;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getClient() {
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.getClient) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
  }

  function parseDateOnly(value) {
    if (!value) return null;
    var parts = String(value).slice(0, 10).split('-');
    if (parts.length !== 3) return null;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function todayDateOnly() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function formatPeriod(startDate, endDate) {
    var s = String(startDate || '').slice(0, 10).replace(/-/g, '.');
    var e = String(endDate || '').slice(0, 10).replace(/-/g, '.');
    return s + ' ~ ' + e;
  }

  function calcDday(endDate) {
    var end = parseDateOnly(endDate);
    if (!end) return null;
    var diff = Math.ceil((end.getTime() - todayDateOnly().getTime()) / 86400000);
    if (diff < 0) return null;
    if (diff === 0) return 'D-Day';
    return 'D-' + diff;
  }

  function isEndedRow(row) {
    return row.status === 'ended' || calcDday(row.end_date) === null;
  }

  function descToHtml(text) {
    var raw = String(text || '').trim();
    if (!raw) return '';
    if (raw.indexOf('<') !== -1) return raw;
    return escapeHtml(raw).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function buildThumbInner(row, ended) {
    if (row.thumbnail_url) {
      return (
        '<img src="' +
        escapeHtml(row.thumbnail_url) +
        '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" decoding="async">'
      );
    }
    var text = row.thumb_text || row.title || '';
    var cls = 'event-thumb-text' + (ended ? ' ended' : '');
    return '<div class="' + cls + '">' + text + '</div>';
  }

  function buildPointTagHtml(points, suffix) {
    var n = Number(points) || 0;
    if (n <= 0) return '';
    var label = suffix || '응모 시 +' + n.toLocaleString('ko-KR') + 'P';
    return (
      '<span class="point-tag" style="display:inline-block;">' + escapeHtml(label) + '</span>'
    );
  }

  function buildListCardHtml(row) {
    var ended = isEndedRow(row);
    var cardClass = 'event-card' + (ended ? ' ended-card' : '');
    var headerRight = ended
      ? '<span class="status-text">종료됨</span>'
      : '<span class="dday-text">' + escapeHtml(calcDday(row.end_date) || 'D-Day') + '</span>';
    var thumbStyle = row.thumb_bg_style
      ? ' style="background:' + escapeHtml(row.thumb_bg_style) + ';"'
      : '';
    var titleStyle = ended ? ' style="color:#d4d4d8;"' : '';
    var periodStyle = ended ? ' style="margin-top: 15px;"' : '';
    var periodExtra = ended
      ? '<span class="winner-tag">🎉 당첨자 확인 ❯</span>'
      : buildPointTagHtml(row.participate_points);

    return (
      '<div class="' +
      cardClass +
      '" data-event-id="' +
      escapeHtml(row.id) +
      '" onclick="openDetail(\'' +
      escapeHtml(row.id) +
      '\')">' +
      '<div class="event-card-header">' +
      '<span class="type-badge">' +
      escapeHtml(row.join_type_label || '이벤트') +
      '</span>' +
      headerRight +
      '</div>' +
      '<div class="event-thumb"' +
      thumbStyle +
      '>' +
      buildThumbInner(row, ended) +
      '</div>' +
      '<div class="event-info">' +
      '<h3 class="event-title"' +
      titleStyle +
      '>' +
      escapeHtml(row.title) +
      '</h3>' +
      '<div class="event-period"' +
      periodStyle +
      '>' +
      '<span>' +
      escapeHtml(formatPeriod(row.start_date, row.end_date)) +
      '</span>' +
      periodExtra +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function buildWinnerItemHtml(w) {
    return (
      '<div class="winner-item"><span class="winner-nickname">' +
      escapeHtml(w && w.nickname ? w.nickname : '—') +
      '</span></div>'
    );
  }

  function winnersHaveRank(winners) {
    return winners.some(function (w) {
      return w && w.rank != null && String(w.rank).trim() !== '';
    });
  }

  function compareRankKeys(a, b) {
    var na = /^\d+$/.test(a) ? Number(a) : NaN;
    var nb = /^\d+$/.test(b) ? Number(b) : NaN;
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), 'ko');
  }

  function formatRankLabel(rank) {
    if (rank == null || rank === '') return '당첨';
    var s = String(rank);
    if (/^\d+$/.test(s)) return s + '등';
    return s;
  }

  function groupWinnersByRank(winners) {
    var map = new Map();
    winners.forEach(function (w) {
      var key =
        w && w.rank != null && String(w.rank).trim() !== ''
          ? String(w.rank).trim()
          : '__flat__';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(w);
    });
    var keys = Array.from(map.keys()).filter(function (k) {
      return k !== '__flat__';
    });
    keys.sort(compareRankKeys);
    if (map.has('__flat__')) keys.push('__flat__');
    return keys.map(function (key) {
      return { rank: key === '__flat__' ? null : key, items: map.get(key) };
    });
  }

  function buildWinnerListBodyHtml(winners) {
    if (!winners.length) return '';
    if (winnersHaveRank(winners)) {
      var groups = groupWinnersByRank(winners);
      return groups
        .map(function (group) {
          var rankLabel =
            group.rank != null
              ? '<div style="font-size:0.78rem;font-weight:900;color:var(--theme-gold);margin-bottom:8px;letter-spacing:0.04em;">' +
                escapeHtml(formatRankLabel(group.rank)) +
                '</div>'
              : '';
          return (
            '<div style="margin-bottom:14px;">' +
            rankLabel +
            '<div class="winner-list-wrap">' +
            group.items.map(buildWinnerItemHtml).join('') +
            '</div></div>'
          );
        })
        .join('');
    }
    return (
      '<div class="winner-list-wrap">' + winners.map(buildWinnerItemHtml).join('') + '</div>'
    );
  }

  function buildWinnerBoxHtml(row) {
    var winners = Array.isArray(row.winners) ? row.winners : [];
    if (!winners.length && !row.winner_box_title) return '';
    return (
      '<div class="winner-box">' +
      '<h3 class="winner-title">' +
      escapeHtml(row.winner_box_title || '🎉 당첨자 발표') +
      '</h3>' +
      buildWinnerListBodyHtml(winners) +
      '</div>'
    );
  }

  function buildBannerHtml(row) {
    if (row.detail_banner_url) {
      return (
        '<div class="detail-banner-section">' +
        '<img src="' +
        escapeHtml(row.detail_banner_url) +
        '" alt="" style="width:100%;height:auto;display:block;" loading="lazy" decoding="async">' +
        '</div>'
      );
    }
    var emoji = endedThumbEmoji(row);
    return (
      '<div class="detail-banner-section">' +
      '<div class="long-banner-placeholder">' +
      '<div style="font-size:3.5rem; margin-bottom:10px;">' +
      emoji +
      '</div>' +
      '<div class="banner-text">' +
      escapeHtml(row.title) +
      '</div>' +
      '<div class="banner-sub">이벤트 상세 프로모션 배너</div>' +
      '</div>' +
      '</div>'
    );
  }

  function endedThumbEmoji(row) {
    var text = String(row.thumb_text || row.title || '🎁');
    var match = text.match(/[\u{1F300}-\u{1FAFF}]/u);
    return match ? match[0] : '🎁';
  }

  function buildOngoingDetailHtml(row) {
    var dday = calcDday(row.end_date) || 'D-Day';
    return (
      '<div class="detail-title-section">' +
      '<div class="d-badge-wrap">' +
      '<span class="d-badge-dday">' +
      escapeHtml(dday + ' 마감 임박') +
      '</span>' +
      buildPointTagHtml(row.participate_points, '응모 시 +' + (Number(row.participate_points) || 0) + 'P 지급') +
      '</div>' +
      '<h2 class="d-title">' +
      escapeHtml(row.title) +
      '</h2>' +
      '<div class="d-period">⏱️ 진행 기간: ' +
      escapeHtml(formatPeriod(row.start_date, row.end_date)) +
      '</div>' +
      '</div>' +
      buildBannerHtml(row) +
      '<div class="detail-info-section">' +
      '<p class="d-desc">' +
      descToHtml(row.description) +
      '</p>' +
      buildOngoingNoticeHtml() +
      '</div>'
    );
  }

  function buildEndedDetailHtml(row) {
    return (
      '<div class="detail-title-section" style="padding-bottom:0;">' +
      '<div class="d-badge-wrap"><span class="d-badge-dday" style="background:#27272a; color:#a1a1aa; border-color:#3f3f46;">종료됨</span></div>' +
      '<h2 class="d-title">' +
      escapeHtml(row.title) +
      '</h2>' +
      '<div class="d-period">이벤트 기간: ' +
      escapeHtml(formatPeriod(row.start_date, row.end_date)) +
      '</div>' +
      '</div>' +
      '<div class="detail-info-section" style="padding-top:20px;">' +
      '<div class="d-desc">' +
      descToHtml(row.description) +
      buildWinnerBoxHtml(row) +
      buildEndedNoticeHtml() +
      '</div>' +
      '</div>'
    );
  }

  function hasParticipated(eventId) {
    return participatedIds.has(String(eventId));
  }

  function markParticipateButtonDone() {
    var btn = document.getElementById('detailParticipateBtn');
    if (!btn) return;
    btn.className = 'btn-disabled-huge';
    btn.disabled = true;
    btn.removeAttribute('onclick');
    btn.textContent = '응모 완료';
  }

  function buildParticipateButtonHtml(row) {
    if (hasParticipated(row.id)) {
      return '<button class="btn-disabled-huge" type="button" disabled id="detailParticipateBtn">응모 완료</button>';
    }
    var label = escapeHtml(row.participate_label || '응모하기');
    return (
      '<button class="btn-participate-huge" type="button" id="detailParticipateBtn" onclick="PickleEvents.participate()">' +
      label +
      '</button>'
    );
  }

  function isProfileFieldFilled(value) {
    return value != null && String(value).trim() !== '';
  }

  async function validateParticipation(row, uid) {
    var sb = getClient();
    var joinType = row.join_type;

    if (joinType === 'first_come') {
      var max = Number(row.max_participants);
      if (Number.isFinite(max) && max > 0) {
        var countRes = await sb
          .from('event_entries')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', row.id);
        if (countRes.error) throw countRes.error;
        if ((countRes.count || 0) >= max) {
          alert('선착순이 마감되었습니다.');
          return false;
        }
      }
    }

    if (joinType === 'vote_count') {
      var target = Number(row.target_vote_count);
      if (Number.isFinite(target) && target > 0) {
        var votesRes = await sb
          .from('votes')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid);
        if (votesRes.error) throw votesRes.error;
        var voteCount = votesRes.count || 0;
        if (voteCount < target) {
          alert('투표를 ' + (target - voteCount) + '회 더 참여해야 응모할 수 있습니다.');
          return false;
        }
      }
    }

    if (joinType === 'profile_complete') {
      var userRes = await sb
        .from('users')
        .select('gender, age_group, region')
        .eq('id', uid)
        .maybeSingle();
      if (userRes.error) throw userRes.error;
      var profile = userRes.data;
      if (
        !profile ||
        !isProfileFieldFilled(profile.gender) ||
        !isProfileFieldFilled(profile.age_group) ||
        !isProfileFieldFilled(profile.region)
      ) {
        alert('마이페이지에서 프로필(성별/연령대/지역)을 완성해야 응모할 수 있습니다.');
        window.location.href = 'mypage.html';
        return false;
      }
    }

    return true;
  }

  async function participateCurrent() {
    var row = currentEventData;
    if (!row || !currentEventId) return;
    if (hasParticipated(currentEventId)) return;

    try {
      var uid = await resolveAuthUid();
      if (!uid) {
        alert('로그인 후 이벤트에 응모할 수 있습니다.');
        if (window.PickleAuth && window.PickleAuth.goToLogin) {
          window.PickleAuth.goToLogin({ redirect: 'event.html?id=' + currentEventId });
        }
        return;
      }

      var allowed = await validateParticipation(row, uid);
      if (!allowed) return;

      var result = await getClient()
        .from('event_entries')
        .insert({ event_id: currentEventId, user_id: uid });

      if (result.error) {
        if (result.error.code === '23505') {
          participatedIds.add(String(currentEventId));
          markParticipateButtonDone();
          return;
        }
        throw result.error;
      }
      alert(PARTICIPATE_DONE_MSG);
      participatedIds.add(String(currentEventId));
      markParticipateButtonDone();
    } catch (err) {
      console.error('[P!CKLE Events] participate failed', err);
      alert('응모 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  function buildOngoingBottomBar(row) {
    return (
      '<button type="button" class="btn-share-huge" onclick="window.openShareSheet()">' +
      '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>' +
      '<span class="share-text">소문내기</span>' +
      '</button>' +
      buildParticipateButtonHtml(row)
    );
  }

  function openShareSheetHandler() {
    var overlay = document.getElementById('commonOverlay');
    var sheet = document.getElementById('shareSheet');
    if (!overlay || !sheet) {
      console.warn('[P!CKLE Events] share sheet elements not found');
      return;
    }
    overlay.classList.add('open');
    sheet.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function bindDetailBottomBarEvents() {
    var bottomBar = document.getElementById('detailBottomBar');
    if (!bottomBar || bottomBar.dataset.pickleEventsBound === '1') return;
    bottomBar.dataset.pickleEventsBound = '1';
    bottomBar.addEventListener('click', function (e) {
      var claimBtn = e.target.closest('#btnOpenWinnerForm, .btn-winner-claim');
      if (claimBtn) {
        e.preventDefault();
        e.stopPropagation();
        openWinnerForm();
        return;
      }
      var shareBtn = e.target.closest('.btn-share-huge');
      if (!shareBtn) return;
      e.preventDefault();
      e.stopPropagation();
      openShareSheetHandler();
    });
  }

  function normalizeUid(value) {
    return value == null ? '' : String(value).trim().toLowerCase();
  }

  async function resolveAuthUid() {
    if (window.PickleAuth) {
      if (window.PickleAuth.hasLocalSessionHint && !window.PickleAuth.hasLocalSessionHint()) {
        return null;
      }
      if (window.PickleAuth.getUser) {
        var cachedUser = window.PickleAuth.getUser();
        if (cachedUser && cachedUser.id) return String(cachedUser.id);
      }
      if (window.PickleAuth.getSessionUserFast) {
        try {
          var fastUser = await window.PickleAuth.getSessionUserFast({ timeoutMs: 500 });
          if (fastUser && fastUser.id) return String(fastUser.id);
        } catch (err) {
          console.warn('[P!CKLE Events] getSessionUserFast failed', err);
        }
      }
    }
    return null;
  }

  async function isCurrentUserWinner(row) {
    if (!row) return false;
    var authUid = await resolveAuthUid();
    if (!authUid) return false;

    var normalizedAuth = normalizeUid(authUid);
    var winners = Array.isArray(row.winners) ? row.winners : [];

    return winners.some(function (w) {
      if (!w || typeof w !== 'object') return false;
      if (w.uid == null || String(w.uid).trim() === '') return false;
      return normalizeUid(w.uid) === normalizedAuth;
    });
  }

  function buildEndedDisabledBarHtml() {
    return '<button class="btn-disabled-huge" type="button" disabled>종료된 이벤트입니다</button>';
  }

  function buildWinnerClaimButtonHtml() {
    return (
      '<button class="btn-participate-huge btn-winner-claim" type="button" id="btnOpenWinnerForm">' +
      '🎁 경품 수령 정보 입력하기' +
      '</button>'
    );
  }

  async function renderEndedBottomBar(row, eventId) {
    var bottomBar = document.getElementById('detailBottomBar');
    if (!bottomBar) return;

    var seq = ++detailBarRenderSeq;
    var targetEventId = String(eventId || row.id);

    if (!isEndedRow(row)) {
      if (seq === detailBarRenderSeq && currentEventId === targetEventId) {
        bottomBar.innerHTML = buildEndedDisabledBarHtml();
      }
      return;
    }

    bottomBar.innerHTML =
      '<button class="btn-disabled-huge" type="button" disabled>확인 중…</button>';

    var isWinner = false;
    try {
      isWinner = await isCurrentUserWinner(row);
    } catch (err) {
      console.error('[P!CKLE Events] winner check failed', err);
    }

    if (seq !== detailBarRenderSeq || currentEventId !== targetEventId) return;

    bottomBar.innerHTML = isWinner
      ? buildWinnerClaimButtonHtml()
      : buildEndedDisabledBarHtml();
  }

  function openWinnerForm() {
    var row = currentEventData;
    if (!row) {
      alert('이벤트 정보를 불러오지 못했습니다.');
      return;
    }
    var formUrl = getEventGoogleFormUrl(row);
    if (!formUrl) {
      alert('폼 링크가 준비 중입니다.');
      return;
    }
    if (!/^https?:\/\//i.test(formUrl)) {
      alert('유효하지 않은 폼 링크입니다. 고객센터로 문의해 주세요.');
      return;
    }
    var opened = window.open(formUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.href = formUrl;
    }
  }

  function setListMessage(listEl, message) {
    if (!listEl) return;
    listEl.innerHTML =
      '<div style="text-align:center;padding:48px 20px;color:#a1a1aa;font-weight:700;font-size:0.95rem;">' +
      escapeHtml(message) +
      '</div>';
  }

  function setListLoading(listEl) {
    if (!listEl) return;
    listEl.innerHTML =
      '<div style="text-align:center;padding:48px 20px;color:#a1a1aa;font-weight:700;font-size:0.95rem;">불러오는 중…</div>';
  }

  function renderLists() {
    var ongoingEl = document.getElementById('listOngoing');
    var endedEl = document.getElementById('listEnded');
    if (!ongoingEl || !endedEl) return;

    var ongoingRows = eventRows.filter(function (r) {
      return !isEndedRow(r);
    });
    var endedRows = eventRows.filter(function (r) {
      return isEndedRow(r);
    });

    if (!ongoingRows.length) {
      setListMessage(ongoingEl, EMPTY_MSG);
    } else {
      ongoingEl.innerHTML = ongoingRows.map(buildListCardHtml).join('');
    }

    if (!endedRows.length) {
      setListMessage(endedEl, EMPTY_MSG);
    } else {
      endedEl.innerHTML = endedRows.map(buildListCardHtml).join('');
    }
  }

  function isDetailViewOpen() {
    var view = document.getElementById('eventDetailView');
    return Boolean(view && view.classList.contains('open'));
  }

  function closeDetailUI() {
    var view = document.getElementById('eventDetailView');
    if (view) view.classList.remove('open');
    document.body.style.overflow = '';
    currentEventId = null;
    currentEventData = null;
  }

  function syncUrlWithoutEventId() {
    if (!window.history || !window.history.replaceState) return;
    var url = new URL(window.location.href);
    if (!url.searchParams.has('id')) return;
    url.searchParams.delete('id');
    window.history.replaceState(window.history.state, '', url.toString());
  }

  function pushDetailHistory(eventId) {
    if (!window.history || !window.history.pushState) return;
    var url = new URL(window.location.href);
    url.searchParams.set('id', String(eventId));
    window.history.pushState(
      { pickleEventDetail: true, eventId: String(eventId) },
      '',
      url.toString()
    );
    detailHistoryActive = true;
  }

  function handleDetailPopstate() {
    if (suppressDetailPopstate) {
      suppressDetailPopstate = false;
      return;
    }
    if (!isDetailViewOpen()) return;
    detailHistoryActive = false;
    closeDetailUI();
  }

  function bindDetailHistoryEvents() {
    if (window.__pickleEventsPopstateBound) return;
    window.__pickleEventsPopstateBound = true;
    window.addEventListener('popstate', handleDetailPopstate);
  }

  async function fetchEvents() {
    var sb = getClient();
    var result = await sb
      .from('events')
      .select('*')
      .in('status', ['ongoing', 'ended'])
      .order('sort_order', { ascending: false })
      .order('end_date', { ascending: false });

    if (result.error) throw result.error;
    return result.data || [];
  }

  async function openDetail(eventId) {
    var row = eventMap.get(String(eventId));
    if (!row) return;

    var view = document.getElementById('eventDetailView');
    var content = document.getElementById('detailContent');
    var bottomBar = document.getElementById('detailBottomBar');
    if (!view || !content || !bottomBar) return;

    currentEventId = String(eventId);
    currentEventData = row;

    var ended = isEndedRow(row);
    content.innerHTML = ended ? buildEndedDetailHtml(row) : buildOngoingDetailHtml(row);
    if (ended) {
      await renderEndedBottomBar(row, currentEventId);
    } else {
      bottomBar.innerHTML = buildOngoingBottomBar(row);
    }

    view.classList.add('open');
    document.body.style.overflow = 'hidden';

    pushDetailHistory(eventId);
  }

  function closeDetail(fromHistory) {
    if (!isDetailViewOpen()) return;

    closeDetailUI();

    if (fromHistory) {
      detailHistoryActive = false;
      return;
    }

    if (detailHistoryActive) {
      detailHistoryActive = false;
      suppressDetailPopstate = true;
      window.history.back();
      return;
    }

    syncUrlWithoutEventId();
  }

  function switchTab(tab) {
    var tabOngoing = document.getElementById('tabOngoing');
    var tabEnded = document.getElementById('tabEnded');
    var listOngoing = document.getElementById('listOngoing');
    var listEnded = document.getElementById('listEnded');
    if (!tabOngoing || !tabEnded || !listOngoing || !listEnded) return;

    tabOngoing.classList.remove('active');
    tabEnded.classList.remove('active');
    listOngoing.classList.add('hidden');
    listEnded.classList.add('hidden');

    if (tab === 'ongoing') {
      tabOngoing.classList.add('active');
      listOngoing.classList.remove('hidden');
    } else {
      tabEnded.classList.add('active');
      listEnded.classList.remove('hidden');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function buildEventDeepLink(eventId) {
    var url = new URL(SHARE_EVENT_PAGE);
    if (eventId != null && String(eventId).trim() !== '') {
      url.searchParams.set('id', String(eventId));
    }
    return url.toString();
  }

  function getSharePayload() {
    var row = currentEventData;
    if (!row) {
      return {
        title: 'P!CKLE 이벤트',
        kakaoDescription: SHARE_PROMO_TEXT,
        nativeText: NATIVE_SHARE_TEXT,
        imageUrl: DEFAULT_EVENT_SHARE_IMAGE,
        url: SHARE_EVENT_PAGE,
      };
    }

    var title = String(row.title || 'P!CKLE 이벤트').trim();
    var thumb = row.thumbnail_url ? String(row.thumbnail_url).trim() : '';

    return {
      title: title,
      kakaoDescription: SHARE_PROMO_TEXT,
      nativeText: NATIVE_SHARE_TEXT,
      imageUrl: ensureAbsoluteShareUrl(thumb, DEFAULT_EVENT_SHARE_IMAGE),
      url: buildEventDeepLink(row.id),
    };
  }

  function hookShareFunctions() {
    window.sendKakaoEventMessage = function () {
      try {
        // 1. 카카오 스크립트 자체가 로드되었는지 확인
        if (!window.Kakao) {
          alert('카카오 스크립트 자체가 로드되지 않았습니다. 인터넷 상태를 확인하거나 새로고침 해주세요.');
          return;
        }

        // 2. 초기화 안 되어있으면 버튼 누를 때 강제 시동!
        if (!Kakao.isInitialized()) {
          // 대표님의 실제 자바스크립트 키
          Kakao.init('f18676580f0d5bc2f8f6374d138bb200');
        }

        // 3. 화면 데이터 안전하게 추출
        const titleEl = document.querySelector('.d-title');
        const eventTitle = titleEl ? titleEl.innerText : '🎁 P!CKLE 스페셜 이벤트';
        const currentUrl = window.location.href;

        // 4. 카카오톡 공유 강제 실행
        Kakao.Share.sendDefault({
          objectType: 'feed',
          content: {
            title: eventTitle,
            description: '지금 바로 픽클(P!CKLE)에서 혜택을 확인해 보세요!',
            imageUrl: 'https://pickleplay.kr/images/default_share.jpg',
            link: {
              mobileWebUrl: currentUrl,
              webUrl: currentUrl,
            },
          },
          buttons: [
            {
              title: '앱에서 참여하기',
              link: {
                mobileWebUrl: currentUrl,
                webUrl: currentUrl,
              },
            },
          ],
        });
      } catch (e) {
        // ★ 핵심: 카카오가 시동을 거부한 진짜 이유를 폰 화면에 띄워버림!
        alert('카카오 에러 발생: ' + e.message);
      }
    };

    window.nativeShare = function () {
      var payload = getSharePayload();
      if (navigator.share) {
        navigator
          .share({
            title: payload.title,
            text: NATIVE_SHARE_TEXT,
            url: payload.url,
          })
          .then(function () {
            if (typeof window.closeAllSheets === 'function') window.closeAllSheets();
          })
          .catch(function (err) {
            if (err && err.name !== 'AbortError') {
              console.error('[P!CKLE Events] native share failed', err);
            }
          });
      } else {
        alert('현재 브라우저에서는 기본 공유 기능을 지원하지 않습니다. 링크 복사를 이용해주세요.');
      }
    };

    window.copyEventLink = function () {
      var payload = getSharePayload();
      navigator.clipboard.writeText(payload.url).then(function () {
        alert('이벤트 링크가 복사되었습니다! 친구들에게 소문내주세요.');
        if (typeof window.closeAllSheets === 'function') window.closeAllSheets();
      });
    };
  }

  async function loadAll() {
    var ongoingEl = document.getElementById('listOngoing');
    var endedEl = document.getElementById('listEnded');
    setListLoading(ongoingEl);
    setListLoading(endedEl);

    try {
      if (window.PickleCategories && window.PickleCategories.load) {
        await window.PickleCategories.load();
      }

      eventRows = await fetchEvents();
      eventMap = new Map();
      eventRows.forEach(function (row) {
        if (row && row.id) eventMap.set(String(row.id), row);
      });

      renderLists();

      var params = new URLSearchParams(window.location.search);
      var deepId = params.get('id');
      if (deepId && eventMap.has(String(deepId))) {
        var row = eventMap.get(String(deepId));
        switchTab(isEndedRow(row) ? 'ended' : 'ongoing');
        openDetail(String(deepId));
      }
    } catch (err) {
      console.error('[P!CKLE Events]', err);
      var msg = '이벤트를 불러오지 못했습니다.' + (err.message ? ' (' + err.message + ')' : '');
      setListMessage(ongoingEl, msg);
      setListMessage(endedEl, msg);
    }
  }

  function init() {
    hookShareFunctions();
    bindDetailBottomBarEvents();
    bindDetailHistoryEvents();
    window.openShareSheet = openShareSheetHandler;
    window.switchTab = switchTab;
    window.openDetail = openDetail;
    window.closeDetail = closeDetail;
    loadAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PickleEvents = {
    reload: loadAll,
    getSharePayload: getSharePayload,
    participate: participateCurrent,
    openWinnerForm: openWinnerForm,
    openShareSheet: openShareSheetHandler,
  };
})();
