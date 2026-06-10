/**
 * P!CKLE mypage.html — Supabase Auth 연동
 * window.PICKLE_SUPABASE_CONFIG 사용
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

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getDisplayName(user) {
    if (!user) return '픽클러';
    var meta = user.user_metadata || {};
    if (meta.nickname) return meta.nickname;
    if (user.email) return user.email.split('@')[0];
    return '픽클러';
  }

  function renderProfile(user) {
    var nickEl = document.getElementById('mainNickname');
    var name = getDisplayName(user);
    var email = user.email || '';

    if (nickEl) {
      nickEl.innerHTML =
        escapeHtml(name) + ' <span class="grade-badge">Lv.1</span>';
    }

    var bioEl = document.getElementById('mainBio');
    if (bioEl && user.user_metadata?.bio) {
      bioEl.textContent = user.user_metadata.bio;
    } else if (bioEl && email) {
      bioEl.textContent = email;
    }

    var nickInput = document.getElementById('nicknameInput');
    if (nickInput) {
      nickInput.value = user.user_metadata?.nickname || name;
      if (typeof updateCharCount === 'function') {
        updateCharCount('nicknameInput', 'nickCount');
      }
    }

    var bioInput = document.getElementById('bioInput');
    if (bioInput && user.user_metadata?.bio) {
      bioInput.value = user.user_metadata.bio;
      if (typeof updateCharCount === 'function') {
        updateCharCount('bioInput', 'bioCount');
      }
    }

    var inquiryEmail = document.querySelector('#inquiryArea input[type="email"]');
    if (inquiryEmail && email) {
      inquiryEmail.value = email;
    }
  }

  async function requireAuth() {
    var sb = getSupabaseClient();
    var result = await sb.auth.getUser();
    if (result.error) throw result.error;
    if (!result.data.user) {
      window.location.replace('login.html?redirect=mypage.html');
      return null;
    }
    return result.data.user;
  }

  async function initMypage() {
    try {
      var b = window.PickleSupabaseBootstrap;
      if (!b || !b.isReady()) {
        console.warn('[P!CKLE Mypage]', b ? b.getErrorMessage() : 'bootstrap missing');
        window.location.replace('login.html?redirect=mypage.html');
        return;
      }
      var user = await requireAuth();
      if (!user) return;
      renderProfile(user);
    } catch (err) {
      console.error('[P!CKLE Mypage]', err);
      window.location.replace('login.html?redirect=mypage.html');
    }
  }

  window.PickleMypage = {
    init: initMypage,
    getSupabaseClient: getSupabaseClient,
  };

  document.addEventListener('DOMContentLoaded', initMypage);
})();
