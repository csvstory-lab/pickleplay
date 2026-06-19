/**
 * P!CKLE Admin — 이벤트/추첨 Supabase 연동
 */
(function () {
  'use strict';

  var dbClient = null;
  var eventsCache = [];
  var currentNotifyEventId = null;
  var pendingThumbFile = null;
  var pendingBannerFile = null;
  var existingThumbUrl = null;
  var existingBannerUrl = null;

  var EVENT_IMAGE_BUCKET = 'event_images';
  var THUMB_DROP_DEFAULT =
    '📸 가로형 썸네일 업로드<br><span style="font-size:0.7rem;">(추천 720x360 / .jpg, .png)</span>';
  var BANNER_DROP_DEFAULT =
    '🖼️ 상세 본문 배너 업로드<br><span style="font-size:0.7rem;">(가로 고정 720px, 세로 자유 / .jpg, .png)</span>';

  function sanitizeImageExt(filename) {
    var m = String(filename || '').match(/\.([a-zA-Z0-9]+)$/);
    var ext = (m && m[1] ? m[1] : 'jpg').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  }

  function validateEventImageFile(file) {
    if (!file) throw new Error('이미지 파일이 없습니다.');
    var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (file.type && allowed.indexOf(file.type) === -1) {
      throw new Error('JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있습니다.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('이미지는 10MB 이하만 업로드할 수 있습니다.');
    }
  }

  async function uploadEventImage(file, folder) {
    validateEventImageFile(file);
    var sb = getSupabaseClient();
    var ext = sanitizeImageExt(file.name);
    var path =
      folder +
      '/' +
      Date.now() +
      '_' +
      Math.random().toString(36).slice(2, 10) +
      '.' +
      ext;
    var uploadRes = await sb.storage.from(EVENT_IMAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/jpeg',
    });
    if (uploadRes.error) {
      if (/bucket/i.test(uploadRes.error.message || '')) {
        throw new Error(
          'event_images 버킷이 없습니다. Supabase에서 PUBLIC 버킷 생성 후 59_storage_event_images.sql 을 실행해 주세요.'
        );
      }
      throw uploadRes.error;
    }
    var urlRes = sb.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(path);
    return urlRes.data.publicUrl;
  }

  function renderImageDropZone(zoneId, previewUrl, defaultHtml) {
    var zone = document.getElementById(zoneId);
    if (!zone) return;
    if (previewUrl) {
      zone.innerHTML =
        '<img src="' +
        escapeHtml(previewUrl) +
        '" alt="" style="width:100%;height:100%;min-height:120px;object-fit:cover;border-radius:8px;display:block;">';
      zone.classList.add('has-preview');
      return;
    }
    zone.classList.remove('has-preview');
    zone.innerHTML = defaultHtml;
  }

  function bindEventImageInputs() {
    var thumbInput = document.getElementById('thumbFileInput');
    var bannerInput = document.getElementById('bannerFileInput');
    if (thumbInput && thumbInput.dataset.bound !== '1') {
      thumbInput.dataset.bound = '1';
      thumbInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          validateEventImageFile(file);
        } catch (err) {
          alert(err.message || String(err));
          thumbInput.value = '';
          return;
        }
        pendingThumbFile = file;
        var reader = new FileReader();
        reader.onload = function (ev) {
          renderImageDropZone('thumbDropZone', ev.target.result, THUMB_DROP_DEFAULT);
        };
        reader.readAsDataURL(file);
      });
    }
    if (bannerInput && bannerInput.dataset.bound !== '1') {
      bannerInput.dataset.bound = '1';
      bannerInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          validateEventImageFile(file);
        } catch (err) {
          alert(err.message || String(err));
          bannerInput.value = '';
          return;
        }
        pendingBannerFile = file;
        var reader = new FileReader();
        reader.onload = function (ev) {
          renderImageDropZone('detailDropZone', ev.target.result, BANNER_DROP_DEFAULT);
        };
        reader.readAsDataURL(file);
      });
    }
  }

  function resetEventImageState() {
    pendingThumbFile = null;
    pendingBannerFile = null;
    existingThumbUrl = null;
    existingBannerUrl = null;
    var thumbInput = document.getElementById('thumbFileInput');
    var bannerInput = document.getElementById('bannerFileInput');
    if (thumbInput) thumbInput.value = '';
    if (bannerInput) bannerInput.value = '';
    renderImageDropZone('thumbDropZone', null, THUMB_DROP_DEFAULT);
    renderImageDropZone('detailDropZone', null, BANNER_DROP_DEFAULT);
  }

  function setEventImagesFromRow(row) {
    pendingThumbFile = null;
    pendingBannerFile = null;
    existingThumbUrl = row && row.thumbnail_url ? String(row.thumbnail_url).trim() : null;
    existingBannerUrl =
      row && (row.detail_banner_url || row.banner_url)
        ? String(row.detail_banner_url || row.banner_url).trim()
        : null;
    var thumbInput = document.getElementById('thumbFileInput');
    var bannerInput = document.getElementById('bannerFileInput');
    if (thumbInput) thumbInput.value = '';
    if (bannerInput) bannerInput.value = '';
    renderImageDropZone('thumbDropZone', existingThumbUrl, THUMB_DROP_DEFAULT);
    renderImageDropZone('detailDropZone', existingBannerUrl, BANNER_DROP_DEFAULT);
  }

  async function resolveEventImageUrls() {
    var thumbnailUrl = existingThumbUrl;
    var bannerUrl = existingBannerUrl;
    if (pendingThumbFile) {
      thumbnailUrl = await uploadEventImage(pendingThumbFile, 'thumbnails');
    }
    if (pendingBannerFile) {
      bannerUrl = await uploadEventImage(pendingBannerFile, 'banners');
    }
    return {
      thumbnail_url: thumbnailUrl || null,
      detail_banner_url: bannerUrl || null,
    };
  }

  function validateJoinTypePayload(joinType, payload) {
    if ((joinType === 'vote' || joinType === 'reply') && !payload.target_post_id) {
      throw new Error('특정 불판 투표/댓글 이벤트는 대상 불판 ID(또는 URL)를 입력해 주세요.');
    }
    if (joinType === 'first_come') {
      var maxP = Number(payload.max_participants);
      if (!Number.isFinite(maxP) || maxP < 1) {
        throw new Error('선착순 이벤트는 목표 인원을 1명 이상 입력해 주세요.');
      }
    }
    if (joinType === 'vote_count') {
      var targetV = Number(payload.target_vote_count);
      if (!Number.isFinite(targetV) || targetV < 1) {
        throw new Error('투표 N회 달성 이벤트는 목표 투표 횟수를 1회 이상 입력해 주세요.');
      }
    }
  }

  function getSupabaseClient() {
    if (dbClient) return dbClient;
    var cfg = window.PICKLE_SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      throw new Error('Supabase 접속 정보가 없습니다.');
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase JS 라이브러리가 로드되지 않았습니다.');
    }
    dbClient = window.supabase.createClient(cfg.url.trim(), cfg.anonKey.trim());
    return dbClient;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateRange(start, end) {
    var s = String(start || '').slice(0, 10).replace(/-/g, '.');
    var e = String(end || '').slice(0, 10).replace(/-/g, '.');
    return s + ' ~ ' + e;
  }

  function sumPrizeCount(prizes) {
    var list = Array.isArray(prizes) ? prizes : [];
    return list.reduce(function (sum, p) {
      return sum + (Number(p && p.count) || 0);
    }, 0);
  }

  function formatPrizeSummary(prizes) {
    var list = Array.isArray(prizes) ? prizes : [];
    var total = sumPrizeCount(list);
    if (!list.length) return '—';
    if (list.length > 1) return '총 ' + total + '명 (다중경품)';
    return total + '명';
  }

  function buildNotifyPreview(eventRow, winnerCount) {
    var formUrl =
      eventRow && eventRow.google_form_url ? String(eventRow.google_form_url).trim() : 'https://forms.gle/...';
    var title = eventRow && eventRow.title ? eventRow.title : '이벤트';
    return (
      '🎉 축하합니다! 참여하신 [' +
      title +
      '] 이벤트에 당첨되셨습니다!\n\n' +
      '모바일 쿠폰 발송을 위해 아래 링크(구글 폼)를 눌러 경품을 수령할 정보를 정확히 입력해 주세요.\n\n' +
      '⚠️ [필독] 경품은 마이페이지 [보관함]에 노출되지 않습니다.\n' +
      '⚠️ [필독] 당첨일로부터 7일 이내 구글 폼 미입력 시 당첨이 자동 취소됩니다.\n\n' +
      '👉 입력 기한: 당첨 알림 수신 후 7일 이내\n' +
      '👉 구글 폼 링크: ' +
      formUrl +
      '\n\n' +
      '(대상 당첨자: ' +
      winnerCount +
      '명 / 최종 확정 시 앱 푸시 알림이 일괄 발송됩니다.)'
    );
  }

  function renderEventList(rows) {
    var tbody = document.getElementById('eventListTableBody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--text-sub);padding:40px;">등록된 이벤트가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (row) {
        var isEnded = row.status === 'ended';
        var statusHtml = isEnded
          ? '<span class="status-tag status-end">종료됨</span>'
          : '<span class="status-tag status-ing">진행 중</span>';
        var actionHtml = isEnded
          ? '<span style="font-size:0.8rem;color:var(--text-sub);">수정 불가</span>'
          : '<button class="btn-action-sm" onclick="AdminEvents.loadEventEdit(\'' +
            row.id +
            '\')">✏️ 수정</button>';

        return (
          '<tr' +
          (isEnded ? ' style="opacity:0.7;"' : '') +
          '>' +
          '<td><strong style="color:' +
          (isEnded ? 'var(--text-sub)' : '#fff') +
          ';cursor:pointer;" onclick="AdminEvents.loadEventEdit(\'' +
          row.id +
          '\')">' +
          escapeHtml(row.title) +
          '</strong></td>' +
          '<td>' +
          escapeHtml(formatDateRange(row.start_date, row.end_date)) +
          '</td>' +
          '<td><span style="color:var(--theme-gold);">' +
          escapeHtml(formatPrizeSummary(row.prizes)) +
          '</span></td>' +
          '<td id="entryCount-' +
          row.id +
          '">—</td>' +
          '<td>' +
          statusHtml +
          '</td>' +
          '<td style="text-align:center;">' +
          actionHtml +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    loadEntryCounts(rows);
  }

  async function loadEntryCounts(rows) {
    var sb = getSupabaseClient();
    await Promise.all(
      rows.map(async function (row) {
        var el = document.getElementById('entryCount-' + row.id);
        if (!el) return;
        var res = await sb
          .from('event_entries')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', row.id);
        if (res.error) {
          el.textContent = '—';
          return;
        }
        el.textContent = (res.count || 0).toLocaleString('ko-KR') + '명';
      })
    );
  }

  function buildWinnerActionHtml(row) {
    if (row.draw_status === 'finalized') {
      var count = Array.isArray(row.winners) ? row.winners.length : sumPrizeCount(row.prizes);
      return (
        '<span style="font-size:0.8rem;color:var(--text-sub);margin-right:10px;">확정 완료 (' +
        count +
        '명)</span>' +
        '<span style="font-size:0.75rem;color:var(--neon-green);">푸시 발송됨</span>'
      );
    }
    if (row.draw_status === 'candidates_ready') {
      var candCount = Array.isArray(row.draw_candidates) ? row.draw_candidates.length : 0;
      return (
        '<span style="font-size:0.8rem;color:var(--theme-gold);margin-right:10px;">추첨 완료 (' +
        candCount +
        '명)</span>' +
        '<button class="btn-action-sm btn-primary" onclick="AdminEvents.openFinalizeModal(\'' +
        row.id +
        '\')">📣 당첨자들에게 즉시 발송</button>'
      );
    }
    return (
      '<button class="btn-action-sm" onclick="AdminEvents.runDraw(\'' +
      row.id +
      '\', this)">🎲 AI 자동 추첨하기</button>'
    );
  }

  function renderWinnerTable(endedRows) {
    var tbody = document.getElementById('winnerTableBody');
    if (!tbody) return;

    var rows = (endedRows || []).filter(function (r) {
      return r.status === 'ended';
    });

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;color:var(--text-sub);padding:40px;">종료된 이벤트가 없습니다.<br><span style="font-size:0.8rem;">이벤트 종료일이 지난 캠페인은 등록 탭에서 저장 시 자동으로 종료 처리됩니다.</span></td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (row) {
        var drawMeta = row.draw_meta && typeof row.draw_meta === 'object' ? row.draw_meta : {};
        var metaHint =
          drawMeta.eligible_count != null
            ? '<div style="font-size:0.72rem;color:var(--text-sub);margin-top:4px;">추첨 풀 ' +
              drawMeta.eligible_count +
              '명 (유령제외 ' +
              (drawMeta.excluded_ghost || 0) +
              ' / 벌점제외 ' +
              (drawMeta.excluded_penalty || 0) +
              ')</div>'
            : '';

        return (
          '<tr data-event-id="' +
          row.id +
          '">' +
          '<td><strong style="color:#fff;">' +
          escapeHtml(row.title) +
          '</strong>' +
          metaHint +
          '</td>' +
          '<td id="winnerEntryCount-' +
          row.id +
          '">—</td>' +
          '<td>' +
          escapeHtml(formatPrizeSummary(row.prizes)) +
          '</td>' +
          '<td style="text-align:center;" id="winnerAction-' +
          row.id +
          '">' +
          buildWinnerActionHtml(row) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    loadWinnerEntryCounts(rows);
  }

  async function loadWinnerEntryCounts(rows) {
    var sb = getSupabaseClient();
    await Promise.all(
      rows.map(async function (row) {
        var el = document.getElementById('winnerEntryCount-' + row.id);
        if (!el) return;
        var res = await sb
          .from('event_entries')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', row.id);
        if (res.error) {
          el.textContent = '—';
          return;
        }
        el.textContent = (res.count || 0).toLocaleString('ko-KR') + '명';
      })
    );
  }

  async function loadWinnerTab() {
    var tbody = document.getElementById('winnerTableBody');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;color:var(--text-sub);padding:40px;">종료된 이벤트를 불러오는 중...</td></tr>';
    }

    var sb = getSupabaseClient();
    var res = await sb
      .from('events')
      .select(
        'id, title, start_date, end_date, status, prizes, winners, draw_status, draw_candidates, draw_meta, google_form_url'
      )
      .eq('status', 'ended')
      .order('end_date', { ascending: false });

    if (res.error) throw res.error;

    var endedRows = res.data || [];
    endedRows.forEach(function (row) {
      var idx = eventsCache.findIndex(function (e) {
        return e.id === row.id;
      });
      if (idx >= 0) {
        eventsCache[idx] = Object.assign({}, eventsCache[idx], row);
      } else {
        eventsCache.push(row);
      }
    });

    renderWinnerTable(endedRows);
    return endedRows;
  }

  async function loadEvents() {
    var sb = getSupabaseClient();
    var res = await sb
      .from('events')
      .select(
        'id, title, start_date, end_date, status, prizes, winners, draw_status, draw_candidates, draw_meta, google_form_url, join_type, target_post_id, max_participants, target_vote_count, thumbnail_url, detail_banner_url, description, push_enabled, push_text'
      )
      .order('sort_order', { ascending: false })
      .order('end_date', { ascending: false });

    if (res.error) throw res.error;
    eventsCache = res.data || [];
    renderEventList(eventsCache);
  }

  function findEvent(id) {
    return eventsCache.find(function (r) {
      return r.id === id;
    });
  }

  window.AdminEvents = {
    loadEvents: loadEvents,
    loadWinnerTab: loadWinnerTab,

    collectPrizeTiers: function () {
      var rows = document.querySelectorAll('#prizeContainer .prize-row');
      var prizes = [];
      rows.forEach(function (row, index) {
        var inputs = row.querySelectorAll('.form-input');
        var name = inputs[0] ? inputs[0].value.trim() : '';
        var count = inputs[1] ? parseInt(inputs[1].value, 10) : 0;
        if (!name && !count) return;
        prizes.push({
          name: name || '경품 ' + (index + 1),
          count: Number.isFinite(count) && count > 0 ? count : 1,
          rank: String(index + 1),
        });
      });
      return prizes;
    },

    loadEventEdit: function (eventId) {
      var row = findEvent(eventId);
      if (!row) return;
      if (typeof window.loadEventFromRow === 'function') {
        window.loadEventFromRow(row);
      }
    },

    runDraw: async function (eventId, btn) {
      if (
        !confirm(
          '유령·벌점 계정을 제외하고 AI 자동 추첨을 실행할까요?\n(임시 저장되며, 최종 확정 전까지 푸시가 발송되지 않습니다.)'
        )
      ) {
        return;
      }
      var original = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ 추첨 중...';
      }
      try {
        var sb = getSupabaseClient();
        var res = await sb.rpc('pickle_draw_event_winners', {
          p_event_id: eventId,
          p_save_candidates: true,
        });
        if (res.error) throw res.error;
        var data = res.data || {};
        if (!data.ok) throw new Error(data.error || '추첨 실패');

        alert(
          '✅ 추첨 완료!\n\n자격 충족: ' +
            (data.eligible_count || 0) +
            '명\n유령 제외: ' +
            (data.excluded_ghost || 0) +
            '명\n벌점·정지 제외: ' +
            (data.excluded_penalty || 0) +
            '명\n당첨 추출: ' +
            (data.total_drawn || 0) +
            '명\n\n확인 후 [당첨자들에게 즉시 발송]으로 최종 확정해 주세요.'
        );
        await loadEvents();
        await loadWinnerTab();
        window.AdminEvents.openFinalizeModal(eventId);
      } catch (err) {
        console.error('[Admin Events] runDraw', err);
        alert('추첨 실패: ' + (err.message || String(err)));
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = original;
        }
      }
    },

    openFinalizeModal: function (eventId) {
      var row = findEvent(eventId);
      if (!row) {
        alert('이벤트를 찾을 수 없습니다.');
        return;
      }
      currentNotifyEventId = eventId;
      var candCount = Array.isArray(row.draw_candidates) ? row.draw_candidates.length : 0;
      document.getElementById('modalEventName').innerText = row.title;
      document.getElementById('modalWinnerCount').innerText = candCount + '명';
      var preview = document.getElementById('notifyPreviewText');
      if (preview) preview.value = buildNotifyPreview(row, candCount);
      document.getElementById('notifyModal').style.display = 'flex';
    },

    confirmFinalize: async function () {
      if (!currentNotifyEventId) return;
      if (
        !confirm(
          '당첨자를 최종 확정하고 앱 푸시 알림을 일괄 발송합니다.\n(이 작업은 되돌릴 수 없습니다.)'
        )
      ) {
        return;
      }
      try {
        var sb = getSupabaseClient();
        var res = await sb.rpc('pickle_finalize_event_winners', {
          p_event_id: currentNotifyEventId,
        });
        if (res.error) throw res.error;
        var data = res.data || {};
        if (!data.ok) throw new Error(data.error || '확정 실패');

        alert(
          '✅ 최종 확정 완료!\n당첨자 ' +
            (data.winner_count || 0) +
            '명 / 푸시 ' +
            (data.notified_count || 0) +
            '건 발송'
        );
        window.closeNotifyModal();
        currentNotifyEventId = null;
        await loadEvents();
        await loadWinnerTab();
      } catch (err) {
        console.error('[Admin Events] confirmFinalize', err);
        alert('최종 확정 실패: ' + (err.message || String(err)));
      }
    },

    saveEvent: async function (payload, mode, eventId) {
      validateJoinTypePayload(payload.join_type, payload);
      var imageUrls = await resolveEventImageUrls();
      Object.assign(payload, imageUrls);

      var sb = getSupabaseClient();
      if (mode === 'edit' && eventId) {
        var updateRes = await sb.from('events').update(payload).eq('id', eventId).select('id').maybeSingle();
        if (updateRes.error) throw updateRes.error;
        pendingThumbFile = null;
        pendingBannerFile = null;
        existingThumbUrl = payload.thumbnail_url;
        existingBannerUrl = payload.detail_banner_url;
        return updateRes.data;
      }
      var insertRes = await sb.from('events').insert(payload).select('id').maybeSingle();
      if (insertRes.error) throw insertRes.error;
      pendingThumbFile = null;
      pendingBannerFile = null;
      existingThumbUrl = payload.thumbnail_url;
      existingBannerUrl = payload.detail_banner_url;
      return insertRes.data;
    },

    resetEventImageState: resetEventImageState,
    setEventImagesFromRow: setEventImagesFromRow,
    bindEventImageInputs: bindEventImageInputs,
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindEventImageInputs();
    loadEvents().catch(function (err) {
      console.error('[Admin Events] loadEvents', err);
    });
  });
})();
