/**
 * P!CKLE — system_settings.policy_config 약관/정책 조회 (유저 앱)
 */
(function () {
  'use strict';

  var SYSTEM_SETTINGS_ID = 1;
  var POLICY_CACHE_MS = 60 * 1000;

  var POLICY_KEYS = {
    terms: 'terms_of_service',
    privacy: 'privacy_policy',
  };

  var DEFAULT_POLICY_DOC = {
    content: '',
    version: 'v1.0.0',
    published_at: null,
  };

  var policyConfigCache = null;
  var policyConfigCachedAt = 0;
  var mypageLoadPromise = null;

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

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizePolicyDoc(raw) {
    var base = Object.assign({}, DEFAULT_POLICY_DOC, raw || {});
    base.content = base.content != null ? String(base.content) : '';
    base.version = base.version != null ? String(base.version) : 'v1.0.0';
    base.published_at = base.published_at || null;
    return base;
  }

  function normalizePolicyConfig(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    return {
      terms_of_service: normalizePolicyDoc(src.terms_of_service),
      privacy_policy: normalizePolicyDoc(src.privacy_policy),
    };
  }

  function formatPublishedDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '.' + m + '.' + day;
    } catch (e) {
      return '—';
    }
  }

  function formatPolicyBodyHtml(content) {
    return escapeHtml(content || '').replace(/\n/g, '<br>');
  }

  async function fetchPolicyConfig(options) {
    var forceRefresh = options && options.forceRefresh === true;
    var now = Date.now();

    if (!forceRefresh && policyConfigCache && now - policyConfigCachedAt < POLICY_CACHE_MS) {
      return policyConfigCache;
    }

    var sb = getClient();
    var res = await sb
      .from('system_settings')
      .select('policy_config')
      .eq('id', SYSTEM_SETTINGS_ID)
      .single();

    if (res.error) {
      if (res.error.code === 'PGRST116') {
        console.warn(
          '[P!CKLE Policies] system_settings(id=1) 행이 없습니다. supabase/64_policy_config.sql 을 실행해 주세요.'
        );
        policyConfigCache = normalizePolicyConfig({});
        policyConfigCachedAt = now;
        return policyConfigCache;
      }
      throw res.error;
    }

    policyConfigCache = normalizePolicyConfig(
      res.data && res.data.policy_config ? res.data.policy_config : {}
    );
    policyConfigCachedAt = now;
    console.log('[P!CKLE Policies] policy_config 로드 완료', policyConfigCache);
    return policyConfigCache;
  }

  function renderPolicySection(metaEl, bodyEl, doc, emptyMessage) {
    if (!metaEl || !bodyEl) return;

    var hasContent = !!(doc && String(doc.content || '').trim());
    if (!hasContent) {
      metaEl.textContent = '';
      bodyEl.innerHTML =
        '<p class="policy-doc-empty">' +
        escapeHtml(emptyMessage || '등록된 내용이 없습니다.') +
        '</p>';
      return;
    }

    metaEl.textContent =
      '버전 ' + (doc.version || 'v1.0.0') + ' · 개정일자: ' + formatPublishedDate(doc.published_at);
    bodyEl.innerHTML = formatPolicyBodyHtml(doc.content);
  }

  function setPolicyPanelLoading(isLoading) {
    var termsBody = document.getElementById('termsPolicyBody');
    var privacyBody = document.getElementById('privacyPolicyBody');
    var loadingHtml =
      '<p class="policy-doc-loading">약관 내용을 불러오는 중…</p>';

    if (isLoading) {
      if (termsBody) termsBody.innerHTML = loadingHtml;
      if (privacyBody) privacyBody.innerHTML = loadingHtml;
    }
  }

  function renderMypagePolicyPanel(config) {
    var termsMeta = document.getElementById('termsPolicyMeta');
    var termsBody = document.getElementById('termsPolicyBody');
    var privacyMeta = document.getElementById('privacyPolicyMeta');
    var privacyBody = document.getElementById('privacyPolicyBody');

    renderPolicySection(
      termsMeta,
      termsBody,
      config.terms_of_service,
      '이용약관이 아직 등록되지 않았습니다.'
    );
    renderPolicySection(
      privacyMeta,
      privacyBody,
      config.privacy_policy,
      '개인정보 처리방침이 아직 등록되지 않았습니다.'
    );
  }

  async function loadForMypage(options) {
    if (mypageLoadPromise && !(options && options.forceRefresh)) {
      return mypageLoadPromise;
    }

    setPolicyPanelLoading(true);

    mypageLoadPromise = (async function () {
      try {
        var config = await fetchPolicyConfig({
          forceRefresh: !!(options && options.forceRefresh),
        });
        renderMypagePolicyPanel(config);
        console.log('[P!CKLE Policies] 마이페이지 약관 패널 렌더 완료');
        return config;
      } catch (err) {
        console.error('[P!CKLE Policies] 마이페이지 약관 로드 실패', err);
        var termsBody = document.getElementById('termsPolicyBody');
        var privacyBody = document.getElementById('privacyPolicyBody');
        var errMsg =
          '<p class="policy-doc-error">약관을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
        if (termsBody) termsBody.innerHTML = errMsg;
        if (privacyBody) privacyBody.innerHTML = errMsg;
        throw err;
      }
    })();

    return mypageLoadPromise;
  }

  function clearPolicyConfigCache() {
    policyConfigCache = null;
    policyConfigCachedAt = 0;
    mypageLoadPromise = null;
  }

  window.PicklePolicies = {
    fetchPolicyConfig: fetchPolicyConfig,
    loadForMypage: loadForMypage,
    clearPolicyConfigCache: clearPolicyConfigCache,
    formatPublishedDate: formatPublishedDate,
    POLICY_KEYS: POLICY_KEYS,
    normalizePolicyConfig: normalizePolicyConfig,
  };
})();
