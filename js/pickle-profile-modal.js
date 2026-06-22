/**
 * P!CKLE — 공통 유저 프로필 바텀시트 마운트 · 클릭 위임
 * @build 20260617_profile_modal1
 */
(function () {
  'use strict';

  var MOUNTED = false;
  var CLICK_BOUND = false;

  var PROFILE_MODAL_HTML =
    '<div id="profileModalOverlay" class="pickle-profile-modal-overlay" aria-hidden="true"></div>' +
    '<div class="pickle-profile-modal-sheet" id="userProfileSheet" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle" aria-hidden="true">' +
    '<div class="sheet-header">' +
    '<h2 class="sheet-title" id="profileModalTitle"><i class="ph-fill ph-user-circle" aria-hidden="true"></i>픽클러 프로필</h2>' +
    '<button type="button" class="btn-close-sheet" id="profileModalCloseBtn" aria-label="닫기"><i class="ph ph-x"></i></button>' +
    '</div>' +
    '<div class="profile-modal-body">' +
    '<div id="popupUserPic" class="profile-modal-avatar"><i class="ph-fill ph-user"></i></div>' +
    '<div class="profile-modal-identity">' +
    '<div id="popupUserName" class="profile-modal-name">픽클러</div>' +
    '<p class="profile-modal-bio" id="popupUserBadge" hidden></p>' +
    '</div>' +
    '<div class="profile-modal-stats">' +
    '<div>나를 픽한 <span id="popupFollowerCount" class="stat-value stat-value--mint">0</span></div>' +
    '<div class="profile-modal-stats-divider" aria-hidden="true"></div>' +
    '<div>내가 픽한 <span id="popupFollowingCount" class="stat-value stat-value--blue">0</span></div>' +
    '</div>' +
    '</div>' +
    '<div class="profile-modal-actions">' +
    '<button type="button" class="btn-action-v2" id="popupFollowBtn"><i class="ph ph-plus-bold"></i> 나의 픽</button>' +
    '<button type="button" class="btn-action-v2" id="popupMessageBtn"><i class="ph-fill ph-paper-plane-tilt"></i> 메시지 보내기</button>' +
    '</div>' +
    '</div>';

  function closeProfileModal() {
    if (window.PickleFollows && typeof window.PickleFollows.closeUserProfileModal === 'function') {
      window.PickleFollows.closeUserProfileModal();
      return;
    }
    var overlay = document.getElementById('profileModalOverlay');
    var sheet = document.getElementById('userProfileSheet');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (sheet) {
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  function handleProfilePopupFollow() {
    var btn = document.getElementById('popupFollowBtn');
    if (!btn) return;
    var targetUid = btn.getAttribute('data-user-id');
    if (!targetUid) return;
    if (!window.PickleFollows || typeof window.PickleFollows.toggleFollow !== 'function') return;

    window.PickleFollows.toggleFollow(targetUid).then(function (isFollowing) {
      if (window.PickleFollows.setPopupFollowButtonState) {
        window.PickleFollows.setPopupFollowButtonState(btn, isFollowing);
      }
      if (typeof window.PickleFollows.loadProfilePopupCounts === 'function') {
        window.PickleFollows.loadProfilePopupCounts(targetUid);
      }
    });
  }

  function handleProfileMessageClick() {
    if (typeof window.openMessageModal === 'function') {
      window.openMessageModal();
      return;
    }
    closeProfileModal();
  }

  function bindModalChrome() {
    var overlay = document.getElementById('profileModalOverlay');
    var closeBtn = document.getElementById('profileModalCloseBtn');
    var followBtn = document.getElementById('popupFollowBtn');
    var messageBtn = document.getElementById('popupMessageBtn');

    if (overlay && overlay.dataset.bound !== '1') {
      overlay.dataset.bound = '1';
      overlay.addEventListener('click', closeProfileModal);
    }
    if (closeBtn && closeBtn.dataset.bound !== '1') {
      closeBtn.dataset.bound = '1';
      closeBtn.addEventListener('click', closeProfileModal);
    }
    if (followBtn && followBtn.dataset.bound !== '1') {
      followBtn.dataset.bound = '1';
      followBtn.addEventListener('click', handleProfilePopupFollow);
    }
    if (messageBtn && messageBtn.dataset.bound !== '1') {
      messageBtn.dataset.bound = '1';
      messageBtn.addEventListener('click', handleProfileMessageClick);
    }
  }

  function extractProfileFromCommentItem(commentItem) {
    if (!commentItem) return null;

    var uid = commentItem.getAttribute('data-user-id') || '';
    var nickname = commentItem.getAttribute('data-author-name') || '';

    var picEl =
      commentItem.querySelector('.author-pic') ||
      commentItem.querySelector('.comment-author-avatar');
    var nameEl = commentItem.querySelector('.comment-author');

    if (!nickname && nameEl) nickname = nameEl.textContent.trim();
    if (!uid && commentItem.dataset.userId) uid = commentItem.dataset.userId;

    var avatarHtml = picEl ? picEl.innerHTML : '';

    return {
      userId: uid,
      nickname: nickname,
      avatarHtml: avatarHtml,
    };
  }

  function extractProfileFromAuthorBox() {
    var followBtn = document.getElementById('detailFollowBtn');
    var nameEl = document.getElementById('detailAuthorName');
    var picEl = document.getElementById('detailAuthorPic');
    if (!followBtn) return null;

    return {
      userId: followBtn.getAttribute('data-user-id') || '',
      nickname: nameEl ? nameEl.textContent.trim() : '',
      avatarHtml: picEl ? picEl.innerHTML : '',
    };
  }

  function bindProfileClickDelegation() {
    if (CLICK_BOUND) return;
    CLICK_BOUND = true;

    document.addEventListener('click', function (e) {
      var target = e.target.closest(
        '.author-pic, .comment-user span, #detailAuthorName, .comment-author, .comment-author-avatar'
      );
      if (!target) return;

      var commentItem = target.closest('.comment-item');
      var authorBox = target.closest('.post-author-box');
      var profile = null;

      if (commentItem) {
        profile = extractProfileFromCommentItem(commentItem);
      } else if (authorBox) {
        profile = extractProfileFromAuthorBox();
      } else {
        return;
      }

      if (!profile || !profile.userId) return;

      e.preventDefault();
      e.stopPropagation();

      if (typeof window.openUserProfileModal === 'function') {
        window.openUserProfileModal(profile.userId, {
          nickname: profile.nickname,
          avatarHtml: profile.avatarHtml,
        });
      }
    });
  }

  function removeLegacyProfileModal() {
    var legacyOverlay = document.getElementById('rankingProfileOverlay');
    if (legacyOverlay) legacyOverlay.remove();

    var sheet = document.getElementById('userProfileSheet');
    if (sheet && !sheet.classList.contains('pickle-profile-modal-sheet')) {
      sheet.remove();
    }
  }

  function mountProfileModal() {
    removeLegacyProfileModal();

    if (!document.getElementById('userProfileSheet')) {
      var root = document.createElement('div');
      root.id = 'pickleProfileModalRoot';
      root.innerHTML = PROFILE_MODAL_HTML;
      document.body.appendChild(root);
    }

    bindModalChrome();
    bindProfileClickDelegation();
    MOUNTED = true;
  }

  function ensureProfileModal() {
    if (!document.getElementById('userProfileSheet')) {
      mountProfileModal();
    } else if (!MOUNTED) {
      bindModalChrome();
      bindProfileClickDelegation();
      MOUNTED = true;
    }
  }

  window.PickleProfileModal = {
    mount: mountProfileModal,
    ensure: ensureProfileModal,
    close: closeProfileModal,
  };

  window.closeRankingProfileModal = closeProfileModal;
  window.handleProfilePopupFollow = handleProfilePopupFollow;
  window.handleRankingPopupFollow = handleProfilePopupFollow;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountProfileModal);
  } else {
    mountProfileModal();
  }
})();
