/**
 * P!CKLE — 댓글 클린 커뮤니티 (사전 차단 · 사후 블라인드)
 */
(function () {
  'use strict';

  /** @type {string[]} 추후 DB 연동 예정 */
  var BANNED_WORDS = ['바보', '멍청이', '욕설1'];

  var CLEAN_RULE_ALERT =
    '앗! 픽클의 클린 규칙에 어긋나는 표현이 감지되었습니다. 수정 후 다시 등록해 주세요.';

  var BLIND_COMMENT_MESSAGE =
    '🚫 관리자 및 규정 위반 신고에 의해 블라인드 처리된 댓글입니다.';

  function containsBannedWord(text) {
    var normalized = String(text || '').trim();
    if (!normalized) return false;

    for (var i = 0; i < BANNED_WORDS.length; i++) {
      var word = BANNED_WORDS[i];
      if (word && normalized.indexOf(word) !== -1) return true;
    }
    return false;
  }

  /** @returns {boolean} true면 등록 차단(alert 표시됨) */
  function blockIfBanned(text) {
    if (!containsBannedWord(text)) return false;
    alert(CLEAN_RULE_ALERT);
    return true;
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
    BANNED_WORDS: BANNED_WORDS,
    BLIND_COMMENT_MESSAGE: BLIND_COMMENT_MESSAGE,
    containsBannedWord: containsBannedWord,
    blockIfBanned: blockIfBanned,
    isCommentBlinded: isCommentBlinded,
    getDisplayBody: getDisplayBody,
  };
})();
