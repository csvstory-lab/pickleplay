/**
 * P!CKLE — 댓글 클린 커뮤니티 (사전 차단 · 사후 블라인드)
 */
(function () {
  'use strict';

  var CLEAN_RULE_ALERT =
    '앗! 픽클의 클린 규칙에 어긋나는 표현이 감지되었습니다. 수정 후 다시 등록해 주세요.';

  var BLIND_COMMENT_MESSAGE =
    '🚫 관리자 및 규정 위반 신고에 의해 블라인드 처리된 댓글입니다.';

  function getSupabaseClient(sb) {
    if (sb) return sb;
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    return null;
  }

  /**
   * DB에서 금지어(term) 문자열 배열 조회 — 실패 시 빈 배열
   * @returns {Promise<string[]>}
   */
  async function fetchBannedTermsList(client) {
    var result = await client
      .from('banned_words')
      .select('term')
      .eq('entry_type', 'word');

    if (result.error) {
      console.error('금지어 로드 실패:', result.error);
      return [];
    }

    return (result.data || [])
      .map(function (item) {
        return item && item.term != null ? String(item.term).trim() : '';
      })
      .filter(function (term) {
        return Boolean(term);
      });
  }

  /**
   * 등록 버튼 클릭 시점에 DB에서 금지어를 즉시 조회해 검사
   * @returns {Promise<boolean>} true면 차단됨(alert 표시, insert 중단)
   */
  async function blockCommentOnSubmit(commentText, sb) {
    var client = getSupabaseClient(sb);
    if (!client) {
      console.warn('[P!CKLE CommentClean] Supabase 클라이언트 없음 — 금지어 검사 생략');
      return false;
    }

    var commentTextStr = String(commentText ?? '');
    var bannedWordsList = await fetchBannedTermsList(client);

    console.log('금지어 목록:', bannedWordsList);
    console.log('입력된 댓글:', commentTextStr);

    var blocked = bannedWordsList.some(function (term) {
      return commentTextStr.includes(term);
    });

    if (blocked) {
      alert(CLEAN_RULE_ALERT);
      return true;
    }

    return false;
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
    BLIND_COMMENT_MESSAGE: BLIND_COMMENT_MESSAGE,
    blockCommentOnSubmit: blockCommentOnSubmit,
    fetchBannedTermsList: fetchBannedTermsList,
    isCommentBlinded: isCommentBlinded,
    getDisplayBody: getDisplayBody,
  };
})();
