/**
 * P!CKLE — 클린 커뮤니티 (1단계 차단 · 1.5단계 순화 · 사후 블라인드)
 * 1단계 금칙어: Supabase banned_keywords 테이블 (관리자 admin_ai_filter 연동)
 */
(function () {
  'use strict';

  var CLEAN_RULE_ALERT =
    '앗! 픽클의 클린 규칙에 어긋나는 표현이 감지되었습니다. 수정 후 다시 등록해 주세요.';

  var BLIND_COMMENT_MESSAGE =
    '🚫 관리자 및 규정 위반 신고에 의해 블라인드 처리된 댓글입니다.';

  /** 1.5단계 완충지대 — 등록은 허용, 단어만 ** 로 순화 */
  var SOFT_BAD_WORDS = ['바보', '멍청이', '악플러'];

  var bannedKeywordsCache = null;
  var bannedKeywordsCacheAt = 0;
  var BANNED_KEYWORDS_CACHE_MS = 30000;

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function maskSoftBadWords(text) {
    var result = String(text ?? '');
    var wasMasked = false;

    SOFT_BAD_WORDS.forEach(function (word) {
      if (!word) return;
      var re = new RegExp(escapeRegExp(word), 'gi');
      var next = result.replace(re, '**');
      if (next !== result) wasMasked = true;
      result = next;
    });

    return { text: result, wasMasked: wasMasked };
  }

  function getSupabaseClient(sb) {
    if (sb) return sb;

    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) {
      return window.supabaseClient;
    }

    try {
      if (window.PickleSupabase && window.PickleSupabase.getClient) {
        return window.PickleSupabase.getClient();
      }
    } catch (err) {
      console.warn('[P!CKLE CommentClean] PickleSupabase.getClient 실패', err);
    }

    try {
      if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.getClient) {
        return window.PickleSupabaseBootstrap.getClient();
      }
    } catch (err) {
      console.warn('[P!CKLE CommentClean] PickleSupabaseBootstrap.getClient 실패', err);
    }

    return null;
  }

  function showCleanRuleAlert() {
    alert(CLEAN_RULE_ALERT);
  }

  function normalizeKeywordList(rows) {
    return (rows || [])
      .map(function (item) {
        if (!item) return '';
        if (typeof item === 'string') return item.trim();
        return item.keyword != null ? String(item.keyword).trim() : '';
      })
      .filter(function (keyword) {
        return Boolean(keyword);
      });
  }

  function invalidateBannedKeywordsCache() {
    bannedKeywordsCache = null;
    bannedKeywordsCacheAt = 0;
  }

  /**
   * Supabase banned_keywords → 문자열 배열
   * @param {{ forceRefresh?: boolean }} [options]
   * @returns {Promise<string[]>}
   */
  async function fetchBannedKeywordsList(client, options) {
    options = options || {};
    var now = Date.now();

    if (
      !options.forceRefresh &&
      bannedKeywordsCache &&
      now - bannedKeywordsCacheAt < BANNED_KEYWORDS_CACHE_MS
    ) {
      return bannedKeywordsCache;
    }

    var result = await client
      .from('banned_keywords')
      .select('keyword')
      .order('keyword', { ascending: true });

    if (result.error) {
      console.error('[P!CKLE CommentClean] banned_keywords 로드 실패:', result.error);
      return bannedKeywordsCache || [];
    }

    bannedKeywordsCache = normalizeKeywordList(result.data);
    bannedKeywordsCacheAt = now;
    return bannedKeywordsCache;
  }

  /** @deprecated banned_keywords 사용 — 하위 호환 alias */
  async function fetchBannedTermsList(client, options) {
    return fetchBannedKeywordsList(client, options);
  }

  function textContainsBannedKeyword(text, keywords) {
    var haystack = String(text ?? '').toLowerCase();
    if (!haystack) return false;

    return keywords.some(function (keyword) {
      if (!keyword) return false;
      return haystack.indexOf(String(keyword).toLowerCase()) !== -1;
    });
  }

  /**
   * 1단계: 텍스트에 금칙어 포함 시 alert + true 반환(차단)
   * @returns {Promise<boolean>}
   */
  async function blockTextOnSubmit(text, sb) {
    var client = getSupabaseClient(sb);
    if (!client) {
      console.error('[P!CKLE CommentClean] Supabase 클라이언트 없음 — 금칙어 검사 불가');
      return false;
    }

    var keywords = await fetchBannedKeywordsList(client, { forceRefresh: true });
    if (!keywords.length) return false;

    if (textContainsBannedKeyword(text, keywords)) {
      showCleanRuleAlert();
      if (window.PicklePenalties && window.PicklePenalties.tryAutoPenaltyOnDetection) {
        window.PicklePenalties.tryAutoPenaltyOnDetection('profanity_block').catch(function (err) {
          console.warn('[P!CKLE CommentClean] [자동 제재 Track] 벌점 부여 실패', err);
        });
      }
      return true;
    }

    return false;
  }

  async function blockCommentOnSubmit(commentText, sb) {
    return blockTextOnSubmit(commentText, sb);
  }

  /**
   * 불판 등록: 제목·선택지·설명 통합 검사
   * @param {{ title?: string, optionA?: string, optionB?: string, description?: string }} formData
   * @returns {Promise<boolean>} true면 차단됨
   */
  async function blockPostOnSubmit(formData, sb) {
    formData = formData || {};
    var combined = [
      formData.title,
      formData.optionA,
      formData.optionB,
      formData.description,
      formData.hashtags,
    ]
      .filter(function (part) {
        return part != null && String(part).trim() !== '';
      })
      .join(' ');

    return blockTextOnSubmit(combined, sb);
  }

  async function prepareCommentForInsert(rawText, sb) {
    if (await blockCommentOnSubmit(rawText, sb)) {
      return { ok: false };
    }

    var trimmed = String(rawText ?? '').trim();
    var maskResult = maskSoftBadWords(trimmed);

    return {
      ok: true,
      text: maskResult.text,
      wasMasked: maskResult.wasMasked,
    };
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
    CLEAN_RULE_ALERT: CLEAN_RULE_ALERT,
    BLIND_COMMENT_MESSAGE: BLIND_COMMENT_MESSAGE,
    SOFT_BAD_WORDS: SOFT_BAD_WORDS,
    showCleanRuleAlert: showCleanRuleAlert,
    blockTextOnSubmit: blockTextOnSubmit,
    blockCommentOnSubmit: blockCommentOnSubmit,
    blockPostOnSubmit: blockPostOnSubmit,
    maskSoftBadWords: maskSoftBadWords,
    prepareCommentForInsert: prepareCommentForInsert,
    fetchBannedKeywordsList: fetchBannedKeywordsList,
    fetchBannedTermsList: fetchBannedTermsList,
    invalidateBannedKeywordsCache: invalidateBannedKeywordsCache,
    textContainsBannedKeyword: textContainsBannedKeyword,
    isCommentBlinded: isCommentBlinded,
    getDisplayBody: getDisplayBody,
  };
})();
