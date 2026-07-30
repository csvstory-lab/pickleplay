/**
 * P!CKLE — 가입 직후 1회 노출 성별/연령대 프롬프트
 * users.is_info_collected 플래그를 사용 (이미 39_users_taste_preferences.sql 에 존재)
 * 선택 안 하고 닫아도 다시 뜨지 않도록, 닫을 때도 is_info_collected 를 true 로 기록합니다.
 */
(function () {
  'use strict';

  var GENDER_OPTIONS = [
    { value: '남자', label: '남자' },
    { value: '여자', label: '여자' },
  ];
  var AGE_OPTIONS = [
    { value: '10대', label: '10대' },
    { value: '20대', label: '20대' },
    { value: '30대', label: '30대' },
    { value: '40대', label: '40대' },
    { value: '50대이상', label: '50대 이상' },
  ];

  function getClient() {
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.isReady()) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    return null;
  }

  function buildModal() {
    var wrap = document.createElement('div');
    wrap.id = 'pickleDemoPromptRoot';
    wrap.style.cssText =
      'position:fixed; inset:0; z-index:99995; display:flex; align-items:flex-end; justify-content:center;';

    wrap.innerHTML =
      '<div id="pickleDemoPromptBackdrop" style="position:absolute; inset:0; background:rgba(0,0,0,0.7);"></div>' +
      '<div style="position:relative; width:100%; max-width:480px; background:#111113; border-radius:20px 20px 0 0; ' +
      'border:1px solid #27272a; border-bottom:none; padding:24px 20px 28px; box-sizing:border-box;">' +
      '  <button type="button" id="pickleDemoPromptClose" aria-label="닫기" ' +
      '    style="position:absolute; top:16px; right:16px; background:none; border:none; color:var(--text-sub,#a1a1aa); font-size:1.3rem; cursor:pointer;">✕</button>' +
      '  <div style="font-size:1.15rem; font-weight:900; color:#fff; margin-bottom:6px;">환영해요! 👋</div>' +
      '  <div style="font-size:0.85rem; color:var(--text-sub,#a1a1aa); margin-bottom:20px;">취향에 맞는 불판을 보여드릴게요. 안 하셔도 괜찮아요!</div>' +
      '  <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">' +
      '    <select id="pickleDemoPromptGender" style="width:100%; padding:14px; border-radius:10px; background:#09090b; border:1px solid #27272a; color:#fff; font-size:0.95rem;">' +
      '      <option value="">성별을 선택해주세요</option>' +
      GENDER_OPTIONS.map(function (o) { return '<option value="' + o.value + '">' + o.label + '</option>'; }).join('') +
      '    </select>' +
      '    <select id="pickleDemoPromptAge" style="width:100%; padding:14px; border-radius:10px; background:#09090b; border:1px solid #27272a; color:#fff; font-size:0.95rem;">' +
      '      <option value="">연령대를 선택해주세요</option>' +
      AGE_OPTIONS.map(function (o) { return '<option value="' + o.value + '">' + o.label + '</option>'; }).join('') +
      '    </select>' +
      '  </div>' +
      '  <button type="button" id="pickleDemoPromptSubmit" style="width:100%; padding:15px; border-radius:12px; border:none; ' +
      '    background:var(--neon-green,#39ff14); color:#09090b; font-weight:900; font-size:0.95rem; cursor:pointer; margin-bottom:10px;">완료</button>' +
      '  <button type="button" id="pickleDemoPromptSkip" style="width:100%; padding:12px; border-radius:12px; border:none; ' +
      '    background:none; color:var(--text-sub,#a1a1aa); font-weight:700; font-size:0.85rem; cursor:pointer;">다음에 할게요</button>' +
      '</div>';

    return wrap;
  }

  async function markCollected(userId, sb, extraFields) {
    var payload = Object.assign({ is_info_collected: true }, extraFields || {});
    try {
      await sb.from('users').update(payload).eq('id', userId);
    } catch (err) {
      console.warn('[P!CKLE DemoPrompt] 저장 실패', err);
    }
  }

  function closeModal(root) {
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
  }

  function showPrompt(userId, sb) {
    if (document.getElementById('pickleDemoPromptRoot')) return; // 중복 렌더 방지
    var root = buildModal();
    document.body.appendChild(root);

    function dismiss(withSelection) {
      var genderVal = document.getElementById('pickleDemoPromptGender').value;
      var ageVal = document.getElementById('pickleDemoPromptAge').value;
      var extra = {};
      if (withSelection) {
        if (genderVal) extra.gender = genderVal;
        if (ageVal) extra.age_group = ageVal;
      }
      markCollected(userId, sb, extra);
      closeModal(root);
    }

    document.getElementById('pickleDemoPromptSubmit').addEventListener('click', function () {
      dismiss(true);
    });
    document.getElementById('pickleDemoPromptSkip').addEventListener('click', function () {
      dismiss(false);
    });
    document.getElementById('pickleDemoPromptClose').addEventListener('click', function () {
      dismiss(false);
    });
    document.getElementById('pickleDemoPromptBackdrop').addEventListener('click', function () {
      dismiss(false);
    });
  }

  async function init() {
    try {
      if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
        await window.PickleAuth.ensureAuthenticated({ timeoutMs: 5000, skipProfile: true }).catch(function () {});
      }
      var user = window.PickleAuth && window.PickleAuth.getUser ? window.PickleAuth.getUser() : null;
      if (!user || !user.id) return; // 비로그인 상태면 아무것도 안 함

      var sb = getClient();
      if (!sb) return;

      var res = await sb.from('users').select('is_info_collected').eq('id', user.id).maybeSingle();
      if (res.error || !res.data) return;
      if (res.data.is_info_collected) return; // 이미 봤으면 다시 안 띄움

      showPrompt(user.id, sb);
    } catch (err) {
      console.warn('[P!CKLE DemoPrompt] 초기화 실패', err);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // auth.js 등 다른 스크립트의 초기 세션 복원과 순서가 겹치지 않도록 살짝 지연
    setTimeout(init, 800);
  });
})();
