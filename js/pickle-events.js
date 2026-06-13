/**
 * P!CKLE — event.html 이벤트 DB 연동
 * @build 20260613_events1
 */
(function () {
  'use strict';

  var EMPTY_MSG = '이벤트가 없습니다.';
  var eventRows = [];
  var eventMap = new Map();
  var currentEventId = null;
  var currentShareEvent = null;

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

  function buildNoticeListHtml(items) {
    var list = Array.isArray(items) ? items : [];
    if (!list.length) return '';
    return (
      '<div class="d-notice-box">' +
      '<div class="notice-title">📌 꼭 확인해주세요</div>' +
      '<ul class="notice-list">' +
      list
        .map(function (item) {
          return '<li>' + escapeHtml(String(item)) + '</li>';
        })
        .join('') +
      '</ul>' +
      '</div>'
    );
  }

  function buildWinnerBoxHtml(row) {
    var winners = Array.isArray(row.winners) ? row.winners : [];
    if (!winners.length && !row.winner_box_title) return '';
    var items = winners
      .map(function (w) {
        return (
          '<div class="winner-item"><span>' +
          escapeHtml(w.nickname || '—') +
          '</span><span style="color:var(--text-sub);">UID: ' +
          escapeHtml(w.uid_mask || '***') +
          '</span></div>'
        );
      })
      .join('');
    var summary = row.winner_summary
      ? '<div style="text-align:center; font-size:0.85rem; color:var(--text-sub); margin-top:20px; font-weight:700;">' +
        escapeHtml(row.winner_summary) +
        '</div>'
      : '';
    return (
      '<div class="winner-box">' +
      '<h3 class="winner-title">' +
      escapeHtml(row.winner_box_title || '🎉 당첨자 발표') +
      '</h3>' +
      '<div class="winner-list-wrap">' +
      items +
      '</div>' +
      summary +
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
      buildNoticeListHtml(row.notice_items) +
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
      '</div>' +
      '</div>'
    );
  }

  function participateCurrent() {
    var row = currentShareEvent;
    if (!row) return;
    var formUrl = row.google_form_url ? String(row.google_form_url).trim() : '';
    if (formUrl) {
      window.location.href = formUrl;
      return;
    }
    alert('이벤트 응모가 완료되었습니다! 🎉');
  }

  function buildOngoingBottomBar(row) {
    var label = escapeHtml(row.participate_label || '응모하기');
    return (
      '<button class="btn-share-huge" onclick="openShareSheet()">' +
      '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>' +
      '<span class="share-text">소문내기</span>' +
      '</button>' +
      '<button class="btn-participate-huge" onclick="PickleEvents.participate()">' +
      label +
      '</button>'
    );
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

  function openDetail(eventId) {
    var row = eventMap.get(String(eventId));
    if (!row) return;

    var view = document.getElementById('eventDetailView');
    var content = document.getElementById('detailContent');
    var bottomBar = document.getElementById('detailBottomBar');
    if (!view || !content || !bottomBar) return;

    currentEventId = String(eventId);
    currentShareEvent = row;

    var ended = isEndedRow(row);
    content.innerHTML = ended ? buildEndedDetailHtml(row) : buildOngoingDetailHtml(row);
    bottomBar.innerHTML = ended
      ? '<button class="btn-disabled-huge" disabled>종료된 이벤트입니다</button>'
      : buildOngoingBottomBar(row);

    view.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (window.history && window.history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.set('id', String(eventId));
      window.history.replaceState({}, '', url.toString());
    }
  }

  function closeDetail() {
    var view = document.getElementById('eventDetailView');
    if (view) view.classList.remove('open');
    document.body.style.overflow = '';
    currentEventId = null;
    currentShareEvent = null;

    if (window.history && window.history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url.toString());
    }
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

  function getSharePayload() {
    var row = currentShareEvent;
    if (!row) {
      return {
        title: 'P!CKLE 이벤트',
        text: 'P!CKLE에서 진행 중인 이벤트를 확인해 보세요!',
        imageUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
        url: window.location.href,
      };
    }
    var url = new URL(window.location.href);
    url.searchParams.set('id', String(row.id));
    return {
      title: row.title,
      text: String(row.description || row.title).replace(/<[^>]+>/g, '').slice(0, 120),
      imageUrl:
        row.thumbnail_url ||
        row.detail_banner_url ||
        'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
      url: url.toString(),
    };
  }

  function hookShareFunctions() {
    window.sendKakaoEventMessage = function () {
      if (!window.Kakao || !window.Kakao.Share) {
        alert('카카오 공유를 사용할 수 없습니다.');
        return;
      }
      var payload = getSharePayload();
      Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: payload.title,
          description: payload.text,
          imageUrl: payload.imageUrl,
          link: { mobileWebUrl: payload.url, webUrl: payload.url },
        },
        buttons: [
          {
            title: '🎁 이벤트 응모하러 가기',
            link: { mobileWebUrl: payload.url, webUrl: payload.url },
          },
        ],
      });
      if (typeof window.closeAllSheets === 'function') window.closeAllSheets();
    };

    window.nativeShare = function () {
      var payload = getSharePayload();
      if (navigator.share) {
        navigator
          .share({ title: payload.title, text: payload.text, url: payload.url })
          .then(function () {
            if (typeof window.closeAllSheets === 'function') window.closeAllSheets();
          })
          .catch(function () {});
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
  };
})();
