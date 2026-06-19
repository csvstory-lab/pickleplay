/**
 * P!CKLE — system_settings.penalty_config 기반 벌점 부여
 */
(function () {
  'use strict';

  var SYSTEM_SETTINGS_ID = 1;
  var PENALTY_CONFIG_CACHE_MS = 60 * 1000;

  var DEFAULT_PENALTY_CONFIG = {
    engine_enabled: false,
    report_blind_threshold: 10,
    ai_profanity_filter: true,
    ai_vision_threshold: 80,
    report_post_points: 10,
    report_comment_points: 10,
    admin_delete_points: 30,
    score_abuse: 10,
    score_spam: 30,
    score_illegal: 50,
    auto_30_points: 30,
    auto_30_action: 'suspend_3d',
    auto_50_points: 50,
    auto_50_action: 'suspend_7d',
    auto_100_points: 100,
  };

  var ACTION_CONFIG_KEYS = {
    report_post: 'report_post_points',
    report_comment: 'report_comment_points',
    admin_delete: 'admin_delete_points',
    abuse: 'score_abuse',
    spam: 'score_spam',
    illegal: 'score_illegal',
    nsfw: 'score_illegal',
  };

  var penaltyConfigCache = null;
  var penaltyConfigCachedAt = 0;

  function getClient() {
    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) return window.supabaseClient;
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.isReady()) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
  }

  function isEngineEnabled(config) {
    return !!(config && config.engine_enabled === true);
  }

  function normalizePenaltyConfig(raw) {
    var base = Object.assign({}, DEFAULT_PENALTY_CONFIG, raw || {});
    base.engine_enabled = raw && raw.engine_enabled === true;
    return base;
  }

  async function fetchPenaltyConfig(sb, options) {
    var forceRefresh = options && options.forceRefresh === true;
    var now = Date.now();

    if (!forceRefresh && penaltyConfigCache && now - penaltyConfigCachedAt < PENALTY_CONFIG_CACHE_MS) {
      return penaltyConfigCache;
    }

    var res = await sb
      .from('system_settings')
      .select('penalty_config')
      .eq('id', SYSTEM_SETTINGS_ID)
      .single();

    if (res.error) {
      if (res.error.code === 'PGRST116') {
        penaltyConfigCache = normalizePenaltyConfig({});
        penaltyConfigCachedAt = now;
        return penaltyConfigCache;
      }
      throw res.error;
    }

    penaltyConfigCache = normalizePenaltyConfig(
      res.data && res.data.penalty_config ? res.data.penalty_config : {}
    );
    penaltyConfigCachedAt = now;
    return penaltyConfigCache;
  }

  function mapReportReasonToScoreAction(reason) {
    var key = String(reason || '').trim().toLowerCase();
    if (key === 'spam') return 'spam';
    if (key === 'nsfw') return 'nsfw';
    if (key === 'legal') return 'illegal';
    return 'abuse';
  }

  /**
   * @param {string} userId
   * @param {string} actionType
   * @param {{ reason?: string, targetType?: string, targetId?: string, forceRefreshConfig?: boolean }} [options]
   */
  async function applyPenalty(userId, actionType, options) {
    console.log('채찍(벌점) 부여 요청:', userId, actionType);

    if (!userId || !actionType) {
      return { applied: false, reason: 'invalid_args' };
    }

    if (!ACTION_CONFIG_KEYS[actionType]) {
      return { applied: false, reason: 'unknown_action' };
    }

    var sb = getClient();
    var config;

    try {
      config = await fetchPenaltyConfig(sb, {
        forceRefresh: !!(options && options.forceRefreshConfig),
      });
    } catch (err) {
      console.warn('[P!CKLE Penalties] penalty_config 조회 실패', err);
      return { applied: false, reason: 'config_fetch_failed' };
    }

    if (!isEngineEnabled(config)) {
      console.log('[P!CKLE Penalties] 마스터 스위치 OFF — RPC 호출 생략', actionType);
      return { applied: false, reason: 'engine_disabled' };
    }

    var rpcRes = await sb.rpc('apply_penalty', {
      p_user_id: userId,
      p_action: actionType,
      p_reason: (options && options.reason) || null,
      p_target_type: (options && options.targetType) || null,
      p_target_id: (options && options.targetId) || null,
      p_invoke_source: 'client',
    });

    if (rpcRes.error) {
      console.error('❌ 벌점 RPC 실패:', rpcRes.error.message, rpcRes.error.details);
      throw rpcRes.error;
    }

    var payload = rpcRes.data;
    if (!payload || payload.ok === false) {
      console.warn('[P!CKLE Penalties] 지급 거부:', payload && payload.reason, payload);
      return { applied: false, reason: (payload && payload.reason) || 'rpc_failed' };
    }

    if (!payload.applied) {
      return { applied: false, reason: payload.reason || 'not_applied' };
    }

    console.log('[P!CKLE Penalties] 벌점 부여 완료:', payload);
    return {
      applied: true,
      pointsAdded: Number(payload.points_added) || 0,
      penaltyTotal: Number(payload.penalty_total) || 0,
      isBanned: payload.is_banned === true,
      restrictedUntil: payload.restricted_until || null,
    };
  }

  /**
   * 유저 신고 접수 — DB에 reports 저장 + 피신고자 벌점 (submit_user_report RPC)
   */
  async function submitContentReport(payload) {
    console.log('🚨 신고 접수 프로세스 시작', payload);

    if (!payload || !payload.targetType || !payload.targetId || !payload.reason) {
      return { ok: false, reason: 'invalid_args' };
    }

    var sb = getClient();
    var config;

    try {
      config = await fetchPenaltyConfig(sb);
    } catch (err) {
      console.warn('[P!CKLE Penalties] penalty_config 조회 실패', err);
    }

    if (config && !isEngineEnabled(config)) {
      console.log('[P!CKLE Penalties] 엔진 OFF — 신고만 접수(벌점 생략) 시도');
    }

    var rpcRes = await sb.rpc('submit_user_report', {
      p_target_type: payload.targetType,
      p_target_id: payload.targetId,
      p_reason: payload.reason,
      p_detail: payload.detail || null,
    });

    if (rpcRes.error) {
      console.error('❌ 신고 접수 실패:', rpcRes.error.message, rpcRes.error.details);
      throw rpcRes.error;
    }

    var result = rpcRes.data;
    if (!result || result.ok !== true) {
      console.warn('[P!CKLE Penalties] 신고 거부:', result);
      return { ok: false, reason: (result && result.reason) || 'submit_failed', data: result };
    }

    console.log('✅ [P!CKLE Penalties] 신고 접수 완료', result);
    return { ok: true, data: result };
  }

  function tryApplyPenalty(userId, actionType, logLabel, options) {
    var label = logLabel || actionType;
    console.log('✅ [' + label + '] 완료 -> applyPenalty 호출 시도');
    if (!userId) {
      return Promise.resolve({ applied: false, reason: 'no_user' });
    }
    return applyPenalty(userId, actionType, options);
  }

  window.PicklePenalties = {
    applyPenalty: applyPenalty,
    tryApplyPenalty: tryApplyPenalty,
    submitContentReport: submitContentReport,
    fetchPenaltyConfig: fetchPenaltyConfig,
    isEngineEnabled: isEngineEnabled,
    mapReportReasonToScoreAction: mapReportReasonToScoreAction,
  };
})();
