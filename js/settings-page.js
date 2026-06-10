/**
 * P!CKLE settings.html — Supabase Auth 연동
 */
(function () {
  'use strict';

  function getSupabaseClient() {
    var b = window.PickleSupabaseBootstrap;
    if (!b) {
      throw new Error('Supabase 초기화 모듈이 없습니다.');
    }
    return b.getClient();
  }

  function getProviderLabel(user) {
    var provider = user?.app_metadata?.provider;
    if (provider === 'kakao') return '카카오톡 연동됨';
    if (provider === 'google') return 'Google 연동됨';
    if (provider === 'naver') return '네이버 연동됨';
    if (provider === 'email') return '이메일 가입';
    if (user?.email) return '이메일 계정';
    return 'SNS 미연동';
  }

  function renderAccountInfo(user) {
    var snsEl = document.getElementById('snsLinkStatus');
    if (snsEl) snsEl.textContent = getProviderLabel(user);

    var meta = user.user_metadata || {};
    var name = meta.nickname || (user.email ? user.email.split('@')[0] : '픽클러');
    var nickInput = document.getElementById('nicknameInput');
    if (nickInput) nickInput.value = name;

    var bioInput = document.getElementById('bioInput');
    if (bioInput && meta.bio) bioInput.value = meta.bio;

    var inquiryEmail = document.querySelector('#inquiryArea input[type="email"]');
    if (inquiryEmail && user.email) inquiryEmail.value = user.email;

    if (typeof window.updateCharCount === 'function') {
      window.updateCharCount('nicknameInput', 'nickCount');
      window.updateCharCount('bioInput', 'bioCount');
    }
  }

  async function requireAuth() {
    var sb = getSupabaseClient();
    var result = await sb.auth.getUser();
    if (result.error) throw result.error;
    if (!result.data.user) {
      window.location.replace('login.html?redirect=settings.html');
      return null;
    }
    return result.data.user;
  }

  async function handleLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    try {
      var sb = getSupabaseClient();
      var result = await sb.auth.signOut();
      if (result.error) throw result.error;
      window.location.href = 'login.html';
    } catch (err) {
      alert(err.message || '로그아웃에 실패했습니다.');
    }
  }

  function bindLogout() {
    var btn = document.getElementById('btnLogout');
    if (btn) btn.addEventListener('click', handleLogout);
  }

  async function initSettings() {
    try {
      var b = window.PickleSupabaseBootstrap;
      if (!b || !b.isReady()) {
        console.warn('[P!CKLE Settings]', b ? b.getErrorMessage() : 'bootstrap missing');
        window.location.replace('login.html?redirect=settings.html');
        return;
      }
      var user = await requireAuth();
      if (!user) return;
      renderAccountInfo(user);
      bindLogout();
    } catch (err) {
      console.error('[P!CKLE Settings]', err);
      window.location.replace('login.html?redirect=settings.html');
    }
  }

  window.PickleSettings = {
    init: initSettings,
    handleLogout: handleLogout,
    getSupabaseClient: getSupabaseClient,
  };

  document.addEventListener('DOMContentLoaded', initSettings);
})();

