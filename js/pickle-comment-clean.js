/**
 * P!CKLE — 댓글 클린 커뮤니티 (사전 차단 · 사후 블라인드)
 */
(function () {
  'use strict';

  var CLEAN_RULE_ALERT =
    '앗! 픽클의 클린 규칙에 어긋나는 표현이 감지되었습니다. 수정 후 다시 등록해 주세요.';

  var BLIND_COMMENT_MESSAGE =
    '🚫 관리자 및 규정 위반 신고에 의해 블라인드 처리된 댓글입니다.';

  /** @type {{ term: string, match_mode?: string, entry_type?: string }[]} */
  var bannedEntries = [];
  var loadPromise = null;
  var loadDone = false;

  function getBannedTerms() {
    return bannedEntries
      .map(function (entry) {
        return entry && entry.term ? String(entry.term).trim() : '';
      })
      .filter(Boolean);
  }

  function matchesBannedEntry(text, entry) {
    if (!entry) return false;
    var term = entry.term ? String(entry.term).trim() : '';
    if (!term) return false;

    var normalized = String(text || '');
    var mode = entry.match_mode || 'contains';

    if (mode === 'exact') {
      var trimmed = normalized.trim();
      return trimmed === term || trimmed.toLowerCase() === term.toLowerCase();
    }

    if (mode === 'regex') {
      try {
        return new RegExp(term, 'i').test(normalized);
      } catch (err) {
        console.warn('[P!CKLE CommentClean] 잘못된 regex 패턴:', term, err);
        return false;
      }
    }

    return normalized.indexOf(term) !== -1;
  }

  function containsBannedWord(text) {
    var normalized = String(text || '').trim();
    if (!normalized || !bannedEntries.length) return false;

    for (var i = 0; i < bannedEntries.length; i++) {
      if (matchesBannedEntry(normalized, bannedEntries[i])) return true;
    }
    return false;
  }

  /** @returns {boolean} true면 등록 차단(alert 표시됨) */
  function blockIfBanned(text) {
    if (!containsBannedWord(text)) return false;
    alert(CLEAN_RULE_ALERT);
    return true;
  }

  /** @returns {Promise<boolean>} true면 등록 차단(alert 표시됨) */
  async function blockIfBannedAsync(text) {
    await ensureBannedWordsLoaded();
    return blockIfBanned(text);
  }

  function isCommentBlinded(comment) {
    if (!comment) return false;
    if (comment.is_blind === true) return true;
    return comment.visibility_status === 'blinded';
  }

  function getDisplayBody(comment) {
    if (isCommentBlinded(comment)) return BLIND_COMMENT_MESSAGE;
    return comment.filtered_content || comment.content || '';
  }

  async function loadBannedWords() {
    if (loadPromise) return loadPromise;

    loadPromise = (async function () {
      bannedEntries = [];

      try {
        var sb =
          window.PickleSupabase && window.PickleSupabase.getClient
            ? window.PickleSupabase.getClient()
            : null;

        if (!sb) {
          console.warn('[P!CKLE CommentClean] Supabase 클라이언트 없음 — 금지어 목록을 불러오지 못했습니다.');
          return;
        }

        var result = await sb.from('banned_words').select('term, match_mode, entry_type');

        if (result.error) {
          console.warn('[P!CKLE CommentClean] 금지어 로드 실패', result.error);
          return;
        }

        bannedEntries = (result.data || []).filter(function (row) {
          if (!row || !row.term) return false;
          var type = row.entry_type || 'word';
          return type === 'word' || type === 'url_pattern';
        });
      } catch (err) {
        console.warn('[P!CKLE CommentClean] 금지어 로드 예외', err);
      } finally {
        loadDone = true;
      }
    })();

    return loadPromise;
  }

  function ensureBannedWordsLoaded() {
    return loadDone ? Promise.resolve() : loadBannedWords();
  }

  window.PickleCommentClean = {
    get BANNED_WORDS() {
      return getBannedTerms();
    },
    BLIND_COMMENT_MESSAGE: BLIND_COMMENT_MESSAGE,
    loadBannedWords: loadBannedWords,
    ensureBannedWordsLoaded: ensureBannedWordsLoaded,
    containsBannedWord: containsBannedWord,
    blockIfBanned: blockIfBanned,
    blockIfBannedAsync: blockIfBannedAsync,
    isCommentBlinded: isCommentBlinded,
    getDisplayBody: getDisplayBody,
  };

  loadBannedWords();
})();
