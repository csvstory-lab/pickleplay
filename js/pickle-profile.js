/**
 * P!CKLE — 프로필 레벨·작성자 스냅샷 공통 유틸
 */
(function () {
  'use strict';

  function getUserLevel(user) {
    if (!user) return 1;
    var meta = user.user_metadata || {};
    var level = Number(meta.level);
    if (!Number.isFinite(level) || level < 1) return 1;
    return Math.floor(level);
  }

  function buildGradeBadgeHtml(userOrLevel) {
    var level =
      typeof userOrLevel === 'number'
        ? userOrLevel
        : getUserLevel(userOrLevel);
    if (!Number.isFinite(level) || level < 1) level = 1;
    return '<span class="grade-badge">Lv.' + level + '</span>';
  }

  function extractAuthorSnapshot(user, overrides) {
    var opts = overrides || {};
    var meta = (user && user.user_metadata) || {};
    var nickname =
      opts.nickname != null
        ? String(opts.nickname).trim()
        : meta.nickname
          ? String(meta.nickname).trim()
          : '';

    if (!nickname && user && user.email) {
      nickname = String(user.email).split('@')[0] || '';
    }
    if (!nickname) {
      nickname = '픽클러';
    }

    var avatarHtml =
      opts.avatar_html != null ? String(opts.avatar_html).trim() : '';

    if (!avatarHtml && meta.avatar_html && String(meta.avatar_html).trim()) {
      avatarHtml = String(meta.avatar_html).trim();
    } else if (
      !avatarHtml &&
      meta.avatar_emoji &&
      String(meta.avatar_emoji).trim()
    ) {
      avatarHtml = String(meta.avatar_emoji).trim();
    } else if (!avatarHtml) {
      var avatarUrl = meta.avatar_url || meta.picture || meta.avatar || '';
      if (avatarUrl) {
        avatarHtml =
          '<img src="' +
          String(avatarUrl).replace(/"/g, '&quot;') +
          '" alt="">';
      } else {
        avatarHtml = '🥒';
      }
    }

    return {
      author_nickname: nickname,
      author_avatar_html: avatarHtml,
    };
  }

  window.PickleProfile = {
    getUserLevel: getUserLevel,
    buildGradeBadgeHtml: buildGradeBadgeHtml,
    extractAuthorSnapshot: extractAuthorSnapshot,
  };
})();
