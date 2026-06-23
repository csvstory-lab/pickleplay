/**
 * P!CKLE — 프로필 레벨(포인트 기반)·작성자 스냅샷 공통 유틸
 */
(function () {
  'use strict';

  /** @type {Map<string, number>} */
  var rankingPointsCache = new Map();

  /**
   * 레벨 가이드 기준 (가이드 팝업·마이페이지 게이지와 동일)
   * min: 해당 레벨 시작 점수(포함), max: 해당 레벨 상한(포함, Lv.5는 없음)
   */
  var LEVEL_TIERS = [
    { level: 1, min: 0, max: 99, label: '새내기 픽클러' },
    { level: 2, min: 100, max: 299, label: '활동 시작' },
    { level: 3, min: 300, max: 599, label: '인기 픽클러' },
    { level: 4, min: 600, max: 999, label: '영향력 확장' },
    { level: 5, min: 1000, max: null, label: '명예의 전당' },
  ];

  function normalizeRankingPoints(raw) {
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  function getLevelTier(level) {
    var lv = Number(level);
    if (!Number.isFinite(lv) || lv < 1) lv = 1;
    if (lv > LEVEL_TIERS.length) lv = LEVEL_TIERS.length;
    return LEVEL_TIERS[lv - 1];
  }

  function calculateLevel(points) {
    var p = normalizeRankingPoints(points);
    var i = LEVEL_TIERS.length - 1;
    while (i > 0 && p < LEVEL_TIERS[i].min) {
      i -= 1;
    }
    return LEVEL_TIERS[i].level;
  }

  /**
   * @returns {{
   *   level: number,
   *   points: number,
   *   currentMin: number,
   *   nextMin: number|null,
   *   percent: number,
   *   expText: string,
   *   isMax: boolean
   * }}
   */
  function getLevelProgress(points) {
    var p = normalizeRankingPoints(points);
    var level = calculateLevel(p);
    var tier = getLevelTier(level);
    var currentMin = tier.min;

    if (level >= LEVEL_TIERS.length) {
      return {
        level: level,
        points: p,
        currentMin: currentMin,
        nextMin: null,
        percent: 100,
        expText: p.toLocaleString() + ' / MAX',
        isMax: true,
      };
    }

    var nextTier = getLevelTier(level + 1);
    var nextMin = nextTier.min;
    var span = nextMin - currentMin;
    var ratio = span > 0 ? (p - currentMin) / span : 0;
    var percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));

    return {
      level: level,
      points: p,
      currentMin: currentMin,
      nextMin: nextMin,
      percent: percent,
      expText: p.toLocaleString() + ' / ' + nextMin.toLocaleString(),
      isMax: false,
    };
  }

  function extractRankingPointsFromRow(row) {
    if (!row) return 0;
    if (row.star_score != null && row.star_score !== '') {
      return normalizeRankingPoints(row.star_score);
    }
    if (row.ranking_points != null && row.ranking_points !== '') {
      return normalizeRankingPoints(row.ranking_points);
    }
    if (row.rankingPoints != null && row.rankingPoints !== '') {
      return normalizeRankingPoints(row.rankingPoints);
    }
    return 0;
  }

  function buildLevelBadgeHtml(level) {
    var lv = Number(level);
    if (!Number.isFinite(lv) || lv < 1) lv = 1;
    if (lv > LEVEL_TIERS.length) lv = LEVEL_TIERS.length;
    return '<span class="grade-badge">Lv.' + Math.floor(lv) + '</span>';
  }

  function buildLevelBadgeFromPoints(points) {
    return buildLevelBadgeHtml(calculateLevel(points));
  }

  function getUserLevelFromPoints(points) {
    return calculateLevel(points);
  }

  function clearRankingPointsCache(userId) {
    if (userId) {
      rankingPointsCache.delete(String(userId));
      return;
    }
    rankingPointsCache.clear();
  }

  async function fetchRankingPoints(sb, userId) {
    if (!sb || !userId) return 0;

    var cacheKey = String(userId);
    if (rankingPointsCache.has(cacheKey)) {
      return rankingPointsCache.get(cacheKey);
    }

    var result = await sb
      .from('users')
      .select('id, star_score')
      .eq('id', userId)
      .maybeSingle();

    if (result.error) {
      console.warn('[P!CKLE Profile] ranking points fetch failed', result.error);
      return 0;
    }

    var points = extractRankingPointsFromRow(result.data);
    rankingPointsCache.set(cacheKey, points);
    return points;
  }

  async function fetchRankingPointsMap(sb, userIds) {
    var map = new Map();
    if (!sb || !userIds || !userIds.length) return map;

    var missing = [];
    userIds.forEach(function (id) {
      if (!id) return;
      var key = String(id);
      if (rankingPointsCache.has(key)) {
        map.set(key, rankingPointsCache.get(key));
      } else if (missing.indexOf(key) === -1) {
        missing.push(key);
      }
    });

    if (missing.length) {
      var result = await sb
        .from('users')
        .select('id, star_score')
        .in('id', missing);

      if (result.error) {
        console.warn('[P!CKLE Profile] ranking points batch fetch failed', result.error);
      } else {
        (result.data || []).forEach(function (row) {
          if (!row || !row.id) return;
          var pts = extractRankingPointsFromRow(row);
          var key = String(row.id);
          rankingPointsCache.set(key, pts);
          map.set(key, pts);
        });
      }

      missing.forEach(function (id) {
        if (!map.has(id)) {
          map.set(id, 0);
          rankingPointsCache.set(id, 0);
        }
      });
    }

    return map;
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

  /** @deprecated metadata.level 대신 calculateLevel(points) 사용 */
  function getUserLevel(user) {
    if (user && user._rankingPoints != null) {
      return calculateLevel(user._rankingPoints);
    }
    if (user && user.star_score != null) {
      return calculateLevel(user.star_score);
    }
    if (user && user.ranking_points != null) {
      return calculateLevel(user.ranking_points);
    }
    return 1;
  }

  function buildGradeBadgeHtml(userOrLevelOrPoints) {
    if (typeof userOrLevelOrPoints === 'number') {
      var n = userOrLevelOrPoints;
      if (n >= 1 && n <= LEVEL_TIERS.length && Math.floor(n) === n) {
        return buildLevelBadgeHtml(n);
      }
      return buildLevelBadgeFromPoints(n);
    }
    if (userOrLevelOrPoints && userOrLevelOrPoints._rankingPoints != null) {
      return buildLevelBadgeFromPoints(userOrLevelOrPoints._rankingPoints);
    }
    return buildLevelBadgeFromPoints(extractRankingPointsFromRow(userOrLevelOrPoints));
  }

  /**
   * 공식 랭킹 포인트 가이드 (increment_star_score RPC)
   * 본인: VOTE +1 · COMMENT +3 · SHARE +5
   * 타인: PICK_ME +10 · LIKE_MILESTONE +2(작성자, award_post_like_milestone)
   * 서버: HONOR_TOP10 +500 · BEST_COMMENT +50 (DB 트리거)
   */
  var STAR_SCORE_GUIDE = {
    VOTE: 1,
    COMMENT: 3,
    SHARE: 5,
    PICK_ME: 10,
    LIKE_MILESTONE: 2,
    HONOR_TOP10: 500,
    BEST_COMMENT: 50,
  };

  /** @deprecated STAR_SCORE_GUIDE 사용 */
  var STAR_SCORE_DELTAS = STAR_SCORE_GUIDE;

  function getSupabaseClientForScore() {
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.getClient) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    return null;
  }

  function notifyStarScoreUpdated(userId) {
    clearRankingPointsCache(userId);
    try {
      window.dispatchEvent(
        new CustomEvent('pickle:star-score-updated', {
          detail: { userId: String(userId) },
        })
      );
    } catch (e) {
      /* noop */
    }
  }

  var SCORE_ENGINE_SKIP_REASONS = {
    already_awarded: true,
    not_milestone: true,
    vote_not_found: true,
    comment_not_found: true,
    share_not_found: true,
    follow_not_found: true,
    self_follow: true,
    count_mismatch: true,
    zero_delta: true,
  };

  function logScoreEngineError(context, error, meta) {
    var detail = {
      context: context || 'unknown',
      meta: meta || null,
    };
    if (error && typeof error === 'object') {
      detail.error = error;
      if (error.message) detail.message = error.message;
      if (error.code) detail.code = error.code;
      if (error.details) detail.details = error.details;
      if (error.hint) detail.hint = error.hint;
    } else if (error != null) {
      detail.error = error;
    }
    console.error('[Score Engine Error]', detail);
  }

  function logScoreEngineSkip(context, payload, meta) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[Score Engine] skipped', context, payload && payload.reason, meta || '');
    }
  }

  function invalidateStarScoreCacheForUser(userId) {
    if (userId) {
      clearRankingPointsCache(userId);
      notifyStarScoreUpdated(userId);
      return;
    }
    clearRankingPointsCache();
  }

  /**
   * increment_star_score RPC (p_amount, p_target_id)
   * @param {number} amount
   * @param {string|null|undefined} targetUserId — 생략 시 본인(auth.uid())
   * @param {string} [context]
   */
  async function tryIncrementStarScore(amount, targetUserId, context) {
    var ctx = context || 'tryIncrementStarScore';
    var points = Math.floor(Number(amount));
    if (!Number.isFinite(points) || points <= 0) {
      logScoreEngineError(ctx, { message: 'invalid p_amount', amount: amount });
      return { ok: false, reason: 'invalid_amount' };
    }

    var sb = getSupabaseClientForScore();
    if (!sb) {
      logScoreEngineError(ctx, { message: 'Supabase client unavailable' }, { p_amount: points });
      return { ok: false, reason: 'no_client' };
    }

    var rpcParams = { p_amount: points };
    if (targetUserId) {
      rpcParams.p_target_id = String(targetUserId);
    }

    try {
      var result = await sb.rpc('increment_star_score', rpcParams);

      if (result.error) {
        logScoreEngineError(ctx, result.error, rpcParams);
        return { ok: false, reason: 'rpc_error', error: result.error };
      }

      var payload = result.data || {};
      if (payload.ok === false) {
        if (payload.reason !== 'follow_required' && payload.reason !== 'already_awarded') {
          logScoreEngineError(ctx, payload, rpcParams);
        }
        return payload;
      }

      var beneficiaryId =
        (payload && payload.user_id) ||
        targetUserId ||
        (function () {
          if (window.PickleAuth && window.PickleAuth.getUser) {
            var u = window.PickleAuth.getUser();
            return u && u.id ? u.id : null;
          }
          return null;
        })() ||
        null;
      invalidateStarScoreCacheForUser(beneficiaryId);

      return { ok: true, data: payload };
    } catch (err) {
      logScoreEngineError(ctx, err, rpcParams);
      return { ok: false, reason: 'exception', error: err };
    }
  }

  function tryIncrementStarScoreFireAndForget(amount, targetUserId, context) {
    tryIncrementStarScore(amount, targetUserId, context).catch(function (err) {
      logScoreEngineError(context || 'tryIncrementStarScoreFireAndForget', err, {
        p_amount: amount,
        p_target_id: targetUserId || null,
      });
    });
  }

  /**
   * 본인 star_score 증가 (p_target_id 생략)
   */
  async function tryIncrementSelfStarScore(amount, context) {
    return tryIncrementStarScore(amount, null, context || 'tryIncrementSelfStarScore');
  }

  function tryIncrementSelfStarScoreFireAndForget(amount, context) {
    tryIncrementStarScoreFireAndForget(amount, null, context || 'tryIncrementSelfStarScore');
  }

  /**
   * 좋아요 10·20·30… 마일스톤 — 불판 작성자 +2 (award_post_like_milestone RPC)
   */
  async function tryAwardLikeMilestone(postId, context) {
    var ctx = context || 'tryAwardLikeMilestone';
    if (!postId) {
      return { ok: false, awarded: false, reason: 'post_id_required' };
    }

    var sb = getSupabaseClientForScore();
    if (!sb) {
      logScoreEngineError(ctx, { message: 'Supabase client unavailable' }, { postId: postId });
      return { ok: false, awarded: false, reason: 'no_client' };
    }

    try {
      var result = await sb.rpc('award_post_like_milestone', { p_post_id: postId });

      if (result.error) {
        logScoreEngineError(ctx, result.error, { postId: postId });
        return { ok: false, awarded: false, reason: 'rpc_error', error: result.error };
      }

      var payload = result.data || {};
      if (payload.awarded === false && payload.reason === 'already_awarded') {
        logScoreEngineSkip(ctx, payload, { postId: postId });
      } else if (payload.ok === false || (payload.awarded === false && payload.reason !== 'not_milestone')) {
        logScoreEngineError(ctx, payload, { postId: postId });
      }

      if (payload.awarded && payload.user_id) {
        invalidateStarScoreCacheForUser(payload.user_id);
      }

      return payload;
    } catch (err) {
      logScoreEngineError(ctx, err, { postId: postId });
      return { ok: false, awarded: false, reason: 'exception', error: err };
    }
  }

  function tryAwardLikeMilestoneFireAndForget(postId, context) {
    tryAwardLikeMilestone(postId, context).catch(function (err) {
      logScoreEngineError(context || 'tryAwardLikeMilestoneFireAndForget', err, { postId: postId });
    });
  }

  /**
   * @deprecated tryIncrementStarScore 사용
   */
  async function incrementStarScore(userId, delta, options) {
    var opts = options || {};
    var context = opts.context || 'incrementStarScore';

    if (!userId) {
      logScoreEngineError(context, { message: 'userId is required' });
      return { ok: false, reason: 'invalid_user' };
    }

    var amount = Number(delta);
    if (!Number.isFinite(amount) || amount === 0) {
      logScoreEngineError(context, { message: 'delta must be a non-zero number', delta: delta });
      return { ok: false, reason: 'invalid_delta' };
    }

    var sb = getSupabaseClientForScore();
    if (!sb) {
      logScoreEngineError(context, { message: 'Supabase client unavailable' }, { userId: userId });
      return { ok: false, reason: 'no_client' };
    }

    try {
      var result = await sb.rpc('increment_star_score', {
        p_amount: Math.floor(Math.abs(amount)),
        p_target_id: userId,
      });

      if (result.error) {
        logScoreEngineError(context, result.error, { userId: userId, delta: amount });
        return { ok: false, reason: 'rpc_error', error: result.error };
      }

      var payload = result.data || {};
      if (payload.ok === false) {
        logScoreEngineError(context, payload, { userId: userId, delta: amount });
        return payload;
      }

      notifyStarScoreUpdated(userId);
      return payload;
    } catch (err) {
      logScoreEngineError(context, err, { userId: userId, delta: amount });
      return { ok: false, reason: 'exception', error: err };
    }
  }

  async function updateUserScore(userId, actionType, extraData) {
    var context = 'updateUserScore:' + String(actionType || '');

    if (!userId || !actionType) {
      logScoreEngineError(context, { message: 'userId and actionType are required' }, {
        userId: userId,
        actionType: actionType,
      });
      return { ok: false, awarded: false, reason: 'invalid_args' };
    }

    var action = String(actionType).toUpperCase();
    var extra = extraData && typeof extraData === 'object' ? extraData : {};

    if (action === 'LIKE_MILESTONE') {
      var likes = Number(extra.currentLikes);
      if (!Number.isFinite(likes) || likes < 10 || likes % 10 !== 0) {
        return { ok: true, awarded: false, reason: 'not_milestone' };
      }
    }

    var sb = getSupabaseClientForScore();
    if (!sb) {
      logScoreEngineError(context, { message: 'Supabase client unavailable' }, { userId: userId, action: action });
      return { ok: false, awarded: false, reason: 'no_client' };
    }

    try {
      var result = await sb.rpc('award_star_score', {
        p_target_user_id: userId,
        p_action: action,
        p_extra: extra,
      });

      if (result.error) {
        logScoreEngineError(context, result.error, {
          userId: userId,
          action: action,
          extra: extra,
          rpc: 'award_star_score',
        });
        return { ok: false, awarded: false, reason: 'rpc_error', error: result.error };
      }

      var payload = result.data || {};

      if (payload.ok === false || (payload.awarded === false && payload.reason && !SCORE_ENGINE_SKIP_REASONS[payload.reason])) {
        logScoreEngineError(context, payload, {
          userId: userId,
          action: action,
          extra: extra,
          rpc: 'award_star_score',
        });
      } else if (payload.awarded === false && payload.reason) {
        logScoreEngineSkip(context, payload, { userId: userId, action: action });
      }

      if (payload.awarded) {
        notifyStarScoreUpdated(userId);
      }

      return payload;
    } catch (err) {
      logScoreEngineError(context, err, { userId: userId, action: action, extra: extra });
      return { ok: false, awarded: false, reason: 'exception', error: err };
    }
  }

  async function tryAwardPostAuthorStarScore(authorId, postId, actionType, extra) {
    if (!authorId || !postId) return null;
    var merged = Object.assign({ postId: postId }, extra || {});
    return updateUserScore(authorId, actionType, merged);
  }

  async function tryAwardPostAuthorFromPostId(postId, actionType, extra) {
    var sb = getSupabaseClientForScore();
    if (!sb || !postId) return null;

    var postResult = await sb
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .maybeSingle();

    var authorId = postResult.data && postResult.data.author_id;
    if (!authorId) return null;
    return tryAwardPostAuthorStarScore(authorId, postId, actionType, extra);
  }

  function tryAwardPostAuthorStarScoreFireAndForget(authorId, postId, actionType, extra) {
    tryAwardPostAuthorStarScore(authorId, postId, actionType, extra).catch(function (err) {
      logScoreEngineError('tryAwardPostAuthorStarScoreFireAndForget:' + actionType, err, {
        authorId: authorId,
        postId: postId,
        extra: extra,
      });
    });
  }

  function tryAwardPostAuthorFromPostIdFireAndForget(postId, actionType, extra) {
    tryAwardPostAuthorFromPostId(postId, actionType, extra).catch(function (err) {
      logScoreEngineError('tryAwardPostAuthorFromPostIdFireAndForget:' + actionType, err, {
        postId: postId,
        extra: extra,
      });
    });
  }

  function tryUpdateUserScoreFireAndForget(userId, actionType, extra) {
    updateUserScore(userId, actionType, extra).catch(function (err) {
      logScoreEngineError('tryUpdateUserScoreFireAndForget:' + actionType, err, {
        userId: userId,
        extra: extra,
      });
    });
  }

  window.PickleProfile = {
    LEVEL_TIERS: LEVEL_TIERS,
    STAR_SCORE_GUIDE: STAR_SCORE_GUIDE,
    STAR_SCORE_DELTAS: STAR_SCORE_DELTAS,
    calculateLevel: calculateLevel,
    getLevelProgress: getLevelProgress,
    getLevelTier: getLevelTier,
    normalizeRankingPoints: normalizeRankingPoints,
    extractRankingPointsFromRow: extractRankingPointsFromRow,
    getUserLevelFromPoints: getUserLevelFromPoints,
    buildLevelBadgeHtml: buildLevelBadgeHtml,
    buildLevelBadgeFromPoints: buildLevelBadgeFromPoints,
    buildGradeBadgeHtml: buildGradeBadgeHtml,
    fetchRankingPoints: fetchRankingPoints,
    fetchRankingPointsMap: fetchRankingPointsMap,
    clearRankingPointsCache: clearRankingPointsCache,
    getUserLevel: getUserLevel,
    extractAuthorSnapshot: extractAuthorSnapshot,
    tryIncrementStarScore: tryIncrementStarScore,
    tryIncrementStarScoreFireAndForget: tryIncrementStarScoreFireAndForget,
    tryIncrementSelfStarScore: tryIncrementSelfStarScore,
    tryIncrementSelfStarScoreFireAndForget: tryIncrementSelfStarScoreFireAndForget,
    tryAwardLikeMilestone: tryAwardLikeMilestone,
    tryAwardLikeMilestoneFireAndForget: tryAwardLikeMilestoneFireAndForget,
    incrementStarScore: incrementStarScore,
    updateUserScore: updateUserScore,
    tryAwardPostAuthorStarScore: tryAwardPostAuthorStarScore,
    tryAwardPostAuthorFromPostId: tryAwardPostAuthorFromPostId,
    tryAwardPostAuthorStarScoreFireAndForget: tryAwardPostAuthorStarScoreFireAndForget,
    tryAwardPostAuthorFromPostIdFireAndForget: tryAwardPostAuthorFromPostIdFireAndForget,
    tryUpdateUserScoreFireAndForget: tryUpdateUserScoreFireAndForget,
  };
})();
