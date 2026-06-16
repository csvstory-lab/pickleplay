/**
 * P!CKLE — result.html 취향 통계 넛지 (모자이크 + UserInfoModal 연동)
 */
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function isInfoCollected(profile) {
    if (window.PickleProgressiveProfiling) {
      return window.PickleProgressiveProfiling.isInfoCollected(profile);
    }
    return profile && profile.is_info_collected === true;
  }

  function setTasteStatsLocked(locked) {
    var wrap = $('tasteStatsWrap');
    if (!wrap) return;
    wrap.classList.toggle('is-locked', !!locked);
    wrap.setAttribute('aria-hidden', locked ? 'false' : 'false');
  }

  function openUserInfoModal() {
    if (window.PickleUserInfoModal && window.PickleUserInfoModal.open) {
      window.PickleUserInfoModal.open();
      return;
    }
    alert('취향 정보 입력 창을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
  }

  function bindUnlockInteractions() {
    var wrap = $('tasteStatsWrap');
    var btn = $('tasteUnlockBtn');
    var lockLayer = $('tasteStatsLock');

    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openUserInfoModal();
      });
    }

    if (lockLayer) {
      lockLayer.addEventListener('click', function (e) {
        if (e.target === lockLayer || e.target.closest('.taste-unlock-btn')) return;
        openUserInfoModal();
      });
    }

    if (wrap) {
      wrap.addEventListener('click', function (e) {
        if (!wrap.classList.contains('is-locked')) return;
        if (e.target.closest('.taste-unlock-btn')) return;
        if (e.target.closest('#tasteStatsLock')) {
          openUserInfoModal();
        }
      });
    }
  }

  function applyProfileGate(profile) {
    setTasteStatsLocked(!isInfoCollected(profile));
  }

  function initAuthGate() {
    if (!window.PickleAuth || !window.PickleAuth.ensureAuthenticated) {
      setTasteStatsLocked(true);
      return;
    }

    window.PickleAuth.ensureAuthenticated()
      .then(function (ctx) {
        applyProfileGate(ctx && ctx.profile);
      })
      .catch(function () {
        setTasteStatsLocked(true);
      });
  }

  function bootstrap() {
    bindUnlockInteractions();

    window.addEventListener('pickle-auth-ready', function (e) {
      applyProfileGate(e.detail && e.detail.profile);
    });

    window.addEventListener('pickle-user-info-collected', function () {
      setTasteStatsLocked(false);
      if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
        window.PickleAuth.ensureAuthenticated({ forceRefresh: true }).catch(function () {});
      }
    });

    initAuthGate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
