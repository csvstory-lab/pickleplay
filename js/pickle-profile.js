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

  window.PickleProfile = {
    LEVEL_TIERS: LEVEL_TIERS,
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
  };
})();
