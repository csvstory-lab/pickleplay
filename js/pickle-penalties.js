/**
 * P!CKLE — 제재/벌점 투트랙
 *   [자동 트랙] applyAutoPenalty — 시스템 감지·알고리즘 자동 벌점
 *   [신고 트랙] submitContentReport — reports INSERT 만 (관리자 수동 심사 대기)
 *   [수동 트랙] applyManualPenalty — 관리자 [신고 및 제재 관리] 집행
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
    score_profanity_block: 10,
    score_ai_vision: 50,
    score_abuse: 10,
    score_spam: 30,
    score_illegal: 50,
    auto_30_points: 30,
    auto_30_action: 'suspend_3d',
    auto_50_points: 50,
    auto_50_action: 'suspend_7d',
    auto_100_points: 100,
  };

  var AUTO_DETECTION = {
    profanity_block: {
      configKey: 'score_profanity_block',
      reason: '금칙어 등록 시도 (시스템 자동 감지)',
    },
    ai_vision: {
      configKey: 'score_ai_vision',
      reason: '유해 이미지 업로드 시도 (AI 비전 자동 감지)',
    },
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

  /**
   * [자동 트랙] 시스템 감지 벌점 — apply_auto_penalty RPC
   * @param {string} userId
   * @param {string} reason
   * @param {number} points
   */
  async function applyAutoPenalty(userId, reason, points) {
    console.log('[자동 제재 Track] 벌점 부여 요청:', { userId: userId, reason: reason, points: points });

    if (!userId || !reason || !points || points <= 0) {
      console.warn('[자동 제재 Track] ❌ 실패 — 잘못된 인자', { userId: userId, reason: reason, points: points });
      return { applied: false, reason: 'invalid_args' };
    }

    var sb = getClient();
    var config;

    try {
      config = await fetchPenaltyConfig(sb);
    } catch (err) {
      console.error('[자동 제재 Track] ❌ penalty_config 조회 실패', err);
      return { applied: false, reason: 'config_fetch_failed' };
    }

    if (!isEngineEnabled(config)) {
      console.log('[자동 제재 Track] 엔진 OFF — RPC 호출 생략');
      return { applied: false, reason: 'engine_disabled' };
    }

    var rpcRes = await sb.rpc('apply_auto_penalty', {
      p_user_id: userId,
      p_reason: reason,
      p_points: points,
    });

    if (rpcRes.error) {
      console.error('[자동 제재 Track] ❌ RPC 실패:', rpcRes.error.message, rpcRes.error.details);
      throw rpcRes.error;
    }

    var payload = rpcRes.data;
    if (!payload || payload.ok === false) {
      console.warn('[자동 제재 Track] ❌ 거부:', payload && payload.reason, payload);
      return { applied: false, reason: (payload && payload.reason) || 'rpc_failed' };
    }

    if (!payload.applied) {
      console.log('[자동 제재 Track] 미적용:', payload.reason || 'not_applied');
      return { applied: false, reason: payload.reason || 'not_applied' };
    }

    console.log('[자동 제재 Track] ✅ 성공 — 벌점 부여 완료', payload);
    return {
      applied: true,
      pointsAdded: Number(payload.points_added) || 0,
      penaltyTotal: Number(payload.penalty_total) || 0,
      isBanned: payload.is_banned === true,
      restrictedUntil: payload.restricted_until || null,
    };
  }

  /**
   * 시스템 감지 유형별 자동 벌점 (금칙어 차단 등)
   * @param {'profanity_block'|'ai_vision'} detectionType
   * @param {string} [userId]
   */
  async function tryAutoPenaltyOnDetection(detectionType, userId) {
    var meta = AUTO_DETECTION[detectionType];
    if (!meta) {
      console.warn('[자동 제재 Track] 알 수 없는 감지 유형:', detectionType);
      return { applied: false, reason: 'unknown_detection' };
    }

    var sb = getClient();
    var config;

    try {
      config = await fetchPenaltyConfig(sb);
    } catch (err) {
      console.error('[자동 제재 Track] ❌ 설정 조회 실패', err);
      return { applied: false, reason: 'config_fetch_failed' };
    }

    var points = Number(config[meta.configKey]) || 0;
    if (points <= 0) {
      console.log('[자동 제재 Track] 벌점 0 — 생략', detectionType);
      return { applied: false, reason: 'zero_points' };
    }

    var uid = userId;
    if (!uid) {
      var sessionRes = await sb.auth.getSession();
      uid = sessionRes.data && sessionRes.data.session ? sessionRes.data.session.user.id : null;
    }

    if (!uid) {
      console.warn('[자동 제재 Track] ❌ 로그인 사용자 없음 — 생략');
      return { applied: false, reason: 'no_user' };
    }

    return applyAutoPenalty(uid, meta.reason, points);
  }

  /**
   * [수동 트랙] 관리자 벌점 집행 — apply_manual_penalty RPC
   */
  async function applyManualPenalty(userId, reason, points, reportId) {
    console.log('[수동 제재 Track] 관리자 집행 요청:', {
      userId: userId,
      reason: reason,
      points: points,
      reportId: reportId,
    });

    var sb = getClient();
    var rpcRes = await sb.rpc('apply_manual_penalty', {
      p_user_id: userId || null,
      p_reason: reason || null,
      p_points: points != null ? points : 0,
      p_report_id: reportId || null,
    });

    if (rpcRes.error) {
      console.error('[수동 제재 Track] ❌ RPC HTTP 오류:', {
        message: rpcRes.error.message,
        details: rpcRes.error.details,
        hint: rpcRes.error.hint,
        code: rpcRes.error.code,
        status: rpcRes.error.status,
      });
      throw rpcRes.error;
    }

    var payload = rpcRes.data;
    if (!payload || payload.ok === false) {
      console.warn('[수동 제재 Track] ❌ RPC 거부:', {
        reason: payload && payload.reason,
        detail: payload && payload.detail,
        error: payload && payload.error,
        payload: payload,
      });
      return {
        ok: false,
        reason: (payload && payload.reason) || 'rpc_failed',
        detail: payload && payload.detail,
        data: payload,
      };
    }

    if (payload.reason === 'dismissed') {
      console.log('[수동 제재 Track] ✅ 무혐의 처리 완료 (신고 기각)', payload);
      return { ok: true, applied: false, dismissed: true, data: payload };
    }

    if (!payload.applied) {
      console.log('[수동 제재 Track] 미적용:', payload.reason);
      return { ok: true, applied: false, reason: payload.reason, data: payload };
    }

    console.log('[수동 제재 Track] ✅ 벌점 집행 완료', payload);
    return {
      ok: true,
      applied: true,
      pointsAdded: Number(payload.points_added) || 0,
      penaltyTotal: Number(payload.penalty_total) || 0,
      isBanned: payload.is_banned === true,
      restrictedUntil: payload.restricted_until || null,
      data: payload,
    };
  }

  /**
   * [신고 트랙] 유저 신고 접수 — reports pending INSERT 만 (자동 벌점 없음)
   */
  async function submitContentReport(payload) {
    console.log('[신고 Track] 🚨 신고 접수 시작', payload);

    if (!payload || !payload.targetType || !payload.targetId || !payload.reason) {
      console.warn('[신고 Track] ❌ 실패 — 잘못된 인자', payload);
      return { ok: false, reason: 'invalid_args' };
    }

    var sb = getClient();
    var rpcRes = await sb.rpc('submit_user_report', {
      p_target_type: payload.targetType,
      p_target_id: payload.targetId,
      p_reason: payload.reason,
      p_detail: payload.detail || null,
    });

    if (rpcRes.error) {
      console.error('[신고 Track] ❌ 접수 실패:', rpcRes.error.message, rpcRes.error.details);
      throw rpcRes.error;
    }

    var result = rpcRes.data;
    if (!result || result.ok !== true) {
      console.warn('[신고 Track] ❌ 거부:', result);
      return { ok: false, reason: (result && result.reason) || 'submit_failed', data: result };
    }

    console.log('[신고 Track] ✅ 접수 완료 — 관리자 심사 대기 (pending)', result);
    return { ok: true, data: result };
  }

  function mapReportReasonToScoreAction(reason) {
    var key = String(reason || '').trim().toLowerCase();
    if (key === 'spam') return 'spam';
    if (key === 'nsfw') return 'nsfw';
    if (key === 'legal') return 'illegal';
    return 'abuse';
  }

  window.PicklePenalties = {
    applyAutoPenalty: applyAutoPenalty,
    tryAutoPenaltyOnDetection: tryAutoPenaltyOnDetection,
    applyManualPenalty: applyManualPenalty,
    submitContentReport: submitContentReport,
    fetchPenaltyConfig: fetchPenaltyConfig,
    isEngineEnabled: isEngineEnabled,
    mapReportReasonToScoreAction: mapReportReasonToScoreAction,
  };
})();
