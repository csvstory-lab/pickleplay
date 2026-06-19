/**
 * P!CKLE Admin — system_settings.policy_config 약관/정책 에디터
 */
(function () {
  'use strict';

  var SYSTEM_SETTINGS_ID = 1;

  var SELECT_TO_KEY = {
    terms: 'terms_of_service',
    privacy: 'privacy_policy',
  };

  var DEFAULT_TERMS =
    '제 1 조 (목적)\n본 약관은 P!CKLE 서비스 이용 조건 및 절차를 규정합니다.\n\n제 8 조 (게시물의 관리 및 법적 책임)\n1. 회원이 서비스 내에 게시한 게시물의 법적 책임은 게시한 회원 본인에게 있습니다.\n2. 회사는 사용자의 게시물에 대해 사전 검열 의무를 지지 않습니다.';

  var DEFAULT_PRIVACY =
    '개인정보 처리방침\n\n1. 수집하는 개인정보의 항목\n- 필수항목: 소셜 연동 식별값, 닉네임, 이메일 주소\n\n2. 개인정보의 수집 및 이용 목적\n- 서비스 제공에 관한 계약 이행 및 맞춤형 콘텐츠 제공';

  var editorState = {
    terms_of_service: { content: DEFAULT_TERMS, version: 'v1.2.0', published_at: null },
    privacy_policy: { content: DEFAULT_PRIVACY, version: 'v1.1.0', published_at: null },
  };

  var activeSelectKey = 'terms';

  function normalizeDoc(raw, fallbackContent, fallbackVersion) {
    return {
      content: raw && raw.content != null ? String(raw.content) : fallbackContent,
      version: raw && raw.version ? String(raw.version) : fallbackVersion,
      published_at: raw && raw.published_at ? raw.published_at : null,
    };
  }

  function normalizeConfig(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    return {
      terms_of_service: normalizeDoc(src.terms_of_service, DEFAULT_TERMS, 'v1.2.0'),
      privacy_policy: normalizeDoc(src.privacy_policy, DEFAULT_PRIVACY, 'v1.1.0'),
    };
  }

  function getActiveDbKey() {
    return SELECT_TO_KEY[activeSelectKey] || 'terms_of_service';
  }

  function syncEditorToState() {
    var editor = document.getElementById('editorContent');
    var versionInput = document.getElementById('versionInput');
    if (!editor) return;

    var dbKey = getActiveDbKey();
    var prev = editorState[dbKey] || { published_at: null };
    editorState[dbKey] = {
      content: editor.value,
      version: versionInput ? versionInput.value.trim() || 'v1.0.0' : 'v1.0.0',
      published_at: prev.published_at || null,
    };
  }

  function buildPolicyConfigPayload(options) {
    syncEditorToState();

    var now = new Date().toISOString();
    var touchPublished = !!(options && options.touchPublished);
    var onlyKey = options && options.onlyKey ? String(options.onlyKey) : null;

    function buildDoc(key, fallbackVersion) {
      var src = editorState[key] || {};
      var doc = {
        content: String(src.content != null ? src.content : ''),
        version: String(src.version || fallbackVersion).trim() || fallbackVersion,
        published_at: src.published_at || null,
      };
      if (touchPublished && (!onlyKey || onlyKey === key)) {
        doc.published_at = now;
      }
      return doc;
    }

    return {
      terms_of_service: buildDoc('terms_of_service', 'v1.2.0'),
      privacy_policy: buildDoc('privacy_policy', 'v1.1.0'),
    };
  }

  function logPolicySaveError(error, context) {
    console.error(
      '❌ 약관 저장 실패 원인:',
      error && error.message ? error.message : error,
      error && error.details ? error.details : '',
      context || ''
    );
    if (error) {
      console.error('❌ 약관 저장 실패 (전체 error 객체):', error);
    }
  }

  async function persistPolicyConfig(getSupabaseClient, policyConfig) {
    var sb = getSupabaseClient();

    console.log(
      '💾 Supabase update 요청 — system_settings.id =',
      SYSTEM_SETTINGS_ID,
      policyConfig
    );

    var updateRes = await sb
      .from('system_settings')
      .update({ policy_config: policyConfig })
      .eq('id', SYSTEM_SETTINGS_ID)
      .select('id, policy_config')
      .single();

    if (updateRes.error) {
      logPolicySaveError(updateRes.error, 'update system_settings');
      throw updateRes.error;
    }

    if (!updateRes.data || !updateRes.data.policy_config) {
      console.warn(
        '[Admin Policies] id=1 행 update 결과 없음 — upsert 시도',
        updateRes
      );

      var upsertRes = await sb
        .from('system_settings')
        .upsert(
          {
            id: SYSTEM_SETTINGS_ID,
            policy_config: policyConfig,
            general_config: {},
            point_config: {},
            penalty_config: {},
          },
          { onConflict: 'id' }
        )
        .select('id, policy_config')
        .single();

      if (upsertRes.error) {
        logPolicySaveError(upsertRes.error, 'upsert system_settings');
        throw upsertRes.error;
      }

      if (!upsertRes.data || !upsertRes.data.policy_config) {
        var emptyErr = new Error('policy_config 저장 후 응답 데이터가 비어 있습니다.');
        logPolicySaveError(emptyErr, 'empty response after upsert');
        throw emptyErr;
      }

      return upsertRes.data.policy_config;
    }

    return updateRes.data.policy_config;
  }

  function renderEditorFromState(selectKey) {
    activeSelectKey = selectKey || activeSelectKey;
    var dbKey = getActiveDbKey();
    var doc = editorState[dbKey] || { content: '', version: 'v1.0.0' };

    var editor = document.getElementById('editorContent');
    var versionInput = document.getElementById('versionInput');
    if (editor) editor.value = doc.content || '';
    if (versionInput) versionInput.value = doc.version || 'v1.0.0';

    updateLastDeployedLabel();
  }

  function formatDateLabel(iso) {
    if (window.PicklePolicies && window.PicklePolicies.formatPublishedDate) {
      return window.PicklePolicies.formatPublishedDate(iso);
    }
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toISOString().slice(0, 10).replace(/-/g, '.');
    } catch (e) {
      return '—';
    }
  }

  function updateLastDeployedLabel() {
    var el = document.getElementById('policyLastDeployed');
    if (!el) return;

    var termsDate = formatDateLabel(editorState.terms_of_service.published_at);
    var privacyDate = formatDateLabel(editorState.privacy_policy.published_at);

    el.textContent = '이용약관 ' + termsDate + ' · 개인정보 ' + privacyDate;
  }

  function updateHistoryCard() {
    var list = document.getElementById('historyList');
    if (!list) return;

    function itemHtml(label, doc) {
      var dateLabel = formatDateLabel(doc.published_at);
      return (
        '<div class="history-item current">' +
        '<div class="hi-top"><span class="hi-version">' +
        label +
        ' ' +
        (doc.version || 'v1.0.0') +
        ' (현재 반영됨)</span><span class="hi-date">' +
        dateLabel +
        '</span></div>' +
        '<div class="hi-worker">👤 관리자 배포</div>' +
        '</div>'
      );
    }

    list.innerHTML =
      itemHtml('이용약관', editorState.terms_of_service) +
      itemHtml('개인정보', editorState.privacy_policy);
  }

  async function load(getSupabaseClient) {
    var sb = getSupabaseClient();
    var res = await sb
      .from('system_settings')
      .select('policy_config')
      .eq('id', SYSTEM_SETTINGS_ID)
      .single();

    if (res.error) {
      if (res.error.code === 'PGRST116') {
        console.warn(
          '[Admin Policies] system_settings 행 없음 — supabase/64_policy_config.sql 실행 필요'
        );
        editorState = normalizeConfig({});
        renderEditorFromState(activeSelectKey);
        updateHistoryCard();
        return editorState;
      }
      logPolicySaveError(res.error, 'load policy_config');
      throw res.error;
    }

    editorState = normalizeConfig(res.data && res.data.policy_config);
    renderEditorFromState(activeSelectKey);
    updateHistoryCard();
    console.log('[Admin Policies] policy_config 로드 완료', editorState);
    return editorState;
  }

  function changePolicy() {
    syncEditorToState();
    var select = document.getElementById('policySelect');
    activeSelectKey = (select && select.value) || 'terms';
    renderEditorFromState(activeSelectKey);
  }

  /**
   * 이용약관 + 개인정보 처리방침 전체 저장 (통합 저장 버튼 연동)
   */
  async function save(getSupabaseClient) {
    console.log('💾 약관 저장 프로세스 시작');

    var policyConfig = buildPolicyConfigPayload({ touchPublished: true });
    console.log('💾 저장할 policy_config JSON:', JSON.stringify(policyConfig, null, 2));

    var saved = await persistPolicyConfig(getSupabaseClient, policyConfig);
    editorState = normalizeConfig(saved);
    renderEditorFromState(activeSelectKey);
    updateHistoryCard();

    if (window.PicklePolicies && window.PicklePolicies.clearPolicyConfigCache) {
      window.PicklePolicies.clearPolicyConfigCache();
    }

    console.log('✅ [Admin Policies] policy_config 저장 완료', editorState);
    return editorState;
  }

  /**
   * 현재 선택된 약관만 배포 (published_at 갱신)
   */
  async function publish(getSupabaseClient) {
    console.log('💾 약관 저장 프로세스 시작 (단일 배포)');

    var select = document.getElementById('policySelect');
    var policyKey = (select && select.value) || 'terms';
    var dbKey = SELECT_TO_KEY[policyKey] || 'terms_of_service';

    var policyConfig = buildPolicyConfigPayload({
      touchPublished: true,
      onlyKey: dbKey,
    });

    console.log('💾 배포할 policy_config JSON:', JSON.stringify(policyConfig, null, 2));

    var saved = await persistPolicyConfig(getSupabaseClient, policyConfig);
    editorState = normalizeConfig(saved);
    renderEditorFromState(policyKey);
    updateHistoryCard();

    if (window.PicklePolicies && window.PicklePolicies.clearPolicyConfigCache) {
      window.PicklePolicies.clearPolicyConfigCache();
    }

    console.log('✅ [Admin Policies] 배포 완료', dbKey, editorState[dbKey]);
    return editorState[dbKey];
  }

  window.AdminSettingsPolicies = {
    load: load,
    save: save,
    changePolicy: changePolicy,
    publish: publish,
    getState: function () {
      return editorState;
    },
  };
})();
