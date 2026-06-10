/**
 * P!CKLE mypage.html — Supabase Auth 연동
 * window.PICKLE_SUPABASE_CONFIG + PickleSupabaseBootstrap
 */
(function () {
  'use strict';

  var GRADE_BADGE_HTML = '<span class="grade-badge">Lv.5</span>';
  var DEFAULT_BIO_TEXT = '소개글이 없습니다.';
  var DEFAULT_AVATAR = '🥒';
  var currentUser = null;

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
    if (meta.nickname) return String(meta.nickname).trim();
    if (user.email) return user.email.split('@')[0];
    return '픽클러';
  }

  function getBioText(user) {
    var meta = user.user_metadata || {};
    var bio = meta.bio ? String(meta.bio).trim() : '';
    return bio || DEFAULT_BIO_TEXT;
  }

  function getAvatarHtml(user) {
    var meta = user.user_metadata || {};
    var avatarUrl = meta.avatar_url || meta.picture || meta.avatar || '';
    if (avatarUrl) {
      return (
        '<img src="' +
        escapeHtml(avatarUrl) +
        '" alt="프로필 사진">'
      );
    }
    var emoji = meta.avatar_emoji ? String(meta.avatar_emoji).trim() : '';
    return escapeHtml(emoji || DEFAULT_AVATAR);
  }

  function getAuthProvider(user) {
    if (!user) return 'email';
    var provider =
      (user.app_metadata && user.app_metadata.provider) ||
      (user.identities && user.identities[0] && user.identities[0].provider) ||
      '';
    provider = String(provider).toLowerCase();
    if (provider === 'google' || provider === 'kakao') {
      return provider;
    }
    var signupPlatform = user.user_metadata && user.user_metadata.signup_platform;
    if (signupPlatform === 'email') return 'email';
    if (user.email) return 'email';
    return provider || 'email';
  }

  function getSnsLinkLabel(user) {
    var provider = getAuthProvider(user);
    if (provider === 'google') return '구글 계정 연동됨';
    if (provider === 'kakao') return '카카오톡 연동됨';
    return '이메일 계정 인증됨';
  }

  function redirectToLogin() {
    window.location.replace('login.html?redirect=mypage.html');
  }

  function renderSnsLinkStatus(user) {
    var el = document.getElementById('snsLinkStatus');
    if (!el) return;
    el.textContent = getSnsLinkLabel(user);
  }

  function fillProfileEditForm(user) {
    var name = getDisplayName(user);
    var meta = user.user_metadata || {};
    var bio = meta.bio ? String(meta.bio).trim() : '';

    var nickInput = document.getElementById('nicknameInput');
    if (nickInput) {
      nickInput.value = name;
      if (typeof updateCharCount === 'function') {
        updateCharCount('nicknameInput', 'nickCount');
      }
    }

    var bioInput = document.getElementById('bioInput');
    if (bioInput) {
      bioInput.value = bio;
      if (typeof updateCharCount === 'function') {
        updateCharCount('bioInput', 'bioCount');
      }
    }

    var editAvatar = document.getElementById('editAvatarPreview');
    if (editAvatar) {
      editAvatar.innerHTML = getAvatarHtml(user);
    }

    var inquiryEmail = document.querySelector('#inquiryArea input[type="email"]');
    if (inquiryEmail && user.email) {
      inquiryEmail.value = user.email;
    }
  }

  function renderProfile(user) {
    currentUser = user;
    var name = getDisplayName(user);

    var nickEl = document.getElementById('mainNickname');
    if (nickEl) {
      nickEl.innerHTML = escapeHtml(name) + ' ' + GRADE_BADGE_HTML;
    }

    var bioEl = document.getElementById('mainBio');
    if (bioEl) {
      bioEl.textContent = getBioText(user);
    }

    var avatarEl = document.getElementById('mainAvatar');
    if (avatarEl) {
      avatarEl.innerHTML = getAvatarHtml(user);
    }

    fillProfileEditForm(user);
    renderSnsLinkStatus(user);
  }

  async function requireAuth() {
    var sb = getSupabaseClient();
    var result = await sb.auth.getUser();
    if (result.error) throw result.error;
    if (!result.data.user) {
      alert('로그인이 필요한 페이지입니다.');
      redirectToLogin();
      return null;
    }
    return result.data.user;
  }

  function bindProfileEditOpen() {
    var btn = document.getElementById('btnOpenProfileEdit');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (currentUser) {
        fillProfileEditForm(currentUser);
      }
      if (typeof openPanel === 'function') {
        openPanel('profileEditPanel');
      }
    });
  }

  function bindLogout() {
    var btn = document.getElementById('btnLogout');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      if (!confirm('로그아웃 하시겠습니까?')) return;
      try {
        var sb = getSupabaseClient();
        var result = await sb.auth.signOut();
        if (result.error) throw result.error;
        window.location.replace('login.html');
      } catch (err) {
        alert(err.message || '로그아웃에 실패했습니다.');
      }
    });
  }

  async function initMypage() {
    try {
      var b = window.PickleSupabaseBootstrap;
      if (!b || !b.isReady()) {
        console.warn('[P!CKLE Mypage]', b ? b.getErrorMessage() : 'bootstrap missing');
        alert('로그인이 필요한 페이지입니다.');
        redirectToLogin();
        return;
      }

      var user = await requireAuth();
      if (!user) return;

      renderProfile(user);
      bindProfileEditOpen();
      bindLogout();
    } catch (err) {
      console.error('[P!CKLE Mypage]', err);
      alert('로그인이 필요한 페이지입니다.');
      redirectToLogin();
    }
  }

  window.PickleMypage = {
    init: initMypage,
    getSupabaseClient: getSupabaseClient,
    renderProfile: renderProfile,
    fillProfileEditForm: fillProfileEditForm,
    getCurrentUser: function () {
      return currentUser;
    },
  };

  document.addEventListener('DOMContentLoaded', initMypage);
})();
