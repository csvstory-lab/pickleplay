/**
 * P!CKLE Admin — AI 필터 금칙어 (Supabase banned_keywords)
 */
(function () {
  'use strict';

  var dbClient = null;
  var keywordRows = [];

  function getSupabaseClient() {
    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) {
      return window.supabaseClient;
    }
    throw new Error('Supabase 클라이언트를 초기화할 수 없습니다. supabase-config.js 를 확인해 주세요.');
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updateKeywordCountLabel() {
    var el = document.getElementById('keywordCountLabel');
    if (el) {
      el.textContent = '(현재 ' + keywordRows.length + '개)';
    }
  }

  function renderKeywordTags() {
    var container = document.getElementById('keywordContainer');
    if (!container) return;

    if (!keywordRows.length) {
      container.innerHTML =
        '<span style="color:#71717a;font-size:0.85rem;font-weight:700;">등록된 금칙어가 없습니다.</span>';
      updateKeywordCountLabel();
      return;
    }

    container.innerHTML = keywordRows
      .map(function (row) {
        var id = escapeHtml(row.id);
        var word = escapeHtml(row.keyword);
        return (
          '<div class="kw-tag" data-keyword-id="' +
          id +
          '">' +
          word +
          ' <span class="kw-close" role="button" tabindex="0" aria-label="삭제" onclick="removeKeyword(\'' +
          id +
          '\')">✕</span></div>'
        );
      })
      .join('');

    updateKeywordCountLabel();
  }

  async function loadBannedKeywords() {
    var container = document.getElementById('keywordContainer');
    if (container) {
      container.innerHTML =
        '<span style="color:#71717a;font-size:0.85rem;font-weight:700;">금칙어를 불러오는 중…</span>';
    }

    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('banned_keywords')
        .select('id, keyword, created_at')
        .order('keyword', { ascending: true });

      if (result.error) throw result.error;

      keywordRows = Array.isArray(result.data) ? result.data : [];
      renderKeywordTags();
    } catch (err) {
      console.error('[Admin AI Filter] load keywords failed', err);
      keywordRows = [];
      if (container) {
        container.innerHTML =
          '<span style="color:var(--alert-red);font-size:0.85rem;font-weight:700;">금칙어를 불러오지 못했습니다.</span>';
      }
      updateKeywordCountLabel();
    }
  }

  function handleKeywordEnter(event) {
    if (event && event.key === 'Enter') {
      event.preventDefault();
      window.addKeyword();
    }
  }

  async function addKeyword() {
    var input = document.getElementById('newKeyword');
    if (!input) return;

    var value = String(input.value || '').trim();
    if (!value) {
      alert('차단할 금칙어를 입력해 주세요.');
      return;
    }

    var duplicate = keywordRows.some(function (row) {
      return String(row.keyword || '').trim().toLowerCase() === value.toLowerCase();
    });
    if (duplicate) {
      alert('이미 등록된 금칙어입니다.');
      input.value = '';
      return;
    }

    var addBtn = document.querySelector('.btn-add-keyword');
    if (addBtn) {
      addBtn.disabled = true;
      addBtn.textContent = '추가 중…';
    }

    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('banned_keywords')
        .insert({ keyword: value })
        .select('id, keyword, created_at')
        .single();

      if (result.error) throw result.error;
      if (!result.data) throw new Error('저장된 데이터가 없습니다.');

      keywordRows.push(result.data);
      keywordRows.sort(function (a, b) {
        return String(a.keyword).localeCompare(String(b.keyword), 'ko');
      });
      renderKeywordTags();
      input.value = '';
    } catch (err) {
      console.error('[Admin AI Filter] add keyword failed', err);
      alert(
        '금칙어 추가에 실패했습니다: ' +
          (err && err.message ? err.message : '알 수 없는 오류')
      );
    } finally {
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.textContent = '추가';
      }
    }
  }

  async function removeKeyword(keywordId) {
    if (!keywordId) return;

    var row = keywordRows.find(function (r) {
      return r.id === keywordId;
    });
    var label = row ? row.keyword : '해당 단어';

    if (!confirm('금칙어 [' + label + '] 를 삭제하시겠습니까?')) {
      return;
    }

    try {
      var sb = getSupabaseClient();
      var result = await sb.from('banned_keywords').delete().eq('id', keywordId);

      if (result.error) throw result.error;

      keywordRows = keywordRows.filter(function (r) {
        return r.id !== keywordId;
      });
      renderKeywordTags();
    } catch (err) {
      console.error('[Admin AI Filter] remove keyword failed', err);
      alert(
        '금칙어 삭제에 실패했습니다: ' +
          (err && err.message ? err.message : '알 수 없는 오류')
      );
    }
  }

  window.handleKeywordEnter = handleKeywordEnter;
  window.addKeyword = addKeyword;
  window.removeKeyword = removeKeyword;
  window.loadBannedKeywords = loadBannedKeywords;

  document.addEventListener('DOMContentLoaded', function () {
    var nav = window.PickleAdminNav;
    if (nav && nav.safeInit) {
      nav.safeInit('AiFilter', loadBannedKeywords);
      return;
    }
    loadBannedKeywords();
  });
})();
