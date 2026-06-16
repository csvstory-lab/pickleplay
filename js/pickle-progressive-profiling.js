/**
 * P!CKLE — Progressive Profiling (투표 마일스톤 기반 취향 모달 유도)
 * 1·5·10번째 투표 완료 직후에만 UserInfoModal 자동 표시 (회원가입 직후 X)
 */
(function () {
  'use strict';

  var MILESTONES = [1, 5, 10];
  var VOTE_COUNT_PREFIX = 'pickle_lifetime_vote_count_';
  var NUDGE_SHOWN_PREFIX = 'pickle_profile_nudge_shown_';

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function voteCountKey(userId) {
    return VOTE_COUNT_PREFIX + userId;
  }

  function nudgeShownKey(userId) {
    return NUDGE_SHOWN_PREFIX + userId;
  }

  function getVoteCount(userId) {
    if (!userId) return 0;
    var n = parseInt(localStorage.getItem(voteCountKey(userId)) || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function getShownMilestones(userId) {
    if (!userId) return [];
    var arr = readJson(nudgeShownKey(userId), []);
    return Array.isArray(arr) ? arr : [];
  }

  function markMilestoneShown(userId, milestone) {
    if (!userId) return;
    var shown = getShownMilestones(userId);
    if (shown.indexOf(milestone) === -1) {
      shown.push(milestone);
      writeJson(nudgeShownKey(userId), shown);
    }
  }

  function isInfoCollected(profile) {
    return profile && profile.is_info_collected === true;
  }

  /**
   * 투표 저장 성공 직후 호출
   * @returns {{ voteCount: number, shouldPrompt: boolean, milestone: number|null }}
   */
  function recordVoteCompleted(profile) {
    var userId = profile && profile.id;
    if (!userId) {
      return { voteCount: 0, shouldPrompt: false, milestone: null };
    }

    if (isInfoCollected(profile)) {
      return {
        voteCount: getVoteCount(userId),
        shouldPrompt: false,
        milestone: null,
      };
    }

    var nextCount = getVoteCount(userId) + 1;
    try {
      localStorage.setItem(voteCountKey(userId), String(nextCount));
    } catch (_) {}

    if (MILESTONES.indexOf(nextCount) === -1) {
      return { voteCount: nextCount, shouldPrompt: false, milestone: null };
    }

    var shown = getShownMilestones(userId);
    if (shown.indexOf(nextCount) !== -1) {
      return { voteCount: nextCount, shouldPrompt: false, milestone: null };
    }

    markMilestoneShown(userId, nextCount);
    return { voteCount: nextCount, shouldPrompt: true, milestone: nextCount };
  }

  function promptAfterVote(profile, options) {
    var opts = options || {};
    var result = recordVoteCompleted(profile);
    if (!result.shouldPrompt) return result;

    if (window.PickleUserInfoModal && window.PickleUserInfoModal.open) {
      var delay = typeof opts.delayMs === 'number' ? opts.delayMs : 1000;
      setTimeout(function () {
        if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
          window.PickleAuth.ensureAuthenticated({ forceRefresh: true })
            .then(function (ctx) {
              if (isInfoCollected(ctx && ctx.profile)) return;
              window.PickleUserInfoModal.open();
            })
            .catch(function () {
              if (!isInfoCollected(profile)) {
                window.PickleUserInfoModal.open();
              }
            });
          return;
        }
        if (!isInfoCollected(profile)) {
          window.PickleUserInfoModal.open();
        }
      }, delay);
    }

    return result;
  }

  window.PickleProgressiveProfiling = {
    MILESTONES: MILESTONES.slice(),
    getVoteCount: getVoteCount,
    getShownMilestones: getShownMilestones,
    recordVoteCompleted: recordVoteCompleted,
    promptAfterVote: promptAfterVote,
    isInfoCollected: isInfoCollected,
  };
})();
