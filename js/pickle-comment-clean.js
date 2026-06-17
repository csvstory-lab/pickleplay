/**
 * P!CKLE — 댓글 클린 커뮤니티 (사전 차단 · 사후 블라인드)
 */
(function () {
  'use strict';

  var CLEAN_RULE_ALERT =
    '앗! 픽클의 클린 규칙에 어긋나는 표현이 감지되었습니다. 수정 후 다시 등록해 주세요.';

  var BLIND_COMMENT_MESSAGE =
    '🚫 관리자 및 규정 위반 신고에 의해 블라인드 처리된 댓글입니다.';

  /** @type {string[]} DB에서 불러온 금지어(term) 목록 */
  var bannedWords = [];

  /** @type {{ term: string, match_mode?: string }[]} URL 패턴 등 regex 전용 */
  var regexPatterns = [];

  var loadPromise = null;
  var loadAttempt = 0;
  var MAX_LOAD_ATTEMPTS = 3;

  function resetLoadState() {
    loadPromise = null;
  }

  function applyBannedRows(rows) {
    bannedWords = [];
    regexPatterns = [];

    (rows || []).forEach(function (row) {
      if (!row || !row.term) return;

      var term = String(row.term).trim();
      if (!term) return;

      var entryType = row.entry_type || 'word';

      if (entryType === 'word') {
        bannedWords.push(term);
        return;
      }

      if (entryType === 'url_pattern') {
        regexPatterns.push({
          term: term,
          match_mode: row.match_mode || 'regex',
        });
      }
    });
  }

  /**
   * 부분 일치(includes) — 공백 제거하지 않은 원본 문자열 기준
   * @param {string} text
   */
  function containsBannedWord(text) {
    var raw = String(text ?? '');
    if (!raw) return false;

    var hasBannedSubstring = bannedWords.some(function (word) {
      return word && raw.includes(word);
    });

    if (hasBannedSubstring) return true;

    return regexPatterns.some(function (entry) {
      if (!entry || !entry.term) return false;
      try {
        return new RegExp(entry.term, 'i').test(raw);
      } catch (err) {
        console.warn('[P!CKLE CommentClean] 잘못된 regex 패턴:', entry.term, err);
        return raw.includes(entry.term);
      }
    });
  }

  /** @returns {boolean} true면 등록 차단(alert 표시됨) */
  function blockIfBanned(text) {
    if (!containsBannedWord(text)) return false;
    alert(CLEAN_RULE_ALERT);
    return true;
  }

  async function fetchBannedWordsFromDb() {
    var sb =
      window.PickleSupabase && window.PickleSupabase.getClient
        ? window.PickleSupabase.getClient()
        : null;

    if (!sb) {
      throw new Error('Supabase 클라이언트 없음');
    }

    var result = await sb.from('banned_words').select('term, match_mode, entry_type');

    if (result.error) {
      throw result.error;
    }

    applyBannedRows(result.data || []);
  }

  async function loadBannedWords(options) {
    options = options || {};

    if (loadPromise && !options.force) {
      return loadPromise;
    }

    loadPromise = (async function () {
      loadAttempt += 1;

      try {
        await fetchBannedWordsFromDb();
      } catch (err) {
        console.warn('[P!CKLE CommentClean] 금지어 로드 실패', err);
        if (!options.keepExisting) {
          bannedWords = [];
          regexPatterns = [];
        }
      }
    })();

    return loadPromise;
  }

  /** 등록 검사 전 반드시 await — 로드 완료·재시도까지 보장 */
  async function ensureBannedWordsLoaded() {
    await loadBannedWords();

    while (!bannedWords.length && !regexPatterns.length && loadAttempt < MAX_LOAD_ATTEMPTS) {
      var hasClient =
        window.PickleSupabase && typeof window.PickleSupabase.getClient === 'function';

      if (!hasClient) break;

      resetLoadState();
      await loadBannedWords({ force: true });
    }

    return bannedWords;
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

  window.PickleCommentClean = {
    get BANNED_WORDS() {
      return bannedWords.slice();
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
