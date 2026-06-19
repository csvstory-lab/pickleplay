/**
 * P!CKLE — system_settings.point_config 기반 포인트 지급
 */
(function () {
  'use strict';

  var SYSTEM_SETTINGS_ID = 1;
  var POINT_CONFIG_CACHE_MS = 60 * 1000;

  var DEFAULT_POINT_CONFIG = {
    engine_enabled: false,
    signup_welcome: 0,
    event_participate: 0,
    ugc_comment: 0,
    ugc_post: 0,
    event_share: 0,
    referral_inviter: 0,
    referral_invitee: 0,
    honor_weekly_best: 0,
    honor_best_comment: 0,
    daily_cap: 0,
  };

  var ACTION_POINT_KEYS = {
    signup: 'signup_welcome',
    vote: 'event_participate',
    comment: 'ugc_comment',
    post: 'ugc_post',
    event_share: 'event_share',
    referral_inviter: 'referral_inviter',
    referral_invitee: 'referral_invitee',
    honor_weekly_best: 'honor_weekly_best',
    honor_best_comment: 'honor_best_comment',
  };

  var DAILY_CAP_EXEMPT_ACTIONS = {
    signup: true,
    referral_inviter: true,
    referral_invitee: true,
  };

  var pointConfigCache = null;
  var pointConfigCachedAt = 0;
  var lastInvalidationSeen = 0;

  /** 관리자 저장·토글 시 갱신 — 유저 앱 다른 탭과 공유 */
  var POINT_CONFIG_INVALIDATION_KEY = 'pickle_point_config_invalidation';

  function readInvalidationTimestamp() {
    try {
      return Number(localStorage.getItem(POINT_CONFIG_INVALIDATION_KEY)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function applyInvalidationIfNeeded() {
    var stored = readInvalidationTimestamp();
    if (stored > lastInvalidationSeen) {
      lastInvalidationSeen = stored;
      pointConfigCache = null;
      pointConfigCachedAt = 0;
      return true;
    }
    return false;
  }

  function clearPointConfigCache() {
    var ts = Date.now();
    try {
      localStorage.setItem(POINT_CONFIG_INVALIDATION_KEY, String(ts));
    } catch (e) {
      /* ignore */
    }
    lastInvalidationSeen = ts;
    pointConfigCache = null;
    pointConfigCachedAt = 0;
    return ts;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', function (e) {
      if (e.key === POINT_CONFIG_INVALIDATION_KEY) {
        applyInvalidationIfNeeded();
      }
    });
    applyInvalidationIfNeeded();
  }

  function getClient() {
    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) {
      return window.supabaseClient;
    }
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.isReady()) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
  }

  function signupBonusStorageKey(userId) {
    return 'pickle_signup_bonus_' + String(userId || '');
  }

  function hasSignupBonusAwarded(userId) {
    try {
      return localStorage.getItem(signupBonusStorageKey(userId)) === '1';
    } catch (e) {
      return false;
    }
  }

  function markSignupBonusAwarded(userId) {
    try {
      localStorage.setItem(signupBonusStorageKey(userId), '1');
    } catch (e) {
      /* ignore */
    }
  }

  function shouldAttemptSignupBonus(userId) {
    return !!userId && !hasSignupBonusAwarded(userId);
  }

  function isEngineEnabled(config) {
    return !!(config && config.engine_enabled === true);
  }

  function normalizePointConfig(raw) {
    var base = Object.assign({}, DEFAULT_POINT_CONFIG, raw || {});
    base.engine_enabled = raw && raw.engine_enabled === true;
    return base;
  }

  async function fetchPointConfig(sb, options) {
    var forceRefresh = options && options.forceRefresh === true;
    var now = Date.now();

    applyInvalidationIfNeeded();

    if (
      !forceRefresh &&
      pointConfigCache &&
      now - pointConfigCachedAt < POINT_CONFIG_CACHE_MS
    ) {
      return pointConfigCache;
    }

    var res = await sb
      .from('system_settings')
      .select('point_config')
      .eq('id', SYSTEM_SETTINGS_ID)
      .single();

    if (res.error) {
      if (res.error.code === 'PGRST116') {
        console.warn(
          '[P!CKLE Points] system_settings(id=1) 행이 없습니다. supabase/61_system_settings.sql 을 실행해 주세요.'
        );
        pointConfigCache = normalizePointConfig({});
        pointConfigCachedAt = now;
        return pointConfigCache;
      }
      throw res.error;
    }

    pointConfigCache = normalizePointConfig(
      res.data && res.data.point_config ? res.data.point_config : {}
    );
    pointConfigCachedAt = now;
    return pointConfigCache;
  }

  function resolveAwardAmount(config, actionType) {
    var key = ACTION_POINT_KEYS[actionType];
    if (!key) return 0;
    var amount = Number(config[key]);
    return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
  }

  /**
   * @param {string} userId
   * @param {'signup'|'vote'|'comment'|string} actionType
   * @param {{ forceRefreshConfig?: boolean }} [options]
   * @returns {Promise<{ awarded: boolean, amount?: number, balance?: number, reason?: string }>}
   */
  /**
   * 액션 성공 콜백에서 호출 — 콘솔 로그 후 awardPoints 실행
   * @param {string} userId
   * @param {string} actionType
   * @param {string} [logLabel] e.g. 'Vote', 'Comment'
   */
  function tryAwardPoints(userId, actionType, logLabel) {
    var label = logLabel || actionType;
    console.log('✅ [' + label + '] 완료 -> awardPoints 호출 시도');
    if (!userId) {
      console.warn('[P!CKLE Points] userId 없음 — 지급 생략', actionType);
      return Promise.resolve({ awarded: false, reason: 'no_user' });
    }
    if (!ACTION_POINT_KEYS[actionType]) {
      console.warn('[P!CKLE Points] 알 수 없는 액션 — 지급 생략', actionType);
      return Promise.resolve({ awarded: false, reason: 'unknown_action' });
    }
    return awardPoints(userId, actionType);
  }

  async function awardPoints(userId, actionType, options) {
    console.log('포인트 지급 요청:', userId, actionType);

    if (!userId || !actionType) {
      return { awarded: false, reason: 'invalid_args' };
    }

    if (!ACTION_POINT_KEYS[actionType]) {
      return { awarded: false, reason: 'unknown_action' };
    }

    if (actionType === 'signup' && hasSignupBonusAwarded(userId)) {
      return { awarded: false, reason: 'already_awarded' };
    }

    var sb = getClient();

    var rpcRes = await sb.rpc('award_points', {
      p_user_id: userId,
      p_action: actionType,
    });

    if (rpcRes.error) {
      console.warn('[P!CKLE Points] award_points RPC 실패', rpcRes.error);
      throw rpcRes.error;
    }

    var payload = rpcRes.data;
    if (!payload || payload.ok === false) {
      var failReason =
        (payload && payload.reason) || 'rpc_failed';
      console.warn('[P!CKLE Points] 지급 거부:', failReason, payload);
      return { awarded: false, reason: failReason };
    }

    if (!payload.awarded) {
      return { awarded: false, reason: payload.reason || 'not_awarded' };
    }

    if (actionType === 'signup') {
      markSignupBonusAwarded(userId);
    }

    console.log('[P!CKLE Points] 지급 완료:', {
      action: actionType,
      amount: payload.amount,
      balance: payload.balance,
    });

    return {
      awarded: true,
      amount: Number(payload.amount) || 0,
      balance: Number(payload.balance) || 0,
    };
  }

  window.PicklePoints = {
    awardPoints: awardPoints,
    tryAwardPoints: tryAwardPoints,
    fetchPointConfig: fetchPointConfig,
    clearPointConfigCache: clearPointConfigCache,
    shouldAttemptSignupBonus: shouldAttemptSignupBonus,
    isEngineEnabled: isEngineEnabled,
    INVALIDATION_KEY: POINT_CONFIG_INVALIDATION_KEY,
  };
})();
