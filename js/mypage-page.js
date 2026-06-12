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

  function buildGradeBadgeHtmlFromPoints(points) {
    if (window.PickleProfile && window.PickleProfile.buildLevelBadgeFromPoints) {
      return window.PickleProfile.buildLevelBadgeFromPoints(points);
    }
    return '<span class="grade-badge">Lv.1</span>';
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

  async function renderProfile(user) {
    currentUser = user;
    var name = getDisplayName(user);
    currentUserRankingPoints = await fetchCurrentUserRankingPoints(user);

    var nickEl = document.getElementById('mainNickname');
    if (nickEl) {
      nickEl.innerHTML =
        escapeHtml(name) + ' ' + buildGradeBadgeHtmlFromPoints(currentUserRankingPoints);
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
    if (window.PickleCategories && window.PickleCategories.resolveCategoryLabel) {
      var label = window.PickleCategories.resolveCategoryLabel(category);
      if (label) return label;
    }
    if (!category) return '🔥 불판';
    return category;
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
    var session = await waitForSupabaseSession(sb);
    var userResult = await sb.auth.getUser();
    if (userResult.error) throw userResult.error;
    if (!userResult.data || !userResult.data.user) {
      throw new Error('LOGIN_REQUIRED');
    }
    return userResult.data.user;
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

  function buildRecordCard(post, stats) {
    var visible = post.visibility_status === 'visible';
    var expired = isPostTimeExpired(post.expires_at);
    var statusClass = expired ? 'done' : 'ing';
    var statusText = getRemainingTime(post.expires_at);
    var total = stats && stats.total ? stats.total : 0;
    var title = post.title || post.option_a_name || '제목 없음';
    var editBtn = visible
      ? '<button type="button" class="btn-edit-post ing" data-post-id="' +
        escapeHtml(post.id) +
        '" aria-label="불판 수정">수정</button>'
      : '';

    return (
      '<div class="record-card" data-id="' +
      escapeHtml(post.id) +
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
      editBtn +
      '</div>' +
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

  function buildVotedRecordCard(voteRow, stats) {
    var post = voteRow.post;
    var choice = voteRow.choice;
    var expired = isPostTimeExpired(post.expires_at);
    var statusClass = expired ? 'done' : 'ing';
    var statusText = getRemainingTime(post.expires_at);
    var total = stats && stats.total ? stats.total : 0;
    var title = post.title || post.option_a_name || '제목 없음';
    var outcome = formatVoteOutcome(post, stats, choice);
    var pickSideClass = choice === 'B' ? 'pick-b' : 'pick-a';

    return (
      '<div class="record-card" data-id="' +
      escapeHtml(post.id) +
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
      escapeHtml(formatCardDate(voteRow.votedAt || post.created_at)) +
      '</span>' +
      '</div>' +
      '<div class="card-title">' +
      escapeHtml(title) +
      '</div>' +
      '<div class="vote-result-box">' +
      '<div class="my-pick-info">내 픽: <span class="' +
      pickSideClass +
      '">' +
      escapeHtml(formatMyPickLabel(post, choice)) +
      '</span></div>' +
      (outcome
        ? '<div class="result-win">' + escapeHtml(outcome) + '</div>'
        : '<div class="result-win" style="color:var(--neon-blue);font-size:0.9rem;">집계 중…</div>') +
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
      console.error('[P!CKLE Mypage] 쿠폰 상태 변경 실패', err);
      if (String(err.message || err) === 'LOGIN_REQUIRED') {
        alert('로그인이 필요합니다.');
        redirectToLogin();
        return;
      }
      if (isCouponsPermissionError(err)) {
        alert(
          '쿠폰 수정 권한이 없습니다. Supabase에서 18b_user_coupons_grants_fix.sql 을 실행해 주세요.'
        );
        return;
      }
      alert('쿠폰 상태 변경에 실패했습니다. ' + getSupabaseErrorMessage(err));
    }
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

    container.querySelectorAll('.btn-edit-post').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var postId = btn.dataset.postId;
        if (postId) {
          openPostEditPanel(postId);
        }
      });
    });
  }

  var editPostState = {
    postId: null,
    thumbFile: null,
    existingThumbUrl: null,
  };

  var THUMB_MAX_BYTES = 5 * 1024 * 1024;

  // TODO: 투표 공정성을 위해 제목과 A/B 선택지는 수정 불가(Read-only) 처리
  function renderEditThumbBox(urlOrFile) {
    var box = document.getElementById('editPostThumbBox');
    if (!box) return;

    if (!urlOrFile) {
      box.classList.remove('uploaded');
      box.innerHTML =
        '<div class="icon-plus">🖼️</div>' +
        '<div class="upload-txt">썸네일 이미지 첨부</div>';
      return;
    }

    if (typeof urlOrFile === 'string') {
      box.classList.add('uploaded');
      box.innerHTML =
        '<img src="' + escapeHtml(urlOrFile) + '" alt="썸네일 미리보기">';
      return;
    }

    if (urlOrFile instanceof File) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        box.classList.add('uploaded');
        box.innerHTML =
          '<img src="' + ev.target.result + '" alt="새 썸네일 미리보기">';
      };
      reader.readAsDataURL(urlOrFile);
    }
  }

  function bindPostEditThumbInput() {
    var thumbInput = document.getElementById('editPostThumbInput');
    var box = document.getElementById('editPostThumbBox');
    if (!thumbInput || !box) return;

    box.onclick = function () {
      thumbInput.click();
    };
    box.onkeydown = function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        thumbInput.click();
      }
    };

    thumbInput.onchange = function () {
      var file = thumbInput.files && thumbInput.files[0];
      if (!file) return;

      if (file.size > THUMB_MAX_BYTES) {
        alert('썸네일 용량이 너무 큽니다. 5MB 이하의 파일을 올려주세요.');
        thumbInput.value = '';
        return;
      }

      editPostState.thumbFile = file;
      renderEditThumbBox(file);
    };
  }

  async function openPostEditPanel(postId) {
    editPostState = {
      postId: postId,
      thumbFile: null,
      existingThumbUrl: null,
    };

    var titleEl = document.getElementById('editPostTitleReadonly');
    var optAEl = document.getElementById('editPostOptionAReadonly');
    var optBEl = document.getElementById('editPostOptionBReadonly');
    var descEl = document.getElementById('editPostDescription');
    var thumbInput = document.getElementById('editPostThumbInput');
    var panel = document.getElementById('postEditPanel');

    if (!panel || !titleEl) return;

    try {
      var sb = getSupabaseClient();
      var authResult = await sb.auth.getUser();
      if (authResult.error || !authResult.data?.user) {
        alert('로그인이 필요합니다.');
        redirectToLogin();
        return;
      }

      var result = await sb
        .from('posts')
        .select(
          'id, author_id, title, option_a_name, option_b_name, description, thumbnail_url'
        )
        .eq('id', postId)
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) {
        alert('불판 정보를 찾을 수 없습니다.');
        return;
      }

      if (result.data.author_id !== authResult.data.user.id) {
        alert('본인이 작성한 불판만 수정할 수 있습니다.');
        return;
      }

      var post = result.data;
      titleEl.value = post.title || '';
      optAEl.value = post.option_a_name || '';
      optBEl.value = post.option_b_name || '';
      if (descEl) descEl.value = post.description || '';

      editPostState.existingThumbUrl = post.thumbnail_url || null;
      if (thumbInput) thumbInput.value = '';
      renderEditThumbBox(post.thumbnail_url || null);
      bindPostEditThumbInput();

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
    editPostState = { postId: null, thumbFile: null, existingThumbUrl: null };
  }

  async function updatePost() {
    var postId = editPostState.postId;
    if (!postId) return;

    var descEl = document.getElementById('editPostDescription');
    var saveBtn = document.getElementById('btnSavePostEdit');
    var description = descEl ? descEl.value.trim() : '';

    var sb = getSupabaseClient();
    var authResult = await sb.auth.getUser();

    if (authResult.error || !authResult.data?.user) {
      alert('로그인이 필요합니다.');
      redirectToLogin();
      return;
    }

    var user = authResult.data.user;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중…';
    }

    try {
      var finalThumbnailUrl = editPostState.existingThumbUrl || null;

      var fileInput = document.getElementById('editPostThumbInput');
      var thumbFile =
        (fileInput && fileInput.files && fileInput.files[0]) ||
        editPostState.thumbFile ||
        null;

      if (thumbFile) {
        var fileExt = thumbFile.name.split('.').pop();
        var fileName = 'thumb_update_' + Date.now() + '.' + fileExt;

        var uploadResult = await sb.storage
          .from('post_media')
          .upload('thumbnails/' + fileName, thumbFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: thumbFile.type || undefined,
          });

        if (uploadResult.error) {
          alert('썸네일 수정 업로드 실패: ' + uploadResult.error.message);
          return;
        }

        var publicUrlResult = sb.storage
          .from('post_media')
          .getPublicUrl('thumbnails/' + fileName);

        finalThumbnailUrl = publicUrlResult.data.publicUrl;
      }

      var updateResult = await sb
        .from('posts')
        .update({
          description: description,
          thumbnail_url: finalThumbnailUrl,
        })
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
      if (msg.indexOf('description') !== -1 || msg.indexOf('thumbnail_url') !== -1) {
        alert(
          'DB 컬럼이 누락되었습니다. Supabase에서 description·thumbnail_url 마이그레이션을 실행해 주세요.'
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

  window.openPostEditPanel = openPostEditPanel;
  window.closePostEditPanel = closePostEditPanel;
  window.updatePost = updatePost;

  async function loadCreatedPosts(userId) {
    var container = document.getElementById('createdArea');
    if (!container) return;

    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('posts')
        .select(
          'id, title, category, option_a_name, option_b_name, visibility_status, created_at, expires_at'
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

  async function loadVotedPosts(userId) {
    var container = document.getElementById('votedArea');
    if (!container) return;

    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('votes')
        .select(
          'id, choice, created_at, post_id, posts:post_id ( id, title, category, option_a_name, option_b_name, expires_at, created_at, visibility_status )'
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
          '<div class="empty-state" id="votedEmpty">아직 참전한 불판이 없습니다.</div>';
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
        '<div class="empty-state" id="votedEmpty">참전 기록을 불러오지 못했습니다.</div>';
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
      console.error('[P!CKLE Mypage] 보관함 로드 실패', err);
      container.dataset.loadState = 'error';
      if (String(err.message || err) === 'LOGIN_REQUIRED') {
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
    saved: false,
  };

  async function onTabSwitch(tabName) {
    if (!currentUser || !currentUser.id) return;

    if (tabName === 'voted' && !mypageTabLoaded.voted) {
      mypageTabLoaded.voted = true;
      await loadVotedPosts(currentUser.id);
    } else if (tabName === 'saved') {
      await loadSavedCoupons(currentUser.id);
      mypageTabLoaded.saved = true;
    }
  }

  async function initMypage() {
    try {
      if (window.PickleCategories && window.PickleCategories.load) {
        await window.PickleCategories.load();
      }

      var b = window.PickleSupabaseBootstrap;
      if (!b || !b.isReady()) {
        console.warn('[P!CKLE Mypage]', b ? b.getErrorMessage() : 'bootstrap missing');
        alert('로그인이 필요한 페이지입니다.');
        redirectToLogin();
        return;
      }

      var user = await requireAuth();
      if (!user) return;

      await renderProfile(user);
      bindProfileEditOpen();
      bindLogout();
      bindPostEditThumbInput();
      mypageTabLoaded.created = true;
      await Promise.all([
        loadCreatedPosts(user.id),
        loadVotedPosts(user.id),
      ]);
      mypageTabLoaded.voted = true;
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
    loadVotedPosts: loadVotedPosts,
    loadSavedCoupons: loadSavedCoupons,
    onTabSwitch: onTabSwitch,
    copyPinToClipboard: copyPinToClipboard,
    openPostEditPanel: openPostEditPanel,
    closePostEditPanel: closePostEditPanel,
    updatePost: updatePost,
    getCurrentUser: function () {
      return currentUser;
    },
  };

  window.saveProfile = saveProfile;

  document.addEventListener('DOMContentLoaded', initMypage);
})();
