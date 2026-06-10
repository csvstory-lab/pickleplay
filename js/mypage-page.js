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
    if (meta.nickname && String(meta.nickname).trim()) {
      return String(meta.nickname).trim();
    }
    if (user.email) return user.email.split('@')[0];
    return '픽클러';
  }

  function getBioText(user) {
    var meta = user.user_metadata || {};
    if (meta.bio !== undefined && meta.bio !== null) {
      var savedBio = String(meta.bio).trim();
      return savedBio || DEFAULT_BIO_TEXT;
    }
    return DEFAULT_BIO_TEXT;
  }

  function getBioInputValue(user) {
    var meta = user.user_metadata || {};
    if (meta.bio !== undefined && meta.bio !== null) {
      return String(meta.bio);
    }
    return '';
  }

  function hasCustomAvatar(user) {
    var meta = user.user_metadata || {};
    return !!(
      (meta.avatar_html && String(meta.avatar_html).trim()) ||
      (meta.avatar_emoji && String(meta.avatar_emoji).trim())
    );
  }

  function getAvatarHtml(user) {
    var meta = user.user_metadata || {};

    if (meta.avatar_html && String(meta.avatar_html).trim()) {
      return String(meta.avatar_html);
    }

    if (meta.avatar_emoji && String(meta.avatar_emoji).trim()) {
      return escapeHtml(String(meta.avatar_emoji).trim());
    }

    if (!hasCustomAvatar(user)) {
      var avatarUrl = meta.avatar_url || meta.picture || meta.avatar || '';
      if (avatarUrl) {
        return (
          '<img src="' +
          escapeHtml(avatarUrl) +
          '" alt="프로필 사진">'
        );
      }
    }

    return escapeHtml(DEFAULT_AVATAR);
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
    var bio = getBioInputValue(user);

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

  async function saveProfile() {
    var newNick = document.getElementById('nicknameInput').value.trim();
    if (newNick.length < 2) {
      alert('닉네임을 2글자 이상 입력해주세요.');
      return;
    }

    var bioInput = document.getElementById('bioInput');
    var avatarPreview = document.getElementById('editAvatarPreview');
    var saveBtn = document.querySelector('.btn-save');
    var newBio = bioInput ? bioInput.value : '';
    var avatarHtml = avatarPreview ? avatarPreview.innerHTML : '';

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중…';
    }

    try {
      var sb = getSupabaseClient();
      var mergedMeta = Object.assign({}, (currentUser && currentUser.user_metadata) || {}, {
        nickname: newNick,
        bio: newBio,
        avatar_html: avatarHtml,
      });

      var result = await sb.auth.updateUser({
        data: mergedMeta,
      });

      if (result.error) throw result.error;

      if (result.data && result.data.user) {
        renderProfile(result.data.user);
      } else {
        document.getElementById('mainNickname').innerHTML =
          escapeHtml(newNick) + ' ' + GRADE_BADGE_HTML;
        if (bioInput) {
          document.getElementById('mainBio').innerText =
            newBio.trim() || DEFAULT_BIO_TEXT;
        }
        if (avatarPreview) {
          document.getElementById('mainAvatar').innerHTML = avatarHtml;
        }
      }

      alert('프로필이 성공적으로 저장되었습니다! ✨');

      if (typeof closePanel === 'function') {
        closePanel('profileEditPanel');
        setTimeout(function () {
          closePanel('settingsPanel');
        }, 100);
      }
    } catch (error) {
      console.error('프로필 저장 실패:', error.message);
      alert('프로필 저장에 실패했습니다: ' + error.message);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '완료';
      }
    }
  }

  var CATEGORY_LABELS = {
    hot: '🔥 HOT',
    brand: '🤝 브랜드',
    love: '💖 연애',
    brain: '⚖️ 밸런스',
    ugc: '✨ UGC',
    other: '📌 기타',
  };

  function categoryLabel(category) {
    if (!category) return '🔥 불판';
    return CATEGORY_LABELS[category] || category;
  }

  function formatCardDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  async function fetchVoteStatsMap(sb, postIds) {
    var map = new Map();
    if (!postIds.length) return map;

    var rpc = await sb.rpc('get_post_vote_stats', { post_ids: postIds });
    if (!rpc.error && rpc.data) {
      rpc.data.forEach(function (st) {
        map.set(st.post_id, {
          votesA: Number(st.votes_a) || 0,
          votesB: Number(st.votes_b) || 0,
          total: Number(st.total) || 0,
        });
      });
      return map;
    }

    var fallback = await sb
      .from('votes')
      .select('post_id, choice')
      .in('post_id', postIds);

    if (fallback.error) {
      console.warn('[P!CKLE Mypage] 투표 집계 실패', fallback.error);
      postIds.forEach(function (id) {
        map.set(id, { votesA: 0, votesB: 0, total: 0 });
      });
      return map;
    }

    postIds.forEach(function (id) {
      map.set(id, { votesA: 0, votesB: 0, total: 0 });
    });

    (fallback.data || []).forEach(function (row) {
      var st = map.get(row.post_id) || { votesA: 0, votesB: 0, total: 0 };
      if (row.choice === 'A') st.votesA += 1;
      if (row.choice === 'B') st.votesB += 1;
      st.total += 1;
      map.set(row.post_id, st);
    });

    return map;
  }

  function buildRecordCard(post, stats) {
    var visible = post.visibility_status === 'visible';
    var statusClass = visible ? 'ing' : 'done';
    var statusText = visible ? '진행 중' : '종료/비공개';
    var total = stats && stats.total ? stats.total : 0;
    var title = post.title || post.option_a_name || '제목 없음';

    return (
      '<div class="record-card" data-id="' +
      escapeHtml(post.id) +
      '" role="button" tabindex="0" aria-label="' +
      escapeHtml(title) +
      '">' +
      '<div class="card-header">' +
      '<span class="status-badge ' +
      statusClass +
      '">' +
      escapeHtml(statusText) +
      '</span>' +
      '<span class="card-date">' +
      escapeHtml(formatCardDate(post.created_at)) +
      '</span>' +
      '</div>' +
      '<div class="card-title">' +
      escapeHtml(title) +
      '</div>' +
      '<div class="card-footer-stats">' +
      '<span class="stat-fire">🔥 ' +
      total.toLocaleString() +
      '명 참전</span>' +
      '<span>' +
      escapeHtml(categoryLabel(post.category)) +
      '</span>' +
      '</div>' +
      '</div>'
    );
  }

  function bindRecordCards(container) {
    if (!container) return;
    container.querySelectorAll('.record-card').forEach(function (card) {
      var id = card.dataset.id;
      if (!id) return;
      card.addEventListener('click', function () {
        window.location.href =
          'detail.html?id=' + encodeURIComponent(id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.location.href =
            'detail.html?id=' + encodeURIComponent(id);
        }
      });
    });
  }

  async function loadCreatedPosts(userId) {
    var container = document.getElementById('createdArea');
    if (!container) return;

    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('posts')
        .select(
          'id, title, category, option_a_name, option_b_name, visibility_status, created_at'
        )
        .eq('author_id', userId)
        .order('created_at', { ascending: false });

      if (result.error) throw result.error;

      var posts = result.data || [];
      if (!posts.length) {
        container.innerHTML =
          '<div class="empty-state" id="createdEmpty">아직 생성한 불판이 없습니다.</div>';
        return;
      }

      var postIds = posts.map(function (p) {
        return p.id;
      });
      var voteMap = await fetchVoteStatsMap(sb, postIds);

      container.innerHTML = posts
        .map(function (post) {
          var stats = voteMap.get(post.id);
          return buildRecordCard(post, stats);
        })
        .join('');

      bindRecordCards(container);
    } catch (err) {
      console.error('[P!CKLE Mypage] 지핀 불판 로드 실패', err);
      container.innerHTML =
        '<div class="empty-state" id="createdEmpty">불판 목록을 불러오지 못했습니다.</div>';
    }
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
      await loadCreatedPosts(user.id);
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
    saveProfile: saveProfile,
    loadCreatedPosts: loadCreatedPosts,
    getCurrentUser: function () {
      return currentUser;
    },
  };

  window.saveProfile = saveProfile;

  document.addEventListener('DOMContentLoaded', initMypage);
})();
