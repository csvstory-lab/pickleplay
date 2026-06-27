/**
 * P!CKLE mypage.html — Supabase Auth 연동
 * window.PICKLE_SUPABASE_CONFIG + PickleSupabaseBootstrap
 */
(function () {
  'use strict';

  var DEFAULT_BIO_TEXT = '소개글이 없습니다.';
  var DEFAULT_AVATAR = '🥒';
  var currentUser = null;
  var currentUserRankingPoints = 0;
  var profileDbRow = null;

  var GENDER_LEGACY_MAP = {
    male: '남자',
    female: '여자',
    '남성': '남자',
    '여성': '여자',
  };

  var AGE_LEGACY_MAP = {
    '10s': '10대',
    '20s': '20대',
    '30s': '30대',
    '40s': '40대',
    '50plus': '50대이상',
    '50대+': '50대이상',
    '50대 이상': '50대이상',
  };

  function buildGradeBadgeHtmlFromPoints(points) {
    if (window.PickleProfile && window.PickleProfile.buildLevelBadgeFromPoints) {
      return window.PickleProfile.buildLevelBadgeFromPoints(points);
    }
    var level = 1;
    if (window.PickleProfile && window.PickleProfile.getUserLevelFromPoints) {
      level = window.PickleProfile.getUserLevelFromPoints(points);
    }
    return '<span class="grade-badge">Lv.' + level + '</span>';
  }

  function updateNicknameLevelBadge(level) {
    var badgeEl = document.getElementById('nicknameLevelBadge');
    if (!badgeEl) return;
    badgeEl.textContent = 'Lv.' + level;
  }

  function updateLevelExpUI(points) {
    var progress =
      window.PickleProfile && window.PickleProfile.getLevelProgress
        ? window.PickleProfile.getLevelProgress(points)
        : null;

    if (!progress) {
      var fallbackLevel = 1;
      if (window.PickleProfile && window.PickleProfile.getUserLevelFromPoints) {
        fallbackLevel = window.PickleProfile.getUserLevelFromPoints(points);
      }
      updateNicknameLevelBadge(fallbackLevel);
      var levelEl = document.getElementById('mainUserLevel');
      if (levelEl) levelEl.textContent = 'Lv.' + fallbackLevel;
      return;
    }

    var levelLabel = 'Lv.' + progress.level;
    var levelEl = document.getElementById('mainUserLevel');
    if (levelEl) {
      levelEl.textContent = levelLabel;
    }
    updateNicknameLevelBadge(progress.level);

    var expEl = document.getElementById('expText');
    if (expEl) {
      expEl.textContent = progress.expText;
    }

    var fill = document.querySelector('.exp-container .progress-fill');
    if (fill) {
      fill.style.width = progress.percent + '%';
    }
  }

  async function fetchCurrentUserRankingPoints(user) {
    if (!user || !user.id) return 0;
    try {
      var sb = getSupabaseClient();
      if (window.PickleProfile && window.PickleProfile.fetchRankingPoints) {
        return await window.PickleProfile.fetchRankingPoints(sb, user.id);
      }
    } catch (err) {
      console.warn('[P!CKLE Mypage] ranking points load failed', err);
    }
    return 0;
  }

  function extractAuthorSnapshotForCascade(user, nickname, avatarHtml) {
    if (window.PickleProfile && window.PickleProfile.extractAuthorSnapshot) {
      return window.PickleProfile.extractAuthorSnapshot(user, {
        nickname: nickname,
        avatar_html: avatarHtml,
      });
    }
    return {
      author_nickname: nickname || '픽클러',
      author_avatar_html: avatarHtml || '🥒',
    };
  }

  async function cascadeProfileSnapshots(sb, userId, snapshot) {
    var postsResult = await sb
      .from('posts')
      .update({
        author_nickname: snapshot.author_nickname,
        author_avatar_html: snapshot.author_avatar_html,
      })
      .eq('author_id', userId);

    if (postsResult.error) throw postsResult.error;

    var commentsResult = await sb
      .from('comments')
      .update({
        author_nickname: snapshot.author_nickname,
        author_avatar_html: snapshot.author_avatar_html,
      })
      .eq('user_id', userId);

    if (commentsResult.error) throw commentsResult.error;
  }

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
    if (window.PickleAuth && window.PickleAuth.getDisplayName) {
      return window.PickleAuth.getDisplayName(user);
    }
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

  function isOAuthCallback() {
    if (window.PickleOAuthCallbackGuard && window.PickleOAuthCallbackGuard.isOAuthCallback) {
      return window.PickleOAuthCallbackGuard.isOAuthCallback();
    }
    var hash = window.location.hash || '';
    return hash.indexOf('access_token=') !== -1 || hash.indexOf('type=recovery') !== -1;
  }

  function redirectToLogin() {
    if (isOAuthCallback() || window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
      return;
    }
    window.location.replace('login.html?redirect=mypage.html');
  }

  function promptLoginRequired(message) {
    if (isOAuthCallback() || window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
      return;
    }
    if (window.PickleAuth && window.PickleAuth.alertLoginRequired) {
      window.PickleAuth.alertLoginRequired(message, redirectToLogin);
      return;
    }
    alert(message || '로그인이 필요한 페이지입니다.');
    redirectToLogin();
  }

  function isAuthRelatedError(err) {
    if (!err) return false;
    var msg = String(err.message || err).toLowerCase();
    var code = String(err.code || '');
    if (String(err.message || err) === 'LOGIN_REQUIRED') return true;
    if (window.PickleAuth && window.PickleAuth.isSessionMissingError) {
      if (window.PickleAuth.isSessionMissingError(err)) return true;
    }
    return (
      code === '42501' ||
      code === 'PGRST301' ||
      msg.indexOf('row-level security') !== -1 ||
      msg.indexOf('jwt') !== -1 ||
      msg.indexOf('not authenticated') !== -1 ||
      msg.indexOf('auth session') !== -1 ||
      msg.indexOf('session missing') !== -1
    );
  }

  function handleMypageError(err, contextMessage) {
    console.error('[P!CKLE Mypage]', contextMessage || '', err);
    if (isAuthRelatedError(err)) {
      if (isOAuthCallback() || window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
        return;
      }
      promptLoginRequired('로그인이 필요한 페이지입니다.');
      return;
    }
    var prefix = contextMessage ? contextMessage + ' ' : '';
    alert(prefix + (err && err.message ? err.message : String(err)));
  }

  function renderSnsLinkStatus(user) {
    var el = document.getElementById('snsLinkStatus');
    if (!el) return;
    el.textContent = getSnsLinkLabel(user);
  }

  function normalizeGenderForUi(value) {
    if (!value) return '';
    var s = String(value).trim();
    return GENDER_LEGACY_MAP[s] || s;
  }

  function normalizeAgeGroupForUi(value) {
    if (!value) return '';
    var s = String(value).trim();
    return AGE_LEGACY_MAP[s] || s;
  }

  function isMarketingAgreedRow(row) {
    if (!row) return false;
    return !!(row.marketing_agreed || row.marketing_consent);
  }

  async function loadProfileDbRow(userId) {
    if (!userId) {
      profileDbRow = null;
      return null;
    }
    try {
      var sb = getSupabaseClient();
      var res = await sb
        .from('users')
        .select('gender, age_group, region, is_over_14, marketing_agreed, marketing_consent')
        .eq('id', userId)
        .maybeSingle();
      if (res.error) {
        console.warn('[P!CKLE Mypage] profile demographics fetch failed', res.error);
        profileDbRow = null;
        return null;
      }
      profileDbRow = res.data || null;
      return profileDbRow;
    } catch (err) {
      console.warn('[P!CKLE Mypage] profile demographics fetch error', err);
      profileDbRow = null;
      return null;
    }
  }

  function syncProfileSelectFilledState() {
    ['profileGenderSelect', 'profileAgeGroupSelect', 'profileRegionSelect'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('has-value', !!el.value);
    });
  }

  function bindProfileSelectFilledState() {
    ['profileGenderSelect', 'profileAgeGroupSelect', 'profileRegionSelect'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.filledBound === '1') return;
      el.dataset.filledBound = '1';
      el.addEventListener('change', syncProfileSelectFilledState);
    });
  }

  function fillProfileDemographicsForm(row) {
    var genderSelect = document.getElementById('profileGenderSelect');
    if (genderSelect) {
      genderSelect.value = normalizeGenderForUi(row && row.gender) || '';
    }

    var ageSelect = document.getElementById('profileAgeGroupSelect');
    if (ageSelect) {
      var age = normalizeAgeGroupForUi(row && row.age_group);
      ageSelect.value = age || '';
    }

    var regionSelect = document.getElementById('profileRegionSelect');
    if (regionSelect) {
      regionSelect.value = row && row.region ? String(row.region).trim() : '';
    }

    var over14 = document.getElementById('profileIsOver14');
    if (over14) over14.checked = !!(row && row.is_over_14);

    var marketing = document.getElementById('profileMarketingAgreed');
    if (marketing) marketing.checked = isMarketingAgreedRow(row);

    syncProfileSelectFilledState();
  }

  function collectProfileDemographicsFromForm() {
    var genderSelect = document.getElementById('profileGenderSelect');
    var ageSelect = document.getElementById('profileAgeGroupSelect');
    var regionSelect = document.getElementById('profileRegionSelect');
    var over14 = document.getElementById('profileIsOver14');
    var marketing = document.getElementById('profileMarketingAgreed');

    return {
      gender: genderSelect && genderSelect.value ? genderSelect.value : null,
      age_group: ageSelect && ageSelect.value ? ageSelect.value : null,
      region: regionSelect && regionSelect.value ? regionSelect.value : null,
      is_over_14: !!(over14 && over14.checked),
      marketing_agreed: !!(marketing && marketing.checked),
    };
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

    var demoRow = profileDbRow || (user && user._profile) || null;
    fillProfileDemographicsForm(demoRow);
  }

  async function refreshMessageInboxBadgeSafe(user) {
    if (!user || !user.id) return;
    if (!window.PickleMessages || !window.PickleMessages.refreshInboxBadge) return;
    try {
      await window.PickleMessages.refreshInboxBadge(user.id);
    } catch (err) {
      console.error('[P!CKLE Mypage] message inbox badge failed', err);
    }
  }

  async function renderProfile(user) {
    currentUser = user;
    var name = getDisplayName(user);

    var nickEl = document.getElementById('mainNickname');
    var nickTextEl = document.getElementById('mainNicknameText');
    if (nickTextEl) {
      nickTextEl.textContent = name;
    } else if (nickEl) {
      nickEl.textContent = name;
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

    try {
      currentUserRankingPoints = await fetchCurrentUserRankingPoints(user);
    } catch (err) {
      console.error('[P!CKLE Mypage] ranking points load failed', err);
      currentUserRankingPoints = 0;
    }
    updateLevelExpUI(currentUserRankingPoints);

    if (window.PickleFollows && window.PickleFollows.loadFollowStats) {
      try {
        await window.PickleFollows.loadFollowStats(user.id);
      } catch (err) {
        console.error('[P!CKLE Mypage] follow stats load failed', err);
      }
    }

    await refreshMessageInboxBadgeSafe(user);
  }

  async function resolveAuthUserOnly() {
    if (window.PickleAuth && window.PickleAuth.getSessionUserFast) {
      try {
        var fastUser = await window.PickleAuth.getSessionUserFast({ timeoutMs: 800 });
        if (fastUser) return fastUser;
      } catch (fastErr) {
        console.warn('[P!CKLE Mypage] getSessionUserFast', fastErr);
      }
    }
    if (window.PickleAuth && window.PickleAuth.getUser) {
      var cached = window.PickleAuth.getUser();
      if (cached) return cached;
    }
    return null;
  }

  async function requireAuth() {
    if (window.PickleAuth && window.PickleAuth.requireAuth) {
      return window.PickleAuth.requireAuth({
        message: '로그인이 필요한 페이지입니다.',
        redirect: 'mypage.html',
      });
    }
    var user = await resolveAuthUserOnly();
    if (user) return user;

    if (isOAuthCallback() || window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
      return null;
    }
    promptLoginRequired('로그인이 필요한 페이지입니다.');
    return null;
  }

  function syncLevelGuideList() {
    var listEl = document.getElementById('levelGuideTiersList');
    if (!listEl || !window.PickleProfile || !window.PickleProfile.LEVEL_TIERS) return;

    listEl.innerHTML = window.PickleProfile.LEVEL_TIERS.map(function (tier) {
      var range =
        tier.max == null
          ? tier.min.toLocaleString() + '점 이상'
          : tier.min.toLocaleString() + '~' + tier.max.toLocaleString() + '점';
      return (
        '<li>Lv.' +
        tier.level +
        ' · ' +
        tier.label +
        ' (' +
        range +
        ')</li>'
      );
    }).join('');
  }

  function bindProfileAvatarClick() {
    var avatarEl = document.getElementById('mainAvatar');
    if (!avatarEl) return;
    avatarEl.setAttribute('role', 'button');
    avatarEl.setAttribute('tabindex', '0');
    avatarEl.setAttribute('aria-label', '프로필 편집');
    avatarEl.addEventListener('click', function () {
      var editBtn = document.getElementById('btnOpenProfileEdit');
      if (editBtn) editBtn.click();
    });
    avatarEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        avatarEl.click();
      }
    });
  }

  function bindLevelGuide() {
    var btn = document.getElementById('btnLevelGuide');
    var pop = document.getElementById('levelGuidePopover');
    if (!btn || !pop) return;

    function positionLevelGuidePopover() {
      var rect = btn.getBoundingClientRect();
      var popWidth = pop.offsetWidth || 260;
      var left = Math.max(16, Math.min(rect.left, window.innerWidth - popWidth - 16));
      var top = rect.bottom + 8;
      if (top + pop.offsetHeight > window.innerHeight - 16) {
        top = Math.max(16, rect.top - pop.offsetHeight - 8);
      }
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = pop.classList.contains('hidden');
      pop.classList.toggle('hidden');
      if (willOpen) {
        positionLevelGuidePopover();
      }
    });

    window.addEventListener('resize', function () {
      if (!pop.classList.contains('hidden')) {
        positionLevelGuidePopover();
      }
    });

    document.addEventListener('click', function (e) {
      if (!pop.classList.contains('hidden') && !pop.contains(e.target) && e.target !== btn) {
        pop.classList.add('hidden');
      }
    });
  }

  function bindProfileEditOpen() {
    var btn = document.getElementById('btnOpenProfileEdit');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      if (currentUser && currentUser.id) {
        await loadProfileDbRow(currentUser.id);
      }
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
    var confirmBtn = document.getElementById('btnLogoutConfirm');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (typeof window.openLogoutConfirm === 'function') {
        window.openLogoutConfirm();
        return;
      }
      performLogout();
    });

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async function () {
        await performLogout();
      });
    }
  }

  async function performLogout() {
    try {
      var sb = getSupabaseClient();
      var result = await sb.auth.signOut();
      if (result.error) throw result.error;
      window.location.replace('login.html');
    } catch (err) {
      if (typeof window.closeLogoutConfirm === 'function') {
        window.closeLogoutConfirm();
      }
      alert(err.message || '로그아웃에 실패했습니다.');
    }
  }

  function bindWithdraw() {
    if (window.PickleAccount && window.PickleAccount.bindWithdrawButton) {
      window.PickleAccount.bindWithdrawButton('btnWithdraw');
    }
  }

  async function saveProfile() {
    var newNick = document.getElementById('nicknameInput').value.trim();
    if (newNick.length < 2) {
      alert('닉네임을 2글자 이상 입력해주세요.');
      return;
    }

    var demographics = collectProfileDemographicsFromForm();
    if (!demographics.is_over_14) {
      alert('만 14세 이상만 정보 등록이 가능합니다.');
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

      var updatedUser =
        (result.data && result.data.user) || currentUser || null;
      if (!updatedUser || !updatedUser.id) {
        throw new Error('프로필 저장 후 사용자 정보를 확인할 수 없습니다.');
      }

      var snapshot = extractAuthorSnapshotForCascade(
        updatedUser,
        newNick,
        avatarHtml
      );

      await cascadeProfileSnapshots(sb, updatedUser.id, snapshot);

      var usersUpdate = {
        nickname: newNick,
        gender: demographics.gender,
        age_group: demographics.age_group,
        region: demographics.region,
        is_over_14: demographics.is_over_14,
        marketing_agreed: demographics.marketing_agreed,
      };
      if (avatarHtml) {
        usersUpdate.avatar_html = avatarHtml;
      }
      var usersResult = await sb
        .from('users')
        .update(usersUpdate)
        .eq('id', updatedUser.id);
      if (usersResult.error) {
        console.warn('[P!CKLE Mypage] users profile sync failed', usersResult.error);
        throw usersResult.error;
      }

      profileDbRow = Object.assign({}, profileDbRow || {}, usersUpdate);

      alert('프로필이 성공적으로 변경되었습니다.');
      window.location.reload();
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

  function categoryLabel(category) {
    var slug = String(category || '').trim().toLowerCase();
    if (!slug) return '불판';
    if (window.PickleCategories && window.PickleCategories.resolveCategoryName) {
      return window.PickleCategories.resolveCategoryName(slug);
    }
    return slug;
  }

  function formatCardDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getRemainingTime(expiresAt) {
    if (expiresAt == null || expiresAt === '') return '⏳ 종료된 불판';

    var expireDate = new Date(expiresAt);
    if (Number.isNaN(expireDate.getTime())) return '⏳ 종료된 불판';

    var now = new Date();
    var diffMs = expireDate.getTime() - now.getTime();

    if (diffMs <= 0) return '⏳ 종료된 불판';

    var diffMins = Math.floor(diffMs / (1000 * 60));
    var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return '⏳ ' + diffMins + '분 남음';
    if (diffHours < 24) return '⏳ ' + diffHours + '시간 남음';
    return '⏳ ' + diffDays + '일 남음';
  }

  function isPostTimeExpired(expiresAt) {
    if (expiresAt == null || expiresAt === '') return true;
    var expireDate = new Date(expiresAt);
    if (Number.isNaN(expireDate.getTime())) return true;
    return new Date() > expireDate;
  }

  function calcVotePercent(votesA, votesB) {
    var a = Number(votesA) || 0;
    var b = Number(votesB) || 0;
    var total = a + b;
    if (total <= 0) {
      return { pctA: 0, pctB: 0, total: 0 };
    }
    var pctA = Math.round((a / total) * 100);
    return { pctA: pctA, pctB: 100 - pctA, total: total };
  }

  function normalizeVotePost(row) {
    if (!row) return null;
    var post = row.posts;
    if (Array.isArray(post)) post = post[0];
    if (!post || !post.id) return null;
    return {
      post: post,
      choice: row.choice,
      votedAt: row.created_at,
    };
  }

  function formatMyPickLabel(post, choice) {
    var side = choice === 'B' ? 'B' : 'A';
    var label =
      side === 'A' ? post.option_a_name : post.option_b_name;
    return side + '. ' + (label || side);
  }

  function formatVoteOutcome(post, stats, choice) {
    if (!isPostTimeExpired(post.expires_at)) return '';
    if (!stats || !stats.total) return '';
    var pct = calcVotePercent(stats.votesA, stats.votesB);
    var winner = pct.pctA >= pct.pctB ? 'A' : 'B';
    var winPct = winner === 'A' ? pct.pctA : pct.pctB;
    if (choice === winner) {
      return '🎉 승리 (' + winPct + '%)';
    }
    return '💔 패배 (' + winPct + '%)';
  }

  function formatCouponExpiry(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return (
      d.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }) + ' 까지'
    );
  }

  var COUPON_SELECT_COLUMNS =
    'id, user_id, title, pin_number, is_used, expires_at, created_at';

  var savedCouponsLoadSeq = 0;
  var savedCouponsInflight = null;

  function getSupabaseErrorMessage(err) {
    if (!err) return '';
    if (typeof err === 'string') return err;
    return String(err.message || err.details || err.hint || err);
  }

  function getSupabaseErrorCode(err) {
    if (!err) return '';
    return String(err.code || '').toUpperCase();
  }

  function isCouponsTableMissingError(err) {
    var code = getSupabaseErrorCode(err);
    var msg = getSupabaseErrorMessage(err).toLowerCase();
    if (code === 'PGRST205' || code === '42P01') return true;
    if (msg.indexOf('could not find the table') !== -1) return true;
    if (
      msg.indexOf('relation') !== -1 &&
      msg.indexOf('does not exist') !== -1
    ) {
      return true;
    }
    return false;
  }

  function isCouponsPermissionError(err) {
    var code = getSupabaseErrorCode(err);
    var msg = getSupabaseErrorMessage(err).toLowerCase();
    return code === '42501' || msg.indexOf('permission denied') !== -1;
  }

  function isCouponsColumnError(err) {
    var code = getSupabaseErrorCode(err);
    var msg = getSupabaseErrorMessage(err).toLowerCase();
    return code === '42703' || code === 'PGRST204' || msg.indexOf('column') !== -1;
  }

  function normalizeCouponRow(row) {
    if (!row || row.id == null) return null;
    var pin =
      row.pin_number != null
        ? row.pin_number
        : row.pin_code != null
          ? row.pin_code
          : row.pin != null
            ? row.pin
            : '';
    var used = row.is_used;
    if (used == null && row.used != null) used = row.used;

    return {
      id: row.id,
      title: row.title || row.coupon_title || '쿠폰',
      pin_number: String(pin || ''),
      is_used: used === true || used === 'true' || used === 1,
      expires_at: row.expires_at || row.expiry_at || null,
      created_at: row.created_at || null,
    };
  }

  async function waitForSupabaseSession(sb, maxAttempts) {
    if (window.PickleAuth && window.PickleAuth.waitForAuthHydration) {
      var hydratedSession = await window.PickleAuth.waitForAuthHydration(sb, {
        timeoutMs: 4000,
      });
      if (hydratedSession && hydratedSession.access_token && hydratedSession.user) {
        return hydratedSession;
      }
    } else if (window.PickleAuth && window.PickleAuth.waitForSessionReady) {
      await window.PickleAuth.waitForSessionReady();
    }

    var attempts = maxAttempts || 10;
    for (var i = 0; i < attempts; i++) {
      var sessionResult = await sb.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      var session = sessionResult.data && sessionResult.data.session;
      if (session && session.access_token && session.user) {
        return session;
      }
      await new Promise(function (resolve) {
        setTimeout(resolve, 100);
      });
    }
    throw new Error('LOGIN_REQUIRED');
  }

  async function ensureAuthenticatedSession(sb) {
    if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
      var auth = await window.PickleAuth.ensureAuthenticated({ timeoutMs: 5000 });
      if (auth && auth.user) return auth.user;
      throw new Error('LOGIN_REQUIRED');
    }
    var session = await waitForSupabaseSession(sb);
    if (session && session.user) {
      return session.user;
    }
    if (window.PickleAuth && window.PickleAuth.safeGetSessionUser) {
      var user = await window.PickleAuth.safeGetSessionUser(sb);
      if (user) return user;
    }
    throw new Error('LOGIN_REQUIRED');
  }

  async function fetchUserCoupons(sb, userId) {
    var attempts = [
      function () {
        return sb
          .from('user_coupons')
          .select(COUPON_SELECT_COLUMNS)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
      },
      function () {
        return sb
          .from('user_coupons')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
      },
      function () {
        return sb
          .from('user_coupons')
          .select('*')
          .eq('user_id', userId);
      },
    ];

    var lastError = null;
    for (var i = 0; i < attempts.length; i++) {
      var result = await attempts[i]();
      if (!result.error) {
        return { rows: result.data || [], error: null };
      }
      lastError = result.error;
      console.warn(
        '[P!CKLE Mypage] user_coupons query attempt ' + (i + 1) + ' failed',
        result.error
      );
    }

    return { rows: [], error: lastError };
  }

  function renderSavedCouponsError(container, err) {
    if (isCouponsTableMissingError(err)) {
      container.innerHTML =
        '<div class="empty-state" id="savedEmpty">보관함 테이블이 API에 아직 노출되지 않았습니다.<br>Supabase SQL Editor에서 <strong>18b_user_coupons_grants_fix.sql</strong> 실행 후 새로고침해 주세요.</div>';
      return;
    }
    if (isCouponsPermissionError(err)) {
      container.innerHTML =
        '<div class="empty-state" id="savedEmpty">보관함 접근 권한이 없습니다.<br>Supabase에서 <strong>18b_user_coupons_grants_fix.sql</strong> (GRANT)을 실행해 주세요.</div>';
      return;
    }
    if (isCouponsColumnError(err)) {
      container.innerHTML =
        '<div class="empty-state" id="savedEmpty">보관함 컬럼 구조가 맞지 않습니다.<br>필수: <strong>title, pin_number, is_used, expires_at</strong></div>';
      return;
    }
    container.innerHTML =
      '<div class="empty-state" id="savedEmpty">보관함을 불러오지 못했습니다.<br><span style="font-size:0.78rem;color:#71717a;">' +
      escapeHtml(
        (getSupabaseErrorCode(err) ? '[' + getSupabaseErrorCode(err) + '] ' : '') +
          getSupabaseErrorMessage(err)
      ) +
      '</span></div>';
  }

  async function copyPinToClipboard(pin) {
    if (!pin) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(pin);
      } else {
        var ta = document.createElement('textarea');
        ta.value = pin;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      if (navigator.vibrate) navigator.vibrate(50);
      alert('핀번호가 클립보드에 복사되었습니다!');
    } catch (err) {
      console.warn('[P!CKLE Mypage] PIN 복사 실패', err);
      alert('복사에 실패했습니다. 핀번호를 직접 선택해 주세요.');
    }
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

  function resolvePostAuthorId(post) {
    if (!post) return null;
    return post.author_id || post.user_id || post.creator_id || null;
  }

  function isViewerPostCreator(post, viewerUserId) {
    if (!viewerUserId) return false;
    var authorId = resolvePostAuthorId(post);
    return !!authorId && authorId === viewerUserId;
  }

  function buildCreatorLiveResultHtml(post, stats) {
    var st = stats || { votesA: 0, votesB: 0, total: 0 };
    var pct = calcVotePercent(st.votesA, st.votesB);
    var labelA = post.option_a_name || 'A';
    var labelB = post.option_b_name || 'B';

    return (
      '<div class="vote-result-box creator-live-stats">' +
      '<div class="creator-live-ab">' +
      '<span class="pick-a">A ' +
      pct.pctA +
      '%</span>' +
      '<span class="live-ab-sep">vs</span>' +
      '<span class="pick-b">B ' +
      pct.pctB +
      '%</span>' +
      '</div>' +
      '<div class="creator-live-total">🔥 ' +
      pct.total.toLocaleString() +
      '표 · ' +
      escapeHtml(labelA) +
      ' ' +
      (Number(st.votesA) || 0).toLocaleString() +
      ' / ' +
      escapeHtml(labelB) +
      ' ' +
      (Number(st.votesB) || 0).toLocaleString() +
      '</div>' +
      '</div>'
    );
  }

  function buildActiveBlindedResultHtml() {
    return (
      '<div class="card-result-blind" aria-label="진행 중 결과 블라인드">' +
      '<i class="ph ph-lock-simple" aria-hidden="true"></i>' +
      '<span>진행 중 (결과 블라인드)</span>' +
      '</div>'
    );
  }

  function buildEditButtonHtml(post) {
    if (!post || post.visibility_status !== 'visible') return '';
    return (
      '<button type="button" class="btn-edit-post ing" data-post-id="' +
      escapeHtml(post.id) +
      '" aria-label="불판 수정">수정</button>'
    );
  }

  function buildShareButtonHtml(post, title) {
    if (!post || post.visibility_status !== 'visible') return '';
    return (
      '<button type="button" class="btn-share-post ing" data-post-id="' +
      escapeHtml(post.id) +
      '" data-post-title="' +
      escapeHtml(title) +
      '" aria-label="공유">공유</button>'
    );
  }

  function buildCardActionButtonsHtml(post, title, options) {
    var opts = options || {};
    var parts = [];
    if (opts.includeEdit) {
      parts.push(buildEditButtonHtml(post));
    }
    if (opts.includeShare) {
      parts.push(buildShareButtonHtml(post, title));
    }
    return parts.filter(Boolean).join('');
  }

  function buildPostDetailShareUrl(postId) {
    var url = new URL('detail.html', window.location.href);
    url.searchParams.set('id', postId);
    return url.toString();
  }

  async function copyShareUrlToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  function notifyShareUrlCopied() {
    alert('주소가 복사되었습니다.');
  }

  async function requestPostShare(post) {
    if (!post || !post.id) return;

    var title = post.title || post.option_a_name || 'P!CKLE 불판';
    var text = '지금 P!CKLE에서 치열한 투표가 진행 중입니다! 당신의 선택은?';
    var shareUrl = buildPostDetailShareUrl(post.id);

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: title,
          text: text,
          url: shareUrl,
        });
        if (window.PickleRankingEvents && window.PickleRankingEvents.recordPostShare) {
          window.PickleRankingEvents.recordPostShare(post.id, 'native');
        }
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.warn('[P!CKLE Mypage] navigator.share 실패, 클립보드 fallback', err);
      }
    }

    try {
      await copyShareUrlToClipboard(shareUrl);
      if (window.PickleRankingEvents && window.PickleRankingEvents.recordPostShare) {
        window.PickleRankingEvents.recordPostShare(post.id, 'clipboard');
      }
      notifyShareUrlCopied();
    } catch (err) {
      console.warn('[P!CKLE Mypage] share URL 복사 실패', err);
      alert('주소 복사에 실패했습니다. 직접 복사해 주세요:\n' + shareUrl);
    }
  }

  function buildVoteProgressBarHtml(post, stats) {
    var st = stats || { votesA: 0, votesB: 0, total: 0 };
    var pct = calcVotePercent(st.votesA, st.votesB);
    var labelA = (post && post.option_a_name) || 'A';
    var labelB = (post && post.option_b_name) || 'B';

    return (
      '<div class="card-vote-progress">' +
      '<div class="card-vote-progress__track">' +
      '<div class="card-vote-progress__fill-a" style="width:' +
      pct.pctA +
      '%"></div>' +
      '<div class="card-vote-progress__fill-b"></div>' +
      '</div>' +
      '<div class="card-vote-progress__labels">' +
      '<span class="pick-a">A ' +
      pct.pctA +
      '% · ' +
      escapeHtml(labelA) +
      '</span>' +
      '<span class="pick-b">B ' +
      pct.pctB +
      '% · ' +
      escapeHtml(labelB) +
      '</span>' +
      '</div>' +
      '</div>'
    );
  }

  function buildCardStatsRow(post, stats, options) {
    var opts = options || {};
    var likeNum = Number(post && post.comment_count);
    if (!Number.isFinite(likeNum) || likeNum < 0) likeNum = 0;
    var voteNum = Number(stats && stats.total);
    if (!Number.isFinite(voteNum) || voteNum < 0) {
      voteNum = Number(post && post.vote_count) || 0;
    }

    var voteStatHtml = opts.hideVoteStats
      ? ''
      : '<span class="card-stat-item card-stat-item--vote">' +
        '<i class="ph ph-check-circle" aria-hidden="true"></i>' +
        voteNum.toLocaleString() +
        '</span>';

    return (
      '<div class="card-row-stats">' +
      '<div class="card-stat-group">' +
      '<span class="card-stat-item card-stat-item--like">' +
      '<i class="ph ph-heart" aria-hidden="true"></i>' +
      likeNum.toLocaleString() +
      '</span>' +
      voteStatHtml +
      '</div>' +
      '</div>'
    );
  }

  function buildRecordCard(post, stats, viewerUserId) {
    var expired = isPostTimeExpired(post.expires_at);
    var statusClass = expired ? 'done' : 'ing';
    var statusText = getRemainingTime(post.expires_at);
    var title = post.title || post.option_a_name || '제목 없음';
    var actionBtns = buildCardActionButtonsHtml(post, title, {
      includeEdit: true,
      includeShare: true,
    });

    return (
      '<div class="record-card" data-id="' +
      escapeHtml(post.id) +
      '" role="button" tabindex="0" aria-label="' +
      escapeHtml(title) +
      '">' +
      '<div class="card-row-meta">' +
      '<span class="card-cat">' +
      escapeHtml(categoryLabel(post.category)) +
      '</span>' +
      '<span class="card-meta-sep">|</span>' +
      '<span class="status-badge ' +
      statusClass +
      '">' +
      escapeHtml(statusText) +
      '</span>' +
      '<div class="card-row-actions">' +
      actionBtns +
      '</div>' +
      '</div>' +
      '<div class="card-title">' +
      escapeHtml(title) +
      '</div>' +
      buildVoteProgressBarHtml(post, stats) +
      buildCardStatsRow(post, stats) +
      '</div>'
    );
  }

  function buildVotedRecordCard(voteRow, stats) {
    var post = voteRow.post;
    var expired = isPostTimeExpired(post.expires_at);
    var statusClass = expired ? 'done' : 'ing';
    var statusText = getRemainingTime(post.expires_at);
    var title = post.title || post.option_a_name || '제목 없음';
    var actionBtns = buildCardActionButtonsHtml(post, title, {
      includeEdit: false,
      includeShare: true,
    });
    var resultHtml = expired
      ? buildVoteProgressBarHtml(post, stats)
      : buildActiveBlindedResultHtml();
    var statsHtml = expired ? buildCardStatsRow(post, stats) : '';

    return (
      '<div class="record-card" data-id="' +
      escapeHtml(post.id) +
      '" role="button" tabindex="0" aria-label="' +
      escapeHtml(title) +
      '">' +
      '<div class="card-row-meta">' +
      '<span class="card-cat">' +
      escapeHtml(categoryLabel(post.category)) +
      '</span>' +
      '<span class="card-meta-sep">|</span>' +
      '<span class="status-badge ' +
      statusClass +
      '">' +
      escapeHtml(statusText) +
      '</span>' +
      '<div class="card-row-actions">' +
      actionBtns +
      '</div>' +
      '</div>' +
      '<div class="card-title">' +
      escapeHtml(title) +
      '</div>' +
      resultHtml +
      statsHtml +
      '</div>'
    );
  }

  function getCommentDisplayText(comment) {
    if (!comment) return '';
    return String(comment.filtered_content || comment.content || '').trim();
  }

  function truncateCommentText(text, maxLen) {
    var value = String(text || '').trim();
    if (value.length <= maxLen) return value;
    return value.slice(0, maxLen) + '…';
  }

  function normalizeCommentRow(row) {
    if (!row || !row.post_id) return null;

    var post = row.posts != null ? row.posts : row.post;
    if (Array.isArray(post)) post = post[0];
    if (!post || !post.id) return null;

    return {
      comment: row,
      post: post,
    };
  }

  function buildCommentRecordCard(row) {
    var comment = row.comment;
    var post = row.post;
    var expired = isPostTimeExpired(post.expires_at);
    var statusClass = expired ? 'done' : 'ing';
    var statusText = getRemainingTime(post.expires_at);
    var title = post.title || post.option_a_name || '제목 없음';
    var preview = truncateCommentText(getCommentDisplayText(comment), 100);

    return (
      '<div class="record-card comment-card" data-id="' +
      escapeHtml(post.id) +
      '" data-comment-id="' +
      escapeHtml(comment.id) +
      '" role="button" tabindex="0" aria-label="' +
      escapeHtml(title) +
      '">' +
      '<div class="card-header">' +
      '<div class="card-header-left">' +
      '<span class="status-badge ' +
      statusClass +
      '">' +
      escapeHtml(statusText) +
      '</span>' +
      '</div>' +
      '<span class="card-date">' +
      escapeHtml(formatCardDate(comment.created_at)) +
      '</span>' +
      '</div>' +
      '<div class="card-title">' +
      escapeHtml(title) +
      '</div>' +
      '<div class="comment-preview">' +
      '<span class="comment-preview-label">💬 내 댓글</span>' +
      escapeHtml(preview || '(내용 없음)') +
      '</div>' +
      '<div class="card-footer-stats">' +
      '<span>' +
      escapeHtml(categoryLabel(post.category)) +
      '</span>' +
      '<span>불판 보러가기 →</span>' +
      '</div>' +
      '</div>'
    );
  }

  function buildCouponCard(coupon) {
    var isUsed = !!coupon.is_used;
    var badgeClass = isUsed ? 'badge-used' : 'badge-unused';
    var badgeText = isUsed ? '사용 완료' : '사용 전';
    var cardClass = isUsed ? 'coupon-card is-used' : 'coupon-card';
    var expiry = formatCouponExpiry(coupon.expires_at);
    var pin = coupon.pin_number || '';

    return (
      '<article class="' +
      cardClass +
      '" data-coupon-id="' +
      escapeHtml(coupon.id) +
      '" data-is-used="' +
      (isUsed ? '1' : '0') +
      '">' +
      '<div class="coupon-card-header">' +
      '<button type="button" class="coupon-status-badge ' +
      badgeClass +
      '" data-toggle-used="1">' +
      escapeHtml(badgeText) +
      '</button>' +
      (expiry
        ? '<span class="coupon-date">' + escapeHtml(expiry) + '</span>'
        : '') +
      '</div>' +
      '<h4 class="coupon-title">' +
      escapeHtml(coupon.title || '쿠폰') +
      '</h4>' +
      '<div class="coupon-pin-row">' +
      '<span class="coupon-pin-value">' +
      escapeHtml(pin || '—') +
      '</span>' +
      '<button type="button" class="btn-coupon-copy" data-pin="' +
      escapeHtml(pin) +
      '">복사</button>' +
      '</div>' +
      '</article>'
    );
  }

  function bindCouponCards(container, userId) {
    if (!container || !userId) return;

    container.querySelectorAll('.coupon-card').forEach(function (card) {
      var couponId = card.dataset.couponId;
      if (!couponId) return;

      var requestToggle = function () {
        var isUsed = card.dataset.isUsed === '1';
        var msg = isUsed
          ? '이 쿠폰을 사용 전 상태로 되돌리시겠습니까?'
          : '이 쿠폰을 사용 완료 처리하시겠습니까?';
        if (!confirm(msg)) return;
        toggleCouponUsed(userId, couponId, isUsed);
      };

      card.addEventListener('click', function (e) {
        if (e.target.closest('.btn-coupon-copy')) return;
        requestToggle();
      });

      var badge = card.querySelector('[data-toggle-used]');
      if (badge) {
        badge.addEventListener('click', function (e) {
          e.stopPropagation();
          requestToggle();
        });
      }
    });

    container.querySelectorAll('.btn-coupon-copy').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        copyPinToClipboard(btn.dataset.pin || '');
      });
    });
  }

  async function toggleCouponUsed(userId, couponId, currentIsUsed) {
    try {
      var sb = getSupabaseClient();
      await ensureAuthenticatedSession(sb);

      var updateResult = await sb
        .from('user_coupons')
        .update({ is_used: !currentIsUsed })
        .eq('id', couponId)
        .eq('user_id', userId)
        .select('id, title, pin_number, is_used, expires_at, created_at')
        .maybeSingle();

      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data) {
        throw new Error('쿠폰을 찾을 수 없거나 권한이 없습니다.');
      }

      await loadSavedCoupons(userId);
    } catch (err) {
      if (String(err.message || err) === 'LOGIN_REQUIRED') {
        if (isOAuthCallback() || window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
          return;
        }
        promptLoginRequired('로그인이 필요합니다.');
        return;
      }
      if (isCouponsPermissionError(err)) {
        alert(
          '쿠폰 수정 권한이 없습니다. Supabase에서 18b_user_coupons_grants_fix.sql 을 실행해 주세요.'
        );
        return;
      }
      handleMypageError(err, '쿠폰 상태 변경에 실패했습니다.');
    }
  }

  function bindRecordCards(container) {
    if (!container) return;
    container.querySelectorAll('.record-card:not(.comment-card)').forEach(function (card) {
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

    container.querySelectorAll('.btn-edit-post').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var postId = btn.dataset.postId;
        if (postId) {
          openPostEditPanel(postId);
        }
      });
    });

    container.querySelectorAll('.btn-share-post').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        e.preventDefault();
        var postId = btn.dataset.postId;
        if (!postId) return;

        btn.disabled = true;
        try {
          await requestPostShare({
            id: postId,
            title: btn.dataset.postTitle || '',
          });
        } finally {
          btn.disabled = false;
        }
      });
    });

    bindCommentRecordCards(container);
  }

  function bindCommentRecordCards(container) {
    if (!container) return;

    container.querySelectorAll('.record-card.comment-card').forEach(function (card) {
      var postId = card.dataset.id;
      var commentId = card.dataset.commentId;
      if (!postId) return;

      function goDetailWithCommentFocus() {
        var url = 'detail.html?id=' + encodeURIComponent(postId);
        if (commentId) {
          url += '#comment-' + encodeURIComponent(commentId);
        }
        window.location.href = url;
      }

      card.addEventListener('click', goDetailWithCommentFocus);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goDetailWithCommentFocus();
        }
      });
    });
  }

  var editPostState = {
    postId: null,
    totalVotes: 0,
    voteFieldsEditable: false,
  };

  var POST_EDIT_DELETE_LOCKED_MSG =
    '투표가 시작된 불판은 삭제할 수 없습니다. 고객센터로 문의해 주세요.';

  function isPostEditDeleteLocked() {
    return (Number(editPostState.totalVotes) || 0) >= 1;
  }

  function notifyPostEditDeleteLocked() {
    alert(POST_EDIT_DELETE_LOCKED_MSG);
  }

  function applyPostEditDeleteState(totalVotes) {
    var locked = (Number(totalVotes) || 0) >= 1;
    var deleteBtn = document.getElementById('btnDeletePost');
    var deleteWrap = document.getElementById('btnDeletePostWrap');

    if (deleteBtn) {
      deleteBtn.disabled = locked;
      deleteBtn.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
    if (deleteWrap) {
      deleteWrap.classList.toggle('is-locked', locked);
      deleteWrap.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
  }

  function bindPostEditDeleteGuard() {
    var deleteWrap = document.getElementById('btnDeletePostWrap');
    if (!deleteWrap || deleteWrap.dataset.boundDeleteGuard) return;
    deleteWrap.dataset.boundDeleteGuard = '1';

    deleteWrap.addEventListener('click', function (e) {
      if (isPostEditDeleteLocked()) {
        e.preventDefault();
        e.stopPropagation();
        notifyPostEditDeleteLocked();
        return;
      }
      deletePost();
    });
  }

  function applyPostEditVoteFieldsState(totalVotes) {
    var locked = (Number(totalVotes) || 0) >= 1;
    var titleEl = document.getElementById('editPostTitle');
    var optAEl = document.getElementById('editPostOptionA');
    var optBEl = document.getElementById('editPostOptionB');
    var noticeEl = document.getElementById('editPostVoteLockNotice');
    var sectionTitleEl = document.getElementById('editPostVoteSectionTitle');

    [titleEl, optAEl, optBEl].forEach(function (el) {
      if (!el) return;
      if (locked) {
        el.readOnly = true;
        el.setAttribute('readonly', '');
        el.classList.remove('post-edit-input');
        el.classList.add('post-edit-readonly');
        el.setAttribute('tabindex', '-1');
      } else {
        el.readOnly = false;
        el.removeAttribute('readonly');
        el.classList.remove('post-edit-readonly');
        el.classList.add('post-edit-input');
        el.removeAttribute('tabindex');
      }
    });

    if (noticeEl) {
      if (locked) noticeEl.removeAttribute('hidden');
      else noticeEl.setAttribute('hidden', '');
    }
    if (sectionTitleEl) {
      sectionTitleEl.textContent = locked
        ? '투표 정보 (수정 불가)'
        : '투표 정보';
    }

    applyPostEditDeleteState(totalVotes);
  }

  async function openPostEditPanel(postId) {
    editPostState = {
      postId: postId,
      totalVotes: 0,
      voteFieldsEditable: false,
    };

    var titleEl = document.getElementById('editPostTitle');
    var optAEl = document.getElementById('editPostOptionA');
    var optBEl = document.getElementById('editPostOptionB');
    var descEl = document.getElementById('editPostDescription');
    var panel = document.getElementById('postEditPanel');

    if (!panel || !titleEl) return;

    try {
      var sb = getSupabaseClient();
      var user = await requireAuth();
      if (!user) return;

      var result = await sb
        .from('posts')
        .select('id, author_id, title, option_a_name, option_b_name, description')
        .eq('id', postId)
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) {
        alert('불판 정보를 찾을 수 없습니다.');
        return;
      }

      if (result.data.author_id !== user.id) {
        alert('본인이 작성한 불판만 수정할 수 있습니다.');
        return;
      }

      var voteMap = await fetchVoteStatsMap(sb, [postId]);
      var stats = voteMap.get(postId) || { votesA: 0, votesB: 0, total: 0 };
      var totalVotes = Number(stats.total) || 0;

      editPostState.totalVotes = totalVotes;
      editPostState.voteFieldsEditable = totalVotes === 0;

      var post = result.data;
      titleEl.value = post.title || '';
      optAEl.value = post.option_a_name || '';
      optBEl.value = post.option_b_name || '';
      if (descEl) descEl.value = post.description || '';

      applyPostEditVoteFieldsState(totalVotes);

      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    } catch (err) {
      console.error('[P!CKLE Mypage] 수정 패널 로드 실패', err);
      alert(
        '불판 정보를 불러오지 못했습니다. ' + (err.message || String(err))
      );
    }
  }

  function closePostEditPanel() {
    var panel = document.getElementById('postEditPanel');
    if (panel) {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    editPostState = { postId: null, totalVotes: 0, voteFieldsEditable: false };
  }

  function validateEditableVoteFields(title, optionA, optionB) {
    if (!title) {
      alert('불판 제목을 입력해주세요!');
      return false;
    }
    if (title.length < 2) {
      alert('불판 제목은 2자 이상 입력해 주세요.');
      return false;
    }
    if (!optionA || !optionB) {
      alert('A/B 선택지 내용을 완성해주세요!');
      return false;
    }
    if (optionA === optionB) {
      alert('A와 B 선택지는 서로 달라야 합니다!');
      return false;
    }
    return true;
  }

  async function updatePost() {
    var postId = editPostState.postId;
    if (!postId) return;

    var titleEl = document.getElementById('editPostTitle');
    var optAEl = document.getElementById('editPostOptionA');
    var optBEl = document.getElementById('editPostOptionB');
    var descEl = document.getElementById('editPostDescription');
    var saveBtn = document.getElementById('btnSavePostEdit');
    var description = descEl ? descEl.value.trim() : '';

    var sb = getSupabaseClient();
    var user = await requireAuth();
    if (!user) return;

    var payload = { description: description };

    if (editPostState.voteFieldsEditable) {
      var title = titleEl ? titleEl.value.trim() : '';
      var optionA = optAEl ? optAEl.value.trim() : '';
      var optionB = optBEl ? optBEl.value.trim() : '';
      if (!validateEditableVoteFields(title, optionA, optionB)) return;
      payload.title = title;
      payload.option_a_name = optionA;
      payload.option_b_name = optionB;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중…';
    }

    try {
      var updateResult = await sb
        .from('posts')
        .update(payload)
        .eq('id', postId)
        .eq('author_id', user.id)
        .select('id')
        .maybeSingle();

      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data) {
        throw new Error('수정 권한이 없거나 불판을 찾을 수 없습니다.');
      }

      alert('🔥 불판 내용이 성공적으로 수정되었습니다.');
      closePostEditPanel();

      if (currentUser && currentUser.id) {
        await loadCreatedPosts(currentUser.id);
      }
    } catch (err) {
      console.error('[P!CKLE Mypage] 불판 수정 실패', err);
      var msg = String(err.message || err).toLowerCase();
      if (msg.indexOf('description') !== -1) {
        alert(
          'DB 컬럼이 누락되었습니다. Supabase에서 description 마이그레이션을 실행해 주세요.'
        );
      } else {
        alert('불판 수정에 실패했습니다. ' + (err.message || String(err)));
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '수정 완료';
      }
    }
  }

  async function deletePost() {
    var postId = editPostState.postId;
    if (!postId) return;

    if (isPostEditDeleteLocked()) {
      notifyPostEditDeleteLocked();
      return;
    }

    var titleEl = document.getElementById('editPostTitle');
    var titlePreview = titleEl && titleEl.value.trim()
      ? titleEl.value.trim()
      : '이 불판';

    if (
      !confirm(
        '정말로 "' +
          titlePreview +
          '" 불판을 삭제하시겠습니까?\n삭제하면 복구할 수 없습니다.'
      )
    ) {
      return;
    }

    var sb = getSupabaseClient();
    var user = await requireAuth();
    if (!user) return;

    var deleteBtn = document.getElementById('btnDeletePost');
    var saveBtn = document.getElementById('btnSavePostEdit');
    if (deleteBtn) deleteBtn.disabled = true;
    if (saveBtn) saveBtn.disabled = true;

    try {
      var deleteResult = await sb
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('author_id', user.id)
        .select('id')
        .maybeSingle();

      if (deleteResult.error) throw deleteResult.error;
      if (!deleteResult.data) {
        throw new Error('삭제 권한이 없거나 불판을 찾을 수 없습니다.');
      }

      alert('불판이 삭제되었습니다.');
      closePostEditPanel();

      if (currentUser && currentUser.id) {
        await loadCreatedPosts(currentUser.id);
      }
    } catch (err) {
      console.error('[P!CKLE Mypage] 불판 삭제 실패', err);
      alert('불판 삭제에 실패했습니다. ' + (err.message || String(err)));
    } finally {
      if (deleteBtn) deleteBtn.disabled = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  window.openPostEditPanel = openPostEditPanel;
  window.closePostEditPanel = closePostEditPanel;
  window.updatePost = updatePost;
  window.deletePost = deletePost;

  async function loadCreatedPosts(userId) {
    var container = document.getElementById('createdArea');
    if (!container) return;

    try {
      var sb = getSupabaseClient();
      var authResult = await sb.auth.getUser();
      var viewerUserId =
        (authResult.data && authResult.data.user && authResult.data.user.id) ||
        userId ||
        null;

      var result = await sb
        .from('posts')
        .select(
          'id, title, category, option_a_name, option_b_name, author_id, visibility_status, created_at, expires_at, vote_count, comment_count'
        )
        .eq('author_id', viewerUserId || userId)
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
          return buildRecordCard(post, stats, viewerUserId);
        })
        .join('');

      bindRecordCards(container);
    } catch (err) {
      console.error('[P!CKLE Mypage] 지핀 불판 로드 실패', err);
      container.innerHTML =
        '<div class="empty-state" id="createdEmpty">불판 목록을 불러오지 못했습니다.</div>';
    }
  }

  async function loadVotedPosts(userId) {
    var container = document.getElementById('votedArea');
    if (!container) return;

    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('votes')
        .select(
          'id, choice, created_at, post_id, posts:post_id ( id, title, category, option_a_name, option_b_name, expires_at, created_at, visibility_status, vote_count, comment_count )'
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (result.error) throw result.error;

      var voteRows = (result.data || [])
        .map(normalizeVotePost)
        .filter(function (row) {
          return row !== null;
        });

      if (!voteRows.length) {
        container.innerHTML =
          '<div class="empty-state" id="votedEmpty">아직 참여한 불판이 없습니다.</div>';
        return;
      }

      var postIds = voteRows.map(function (row) {
        return row.post.id;
      });
      var voteMap = await fetchVoteStatsMap(sb, postIds);

      container.innerHTML = voteRows
        .map(function (row) {
          var stats = voteMap.get(row.post.id);
          return buildVotedRecordCard(row, stats);
        })
        .join('');

      bindRecordCards(container);
    } catch (err) {
      console.error('[P!CKLE Mypage] 참전 기록 로드 실패', err);
      container.innerHTML =
        '<div class="empty-state" id="votedEmpty">참여 기록을 불러오지 못했습니다.</div>';
    }
  }

  async function loadCommentedPosts(userId) {
    var container = document.getElementById('commentedArea');
    if (!container) return;

    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('comments')
        .select(
          'id, content, filtered_content, created_at, post_id, visibility_status, posts:post_id ( id, title, category, option_a_name, option_b_name, expires_at, created_at, visibility_status )'
        )
        .eq('user_id', userId)
        .eq('visibility_status', 'visible')
        .order('created_at', { ascending: false });

      if (result.error) throw result.error;

      var rows = (result.data || [])
        .map(normalizeCommentRow)
        .filter(function (row) {
          return row !== null;
        });

      if (!rows.length) {
        container.innerHTML =
          '<div class="empty-state" id="commentedEmpty">아직 작성한 댓글이 없습니다.</div>';
        return;
      }

      container.innerHTML = rows.map(buildCommentRecordCard).join('');
      bindRecordCards(container);
    } catch (err) {
      console.error('[P!CKLE Mypage] 쓴 댓글 로드 실패', err);
      container.innerHTML =
        '<div class="empty-state" id="commentedEmpty">댓글 목록을 불러오지 못했습니다.</div>';
    }
  }

  async function loadSavedCoupons(userId) {
    if (savedCouponsInflight) {
      return savedCouponsInflight;
    }

    savedCouponsInflight = loadSavedCouponsInner(userId).finally(function () {
      savedCouponsInflight = null;
    });
    return savedCouponsInflight;
  }

  async function loadSavedCouponsInner(userId) {
    var container = document.getElementById('savedArea');
    if (!container || !userId) return;

    var loadSeq = ++savedCouponsLoadSeq;
    container.innerHTML =
      '<div class="empty-state" id="savedLoading">보관함 불러오는 중…</div>';

    try {
      var sb = getSupabaseClient();
      var user = await ensureAuthenticatedSession(sb);
      userId = user.id;

      var fetched = await fetchUserCoupons(sb, userId);
      if (loadSeq !== savedCouponsLoadSeq) return;

      if (fetched.error) throw fetched.error;

      var coupons = (fetched.rows || [])
        .map(normalizeCouponRow)
        .filter(function (row) {
          return row !== null;
        });

      if (loadSeq !== savedCouponsLoadSeq) return;

      if (!coupons.length) {
        container.innerHTML =
          '<div class="empty-state" id="savedEmpty">보관함이 비어 있습니다.</div>';
        container.dataset.loadState = 'empty';
        return;
      }

      container.innerHTML = coupons
        .map(function (coupon) {
          return buildCouponCard(coupon);
        })
        .join('');

      container.dataset.loadState = 'ready';
      bindCouponCards(container, userId);
    } catch (err) {
      if (loadSeq !== savedCouponsLoadSeq) return;
      container.dataset.loadState = 'error';
      if (String(err.message || err) === 'LOGIN_REQUIRED' || isAuthRelatedError(err)) {
        if (window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
          container.innerHTML =
            '<div class="empty-state" id="savedEmpty">보관함 불러오는 중…</div>';
          return;
        }
        container.innerHTML =
          '<div class="empty-state" id="savedEmpty">로그인이 필요합니다.</div>';
        return;
      }
      renderSavedCouponsError(container, err);
    }
  }

  var mypageTabLoaded = {
    created: false,
    voted: false,
    commented: false,
    saved: false,
  };

  async function onTabSwitch(tabName) {
    if (!currentUser || !currentUser.id) return;

    if (tabName === 'voted' && !mypageTabLoaded.voted) {
      mypageTabLoaded.voted = true;
      await loadVotedPosts(currentUser.id);
    } else if (tabName === 'commented' && !mypageTabLoaded.commented) {
      mypageTabLoaded.commented = true;
      await loadCommentedPosts(currentUser.id);
    } else if (tabName === 'saved') {
      await loadSavedCoupons(currentUser.id);
      mypageTabLoaded.saved = true;
    }
  }

  function formatPenaltyLogDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function isRestrictionActive(userData) {
    return Boolean(
      userData &&
        userData.restricted_until &&
        new Date(userData.restricted_until) > new Date()
    );
  }

  function formatPanelAccountStatus(userData) {
    if (userData && userData.is_banned) {
      return { text: '[영구 차단]', color: 'var(--alert-red)' };
    }
    if (isRestrictionActive(userData)) {
      var end = new Date(userData.restricted_until);
      return {
        text:
          '[' +
          pad2(end.getMonth() + 1) +
          '월 ' +
          pad2(end.getDate()) +
          '일까지 정지]',
        color: 'var(--alert-red)',
      };
    }
    return { text: '[정상 활동 가능]', color: 'var(--neon-green)' };
  }

  function updateMenuPenaltyStatus(points, userData) {
    var menuEl = document.getElementById('menuPenaltyStatus');
    if (!menuEl) return;

    var label = '[정상]';
    var bg = 'rgba(57,255,20,0.15)';
    var color = 'var(--neon-green)';

    if (userData && userData.is_banned) {
      label = '[차단]';
      bg = 'rgba(255,51,51,0.2)';
      color = 'var(--alert-red)';
    } else if (isRestrictionActive(userData) || points >= 30) {
      label = '[제한]';
      bg = 'rgba(255,51,51,0.2)';
      color = 'var(--alert-red)';
    } else if (points >= 10) {
      label = '[경고]';
      bg = 'rgba(255,204,0,0.2)';
      color = 'var(--theme-gold)';
    }

    menuEl.textContent = label;
    menuEl.style.background = bg;
    menuEl.style.color = color;
  }

  async function refreshNotiCountBadge(userId) {
    var badgeEl = document.getElementById('notiCountBadge');
    if (!badgeEl) return 0;

    if (!userId) {
      badgeEl.textContent = '';
      badgeEl.classList.remove('is-visible');
      return 0;
    }

    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('penalty_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (result.error) {
        console.warn('[P!CKLE Mypage] noti badge count failed', result.error);
        badgeEl.textContent = '';
        badgeEl.classList.remove('is-visible');
        return 0;
      }

      var count = result.count || 0;
      if (count > 0) {
        badgeEl.textContent = count > 99 ? '99+' : String(count);
        badgeEl.classList.add('is-visible');
        var bell = badgeEl.closest('.noti-bell');
        if (bell) {
          bell.setAttribute('aria-label', '읽지 않은 제재 알림 ' + count + '건');
        }
      } else {
        badgeEl.textContent = '';
        badgeEl.classList.remove('is-visible');
        var bellClear = badgeEl.closest('.noti-bell');
        if (bellClear) {
          bellClear.setAttribute('aria-label', '알림');
        }
      }

      return count;
    } catch (err) {
      console.warn('[P!CKLE Mypage] noti badge refresh failed', err);
      badgeEl.textContent = '';
      badgeEl.classList.remove('is-visible');
      return 0;
    }
  }

  function renderPenaltyDashboard(points, userData) {
    var pointsEl = document.getElementById('myPenaltyPoints');
    if (pointsEl) {
      pointsEl.innerHTML = points + ' <span style="font-size:1rem;">점</span>';
    }

    var barFillEl = document.getElementById('myPenaltyBarFill');
    if (barFillEl) {
      barFillEl.style.width = Math.min(points, 100) + '%';
    }

    var statusTextEl = document.getElementById('myAccountStatusText');
    if (statusTextEl) {
      var panelStatus = formatPanelAccountStatus(userData);
      statusTextEl.innerText = panelStatus.text;
      statusTextEl.style.color = panelStatus.color;
    }

    updateMenuPenaltyStatus(points, userData);
  }

  function renderPenaltyHistory(logHistory) {
    var listBody = document.getElementById('myPenaltyListBody');
    if (!listBody) return;

    if (!logHistory || logHistory.length === 0) {
      listBody.innerHTML =
        '<div style="padding:25px; color:#71717a; text-align:center; font-weight:700;">제재 내역이 없는 클린 신용 등급 계정입니다. 😊</div>';
      return;
    }

    listBody.innerHTML = '';
    logHistory.forEach(function (log) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.style.marginBottom = '10px';

      var pointsAdded = Number(log.points_added) || 0;
      var badgeStyle =
        pointsAdded === 0
          ? 'color:var(--neon-green); background:rgba(57,255,20,0.1);'
          : '';

      item.innerHTML =
        '<div>' +
        '<div class="hi-title">' +
        escapeHtml(log.reason || log.penalty_type || '제재') +
        '</div>' +
        '<div class="hi-date">' +
        escapeHtml(formatPenaltyLogDate(log.created_at)) +
        '</div>' +
        '</div>' +
        '<span class="hi-badge" style="' +
        badgeStyle +
        '">' +
        escapeHtml(log.penalty_type || '제재') +
        ' (+' +
        pointsAdded +
        '점)</span>';

      listBody.appendChild(item);
    });
  }

  async function markPenaltyLogsRead(sb, userId) {
    if (!sb || !userId) return;

    var markReadResult = await sb
      .from('penalty_logs')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (markReadResult.error) {
      console.warn('[P!CKLE Mypage] penalty is_read update failed', markReadResult.error);
    }
  }

  async function syncPenaltyDashboard(options) {
    options = options || {};
    var user = currentUser;
    if (!user || !user.id) return;

    try {
      var sb = getSupabaseClient();

      if (options.markPenaltyRead) {
        await markPenaltyLogsRead(sb, user.id);
      }

      var userResult = await sb
        .from('users')
        .select('penalty_points, restricted_until, is_banned')
        .eq('id', user.id)
        .single();

      if (userResult.error) {
        console.warn('[P!CKLE Mypage] penalty user fetch failed', userResult.error);
      } else if (userResult.data) {
        var points = Number(userResult.data.penalty_points) || 0;
        renderPenaltyDashboard(points, userResult.data);
      }

      var historyResult = await sb
        .from('penalty_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (historyResult.error) {
        console.warn('[P!CKLE Mypage] penalty history fetch failed', historyResult.error);
        var listBody = document.getElementById('myPenaltyListBody');
        if (listBody) {
          listBody.innerHTML =
            '<div style="padding:25px; color:#71717a; text-align:center; font-weight:700;">제재 내역을 불러오지 못했습니다.</div>';
        }
      } else {
        renderPenaltyHistory(historyResult.data || []);
      }
    } catch (err) {
      console.error('[P!CKLE Mypage] penalty sync failed', err);
    } finally {
      await refreshNotiCountBadge(user.id);
    }
  }

  function bindStarScoreRefreshListener() {
    if (window.__pickleMypageStarScoreListenerBound) return;
    window.__pickleMypageStarScoreListenerBound = true;

    window.addEventListener('pickle:star-score-updated', function (ev) {
      var uid = ev && ev.detail && ev.detail.userId;
      if (!currentUser || !uid || String(currentUser.id) !== String(uid)) return;

      fetchCurrentUserRankingPoints(currentUser)
        .then(function (pts) {
          currentUserRankingPoints = pts;
          updateLevelExpUI(pts);
        })
        .catch(function (err) {
          console.warn('[P!CKLE Mypage] star score refresh failed', err);
        });
    });
  }

  async function initMypage() {
    try {
      var b = window.PickleSupabaseBootstrap;
      if (!b || !b.isReady()) {
        console.warn('[P!CKLE Mypage]', b ? b.getErrorMessage() : 'bootstrap missing');
        if (isOAuthCallback() || window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
          return;
        }
        promptLoginRequired('로그인이 필요한 페이지입니다.');
        return;
      }

      if (!isOAuthCallback() && !window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
        if (window.PickleAuth && window.PickleAuth.hasLocalSessionHint && !window.PickleAuth.hasLocalSessionHint()) {
          promptLoginRequired('로그인이 필요한 페이지입니다.');
          return;
        }
      }

      var user = await requireAuth();
      if (!user) {
        if (isOAuthCallback() || window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
          return;
        }
        return;
      }

      await loadProfileDbRow(user.id);

      if (window.PickleCategories && window.PickleCategories.load) {
        await window.PickleCategories.load();
      }

      await renderProfile(user);
      bindProfileEditOpen();
      bindProfileAvatarClick();
      syncLevelGuideList();
      bindLevelGuide();
      bindStarScoreRefreshListener();
      bindProfileSelectFilledState();
      bindLogout();
      bindWithdraw();
      bindPostEditDeleteGuard();
      mypageTabLoaded.created = true;
      await Promise.all([
        loadCreatedPosts(user.id),
        loadVotedPosts(user.id),
      ]);
      mypageTabLoaded.voted = true;
      await syncPenaltyDashboard();
    } catch (err) {
      handleMypageError(err, '마이페이지를 불러오지 못했습니다.');
    }
  }

  window.PickleMypage = {
    init: initMypage,
    getSupabaseClient: getSupabaseClient,
    renderProfile: renderProfile,
    fillProfileEditForm: fillProfileEditForm,
    saveProfile: saveProfile,
    loadCreatedPosts: loadCreatedPosts,
    loadVotedPosts: loadVotedPosts,
    loadCommentedPosts: loadCommentedPosts,
    loadSavedCoupons: loadSavedCoupons,
    onTabSwitch: onTabSwitch,
    syncPenaltyDashboard: syncPenaltyDashboard,
    refreshNotiCountBadge: refreshNotiCountBadge,
    copyPinToClipboard: copyPinToClipboard,
    openPostEditPanel: openPostEditPanel,
    closePostEditPanel: closePostEditPanel,
    updatePost: updatePost,
    getCurrentUser: function () {
      return currentUser;
    },
  };

  window.saveProfile = saveProfile;

  window.addEventListener('pickle-auth-changed', function (ev) {
    var session = ev.detail && ev.detail.session;
    if (!session || !session.user || currentUser) return;
    if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
      window.PickleAuth.ensureAuthenticated({ forceRefresh: true })
        .then(function (auth) {
          if (auth && auth.user) {
            return renderProfile(auth.user).then(function () {
              return syncPenaltyDashboard();
            });
          }
        })
        .catch(function (err) {
          console.warn('[P!CKLE Mypage] OAuth 후 프로필 렌더', err);
        });
      return;
    }
    renderProfile(session.user)
      .then(function () {
        return syncPenaltyDashboard();
      })
      .catch(function (err) {
        console.warn('[P!CKLE Mypage] OAuth 후 프로필 렌더', err);
      });
  });

  window.addEventListener('pickle-auth-ready', function (ev) {
    if (currentUser || !ev.detail || !ev.detail.user) return;
    renderProfile(ev.detail.user)
      .then(function () {
        return syncPenaltyDashboard();
      })
      .catch(function (err) {
        console.warn('[P!CKLE Mypage] auth-ready 프로필 렌더', err);
      });
  });

  document.addEventListener('pickle:penalty-log-insert', function () {
    if (!currentUser || !currentUser.id) return;
    syncPenaltyDashboard();
    refreshNotiCountBadge(currentUser.id);
  });

  document.addEventListener('DOMContentLoaded', function () {
    initMypage();
  });
})();
