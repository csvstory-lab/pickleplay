/**
 * P!CKLE Admin — 메인 팝업(바텀 시트) 관리
 */
(function () {
  'use strict';

  var dbClient = null;
  var popupsCache = [];
  var editingId = null;
  var pendingImageFile = null;
  var existingImageUrl = null;

  var IMAGE_BUCKET = 'event_images';
  var DROP_DEFAULT =
    '📸 팝업 이미지 업로드<br><span style="font-size:0.7rem;">(16:9 가로형 권장 / .jpg, .png)</span>';

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSupabaseClient() {
    if (dbClient) return dbClient;
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      dbClient = window.PickleSupabase.getClient();
      return dbClient;
    }
    if (window.supabase && window.PICKLE_SUPABASE_CONFIG) {
      dbClient = window.supabase.createClient(
        window.PICKLE_SUPABASE_CONFIG.url,
        window.PICKLE_SUPABASE_CONFIG.anonKey
      );
      return dbClient;
    }
    throw new Error('Supabase 클라이언트를 초기화할 수 없습니다.');
  }

  function formatDateRange(start, end) {
    if (!start || !end) return '-';
    var s = new Date(start);
    var e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '-';
    var fmt = function (d) {
      return (
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0')
      );
    };
    return fmt(s) + ' ~ ' + fmt(e);
  }

  function getPopupStatus(row) {
    if (!row) return { label: '-', cls: 'status-end' };
    var now = Date.now();
    var start = new Date(row.start_date).getTime();
    var end = new Date(row.end_date).getTime();
    if (!row.is_active) return { label: '비노출', cls: 'status-end' };
    if (now < start) return { label: '예정', cls: 'status-scheduled' };
    if (now > end) return { label: '종료', cls: 'status-end' };
    return { label: '노출 중', cls: 'status-ing' };
  }

  function sanitizeImageExt(filename) {
    var m = String(filename || '').match(/\.([a-zA-Z0-9]+)$/);
    var ext = (m && m[1] ? m[1] : 'jpg').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  }

  var POPUP_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

  function validateImageFile(file) {
    if (!file) throw new Error('이미지 파일이 없습니다.');
    var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (file.type && allowed.indexOf(file.type) === -1) {
      throw new Error('JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있습니다.');
    }
    if (file.size > POPUP_IMAGE_MAX_BYTES) {
      throw new Error('SIZE_LIMIT');
    }
  }

  async function uploadPopupImage(file) {
    validateImageFile(file);
    var sb = getSupabaseClient();
    var ext = sanitizeImageExt(file.name);
    var path =
      'popups/' +
      Date.now() +
      '_' +
      Math.random().toString(36).slice(2, 10) +
      '.' +
      ext;
    var uploadRes = await sb.storage.from(IMAGE_BUCKET).upload(path, file, {
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
    return sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function renderImageDropZone(previewUrl) {
    var zone = document.getElementById('popupImageDropZone');
    if (!zone) return;
    if (previewUrl) {
      zone.innerHTML =
        '<img src="' +
        escapeHtml(previewUrl) +
        '" alt="" style="width:100%;height:100%;max-height:200px;object-fit:cover;border-radius:8px;display:block;background:#000;">';
      zone.classList.add('has-preview');
      return;
    }
    zone.classList.remove('has-preview');
    zone.innerHTML = DROP_DEFAULT;
  }

  function resetImageState() {
    pendingImageFile = null;
    existingImageUrl = null;
    var input = document.getElementById('popupImageFileInput');
    if (input) input.value = '';
    renderImageDropZone(null);
  }

  function bindImageInput() {
    var input = document.getElementById('popupImageFileInput');
    var zone = document.getElementById('popupImageDropZone');
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';

    input.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        validateImageFile(file);
      } catch (err) {
        if (err && err.message === 'SIZE_LIMIT') {
          alert('이미지 용량은 최대 2MB까지만 업로드 가능합니다.');
        } else {
          alert(err.message || String(err));
        }
        input.value = '';
        pendingImageFile = null;
        renderImageDropZone(existingImageUrl || null);
        return;
      }
      pendingImageFile = file;
      var reader = new FileReader();
      reader.onload = function (ev) {
        renderImageDropZone(ev.target.result);
      };
      reader.readAsDataURL(file);
    });

    if (zone && zone.dataset.clickBound !== '1') {
      zone.dataset.clickBound = '1';
      zone.addEventListener('click', function () {
        input.click();
      });
    }
  }

  function switchPopupView(view) {
    var listPanel = document.getElementById('popupViewList');
    var formPanel = document.getElementById('popupViewForm');
    var listBtn = document.getElementById('popupTabListBtn');
    var formBtn = document.getElementById('popupTabFormBtn');
    if (!listPanel || !formPanel) return;

    if (view === 'form') {
      listPanel.classList.remove('active');
      formPanel.classList.add('active');
      if (listBtn) listBtn.classList.remove('active');
      if (formBtn) formBtn.classList.add('active');
    } else {
      formPanel.classList.remove('active');
      listPanel.classList.add('active');
      if (formBtn) formBtn.classList.remove('active');
      if (listBtn) listBtn.classList.add('active');
    }
  }

  function clearForm() {
    editingId = null;
    document.getElementById('popupFormTitle').textContent = '➕ 신규 팝업 등록';
    document.getElementById('popupTitleInput').value = '';
    document.getElementById('popupLinkInput').value = '';
    document.getElementById('popupImageUrlInput').value = '';
    document.getElementById('popupStartInput').value = '';
    document.getElementById('popupEndInput').value = '';
    syncPopupDateConstraints();
    document.getElementById('popupActiveInput').checked = true;
    resetImageState();
    var submitBtn = document.getElementById('popupSubmitBtn');
    if (submitBtn) submitBtn.textContent = '🚀 팝업 등록 완료';
  }

  function fillForm(row) {
    editingId = row.id;
    document.getElementById('popupFormTitle').textContent = '✏️ 팝업 수정';
    document.getElementById('popupTitleInput').value = row.title || '';
    document.getElementById('popupLinkInput').value = row.link_url || '';
    document.getElementById('popupImageUrlInput').value = row.image_url || '';
    document.getElementById('popupStartInput').value = toDateInputValue(row.start_date);
    document.getElementById('popupEndInput').value = toDateInputValue(row.end_date);
    syncPopupDateConstraints();
    document.getElementById('popupActiveInput').checked = !!row.is_active;
    pendingImageFile = null;
    existingImageUrl = row.image_url || null;
    renderImageDropZone(existingImageUrl);
    var submitBtn = document.getElementById('popupSubmitBtn');
    if (submitBtn) submitBtn.textContent = '💾 팝업 수정 저장';
  }

  function toDateInputValue(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fromDateInputStart(dateStr) {
    if (!dateStr) return null;
    var parts = String(dateStr).split('-');
    if (parts.length !== 3) return null;
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var day = Number(parts[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return null;
    var d = new Date(y, m - 1, day, 0, 0, 0, 0);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function fromDateInputEnd(dateStr) {
    if (!dateStr) return null;
    var parts = String(dateStr).split('-');
    if (parts.length !== 3) return null;
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var day = Number(parts[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return null;
    var d = new Date(y, m - 1, day, 23, 59, 59, 999);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function validatePopupDateRange(showAlert) {
    var startEl = document.getElementById('popupStartInput');
    var endEl = document.getElementById('popupEndInput');
    if (!startEl || !endEl) return true;

    var startVal = startEl.value;
    var endVal = endEl.value;
    if (!startVal || !endVal) return true;

    if (endVal < startVal) {
      if (showAlert) {
        alert('종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
      }
      return false;
    }
    return true;
  }

  function syncPopupDateConstraints() {
    var startEl = document.getElementById('popupStartInput');
    var endEl = document.getElementById('popupEndInput');
    if (!startEl || !endEl) return;

    if (startEl.value) {
      endEl.min = startEl.value;
    } else {
      endEl.removeAttribute('min');
    }

    if (endEl.value) {
      startEl.max = endEl.value;
    } else {
      startEl.removeAttribute('max');
    }

    if (startEl.value && endEl.value && endEl.value < startEl.value) {
      endEl.value = startEl.value;
    }
  }

  function bindPopupDateInputs() {
    var startEl = document.getElementById('popupStartInput');
    var endEl = document.getElementById('popupEndInput');
    if (!startEl || !endEl || startEl.dataset.dateBound === '1') return;
    startEl.dataset.dateBound = '1';
    endEl.dataset.dateBound = '1';

    startEl.addEventListener('change', function () {
      syncPopupDateConstraints();
      validatePopupDateRange(false);
    });
    endEl.addEventListener('change', function () {
      syncPopupDateConstraints();
      validatePopupDateRange(true);
    });
  }

  async function loadPopups() {
    var tbody = document.getElementById('popupListTableBody');
    if (!tbody) return;

    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--text-sub);padding:40px;">불러오는 중...</td></tr>';

    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('popups')
        .select('*')
        .order('created_at', { ascending: false });

      if (result.error) throw result.error;
      popupsCache = result.data || [];
      renderPopupTable();
    } catch (err) {
      console.error('[Admin Popups] load failed', err);
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--neon-pink);padding:40px;">목록을 불러오지 못했습니다.</td></tr>';
    }
  }

  function renderPopupTable() {
    var tbody = document.getElementById('popupListTableBody');
    if (!tbody) return;

    if (!popupsCache.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--text-sub);padding:40px;">등록된 팝업이 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = popupsCache
      .map(function (row) {
        var status = getPopupStatus(row);
        return (
          '<tr data-popup-id="' +
          escapeHtml(row.id) +
          '">' +
          '<td><strong style="color:#fff;">' +
          escapeHtml(row.title || '(제목 없음)') +
          '</strong></td>' +
          '<td style="font-size:0.8rem;color:var(--text-sub);">' +
          formatDateRange(row.start_date, row.end_date) +
          '</td>' +
          '<td><span class="status-tag ' +
          status.cls +
          '">' +
          escapeHtml(status.label) +
          '</span></td>' +
          '<td style="text-align:center;">' +
          '<label class="switch" title="메인 노출 ON/OFF">' +
          '<input type="checkbox" class="popup-active-toggle" data-id="' +
          escapeHtml(row.id) +
          '" ' +
          (row.is_active ? 'checked' : '') +
          '>' +
          '<span class="slider"></span></label></td>' +
          '<td style="text-align:center;">' +
          (row.image_url
            ? '<img src="' +
              escapeHtml(row.image_url) +
              '" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid #333;">'
            : '-') +
          '</td>' +
          '<td style="text-align:center;white-space:nowrap;">' +
          '<button type="button" class="btn-action-sm popup-edit-btn" data-id="' +
          escapeHtml(row.id) +
          '">수정</button> ' +
          '<button type="button" class="btn-action-sm popup-delete-btn" data-id="' +
          escapeHtml(row.id) +
          '" style="color:var(--neon-pink);">삭제</button>' +
          '</td></tr>'
        );
      })
      .join('');

    tbody.querySelectorAll('.popup-active-toggle').forEach(function (input) {
      input.addEventListener('change', function () {
        togglePopupActive(input.getAttribute('data-id'), input.checked);
      });
    });

    tbody.querySelectorAll('.popup-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var row = popupsCache.find(function (r) {
          return String(r.id) === String(id);
        });
        if (!row) return;
        fillForm(row);
        switchPopupView('form');
      });
    });

    tbody.querySelectorAll('.popup-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deletePopup(btn.getAttribute('data-id'));
      });
    });
  }

  async function togglePopupActive(id, isActive) {
    if (!id) return;
    try {
      var sb = getSupabaseClient();
      var result = await sb.from('popups').update({ is_active: !!isActive }).eq('id', id);
      if (result.error) throw result.error;
      var row = popupsCache.find(function (r) {
        return String(r.id) === String(id);
      });
      if (row) row.is_active = !!isActive;
      renderPopupTable();
    } catch (err) {
      console.error('[Admin Popups] toggle failed', err);
      alert('노출 상태 변경에 실패했습니다.');
      loadPopups();
    }
  }

  async function deletePopup(id) {
    if (!id) return;
    if (!confirm('이 팝업을 삭제할까요?')) return;
    try {
      var sb = getSupabaseClient();
      var result = await sb.from('popups').delete().eq('id', id);
      if (result.error) throw result.error;
      await loadPopups();
    } catch (err) {
      console.error('[Admin Popups] delete failed', err);
      alert('삭제에 실패했습니다.');
    }
  }

  async function resolveImageUrl() {
    var urlInput = document.getElementById('popupImageUrlInput');
    var manualUrl = urlInput ? String(urlInput.value || '').trim() : '';
    if (pendingImageFile) {
      return uploadPopupImage(pendingImageFile);
    }
    if (manualUrl) return manualUrl;
    if (existingImageUrl) return existingImageUrl;
    throw new Error('팝업 이미지 URL 또는 파일을 입력해 주세요.');
  }

  async function submitPopupForm() {
    var title = String(document.getElementById('popupTitleInput').value || '').trim();
    var linkUrl = String(document.getElementById('popupLinkInput').value || '').trim();
    var startDate = fromDateInputStart(document.getElementById('popupStartInput').value);
    var endDate = fromDateInputEnd(document.getElementById('popupEndInput').value);
    var isActive = document.getElementById('popupActiveInput').checked;

    if (!title) {
      alert('팝업 제목을 입력해 주세요.');
      return;
    }
    if (!startDate || !endDate) {
      alert('시작 날짜와 종료 날짜를 모두 선택해 주세요.');
      return;
    }
    if (!validatePopupDateRange(true)) {
      return;
    }

    var submitBtn = document.getElementById('popupSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '저장 중...';
    }

    try {
      var imageUrl = await resolveImageUrl();
      var payload = {
        title: title,
        image_url: imageUrl,
        link_url: linkUrl || null,
        is_active: isActive,
        start_date: startDate,
        end_date: endDate,
      };

      var sb = getSupabaseClient();
      if (editingId) {
        var updateRes = await sb.from('popups').update(payload).eq('id', editingId);
        if (updateRes.error) throw updateRes.error;
        alert('팝업이 수정되었습니다.');
      } else {
        var insertRes = await sb.from('popups').insert(payload);
        if (insertRes.error) throw insertRes.error;
        alert('새 팝업이 등록되었습니다.');
      }

      clearForm();
      switchPopupView('list');
      await loadPopups();
    } catch (err) {
      console.error('[Admin Popups] submit failed', err);
      if (err && err.message === 'SIZE_LIMIT') {
        alert('이미지 용량은 최대 2MB까지만 업로드 가능합니다.');
      } else {
        alert(err.message || '저장에 실패했습니다.');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editingId ? '💾 팝업 수정 저장' : '🚀 팝업 등록 완료';
      }
    }
  }

  function bindEvents() {
    var listBtn = document.getElementById('popupTabListBtn');
    var formBtn = document.getElementById('popupTabFormBtn');
    var newBtn = document.getElementById('popupNewBtn');
    var submitBtn = document.getElementById('popupSubmitBtn');
    var cancelBtn = document.getElementById('popupCancelBtn');

    if (listBtn) listBtn.addEventListener('click', function () { switchPopupView('list'); });
    if (formBtn) formBtn.addEventListener('click', function () { switchPopupView('form'); });
    if (newBtn) {
      newBtn.addEventListener('click', function () {
        clearForm();
        switchPopupView('form');
      });
    }
    if (submitBtn) submitBtn.addEventListener('click', submitPopupForm);
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        clearForm();
        switchPopupView('list');
      });
    }

    bindImageInput();
    bindPopupDateInputs();
    syncPopupDateConstraints();
  }

  var popupsInitialized = false;

  async function ensureInit() {
    if (popupsInitialized) {
      await loadPopups();
      return;
    }
    if (!document.getElementById('sectionPopups')) return;
    popupsInitialized = true;
    bindEvents();
    await loadPopups();
  }

  window.AdminPopups = {
    ensureInit: ensureInit,
    switchPopupView: switchPopupView,
    loadPopups: loadPopups,
  };
})();
