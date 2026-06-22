/**
 * P!CKLE 메인 피드 — posts 목록 로드·렌더·투표
 */
(function () {
  'use strict';

  const CATEGORY_LABELS = {
    hot: '🔥 실시간 핫',
    brand: '🤝 브랜드 픽',
    love: '💔 연애/썸',
    brain: '🤯 뇌정지',
    ugc: '✨ UGC',
    other: '기타',
  };

  let activeCategory = 'all';
  let postsCache = [];
  let userVotesMap = new Map();

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function calcPercent(votesA, votesB) {
    const total = votesA + votesB;
    if (total === 0) {
      return { a: 50, b: 50, total: 0 };
    }
    const a = Math.round((votesA / total) * 100);
    return { a, b: 100 - a, total };
  }

  function goToLoginForVote() {
    const isOAuthCallback =
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('type=recovery');
    if (isOAuthCallback || window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
      return;
    }
    if (window.PickleAuth?.goToLogin) {
      window.PickleAuth.goToLogin({ redirect: 'index.html', from: 'vote' });
      return;
    }
    alert('투표하려면 로그인이 필요합니다');
    window.location.href = 'login.html?redirect=index.html&from=vote';
  }

  async function fetchUserVotes(postIds) {
    userVotesMap = new Map();
    if (!postIds.length) return;

    let user = null;
    if (window.PickleAuth?.ensureAuthenticated) {
      const auth = await window.PickleAuth.ensureAuthenticated({ skipProfile: true });
      user = auth?.user ?? null;
    } else if (window.PickleAuth?.resolveAuthUser) {
      user = await window.PickleAuth.resolveAuthUser();
    }
    if (!user?.id) return;

    const sb = window.PickleSupabase.getClient();
    const userId = user.id;
    const { data, error } = await sb
      .from('votes')
      .select('post_id, choice')
      .eq('user_id', userId)
      .in('post_id', postIds);

    if (error) {
      console.warn('[P!CKLE Feed] 내 투표 조회 실패', error);
      return;
    }

    (data || []).forEach((row) => {
      userVotesMap.set(row.post_id, row.choice);
    });
  }

  async function fetchPosts() {
    const sb = window.PickleSupabase.getClient();

    const { data: posts, error } = await sb
      .from('posts')
      .select(
        `
        id,
        title,
        category,
        option_a_name,
        option_b_name,
        option_a_image_url,
        option_b_image_url,
        media_type,
        media_url_1,
        media_url_2,
        layout_style,
        is_sponsor,
        visibility_status,
        created_at,
        users:author_id ( nickname )
      `
      )
      .eq('visibility_status', 'visible')
      .eq('is_sponsor', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!posts?.length) return [];

    const ids = posts.map((p) => p.id);
    await fetchUserVotes(ids);

    const { data: stats, error: statsError } = await sb.rpc('get_post_vote_stats', {
      post_ids: ids,
    });

    if (statsError) throw statsError;

    const statsMap = new Map((stats || []).map((s) => [s.post_id, s]));

    return posts.map((post) => {
      const st = statsMap.get(post.id) || { votes_a: 0, votes_b: 0, total: 0 };
      const votesA = Number(st.votes_a) || 0;
      const votesB = Number(st.votes_b) || 0;
      const pct = calcPercent(votesA, votesB);
      const myChoice = userVotesMap.get(post.id);
      return {
        ...post,
        authorNickname: post.users?.nickname || '익명',
        votesA,
        votesB,
        totalVotes: pct.total,
        pctA: pct.a,
        pctB: pct.b,
        _voted: Boolean(myChoice),
        _myChoice: myChoice || null,
      };
    });
  }

  function renderPostCard(post) {
    const catLabel = CATEGORY_LABELS[post.category] || post.category;
    const votedClass = post._voted ? ' voted' : '';
    const sponsorClass = post.is_sponsor ? ' sponsor' : '';
    const pickedA = post._myChoice === 'A' ? ' picked' : '';
    const pickedB = post._myChoice === 'B' ? ' picked' : '';
    const loggedIn = window.PickleAuth?.isLoggedIn();
    const hint = loggedIn
      ? post._voted
        ? '이미 투표한 불판입니다'
        : 'A 또는 B를 눌러 투표하세요'
      : '투표하려면 로그인이 필요합니다';

    const mediaHtml = window.PickleFeedMedia
      ? window.PickleFeedMedia.renderPostMediaBlock(post)
      : '';
    const hasMedia = Boolean(mediaHtml);
    const mediaClass = hasMedia ? ' has-media' : ' poll-card--text-only';
    const m = window.PickleFeedMedia?.normalizePostMedia(post);
    const hideVsTitle =
      hasMedia &&
      m &&
      (m.mediaType === 'dual' ||
        m.mediaType === 'single' ||
        m.mediaType === 'video' ||
        m.mediaType === 'video_dual');

    return `
      <article class="poll-card${sponsorClass}${votedClass}${mediaClass}" data-id="${post.id}" data-category="${escapeHtml(post.category)}" data-media="${escapeHtml(m?.mediaType || 'none')}">
        ${mediaHtml}
        <div class="poll-card-body">
        <header class="poll-card-head">
          <span class="poll-cat">${escapeHtml(catLabel)}</span>
          <span class="poll-author">@${escapeHtml(post.authorNickname)}</span>
        </header>
        ${post.title ? `<p class="poll-topic">${escapeHtml(post.title)}</p>` : ''}
        ${
          hideVsTitle
            ? ''
            : `<h2 class="poll-title">${escapeHtml(post.option_a_name)} <span class="vs">VS</span> ${escapeHtml(post.option_b_name)}</h2>`
        }

        <div class="poll-bar">
          <div class="poll-bar-a" style="width:${post.pctA}%"></div>
          <div class="poll-bar-b" style="width:${post.pctB}%"></div>
        </div>
        <div class="poll-pcts">
          <span class="pct-a">${post.pctA}%</span>
          <span class="poll-total">${post.totalVotes.toLocaleString()}표</span>
          <span class="pct-b">${post.pctB}%</span>
        </div>

        <div class="poll-actions${votedClass}">
          <button type="button" class="btn-vote btn-a${pickedA}" data-choice="A" ${post._voted ? 'disabled' : ''} aria-label="${escapeHtml(post.option_a_name)} 투표">
            <span class="btn-label">A</span>
            <span class="btn-name">${escapeHtml(post.option_a_name)}</span>
          </button>
          <button type="button" class="btn-vote btn-b${pickedB}" data-choice="B" ${post._voted ? 'disabled' : ''} aria-label="${escapeHtml(post.option_b_name)} 투표">
            <span class="btn-label">B</span>
            <span class="btn-name">${escapeHtml(post.option_b_name)}</span>
          </button>
        </div>
        <div class="poll-card-footer">
          <p class="poll-hint">${escapeHtml(hint)}</p>
          <button
            type="button"
            class="btn-share btn-share--footer"
            data-post-id="${escapeHtml(post.id)}"
            aria-label="공유하기"
            title="공유하기"
          >
            <svg class="icon-share" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v10.5M12 3l4 4M12 3L8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span class="btn-share-label">🔥 화력 지원 요청</span>
          </button>
        </div>
        ${window.PickleComments ? window.PickleComments.renderCommentsSection(post.id, window.PickleComments.isPanelOpen(post.id)) : ''}
        </div>
      </article>
    `;
  }

  function renderFeed(posts) {
    const list = $('feedList');
    const empty = $('feedEmpty');
    if (!list) return;

    const filtered =
      activeCategory === 'all'
        ? posts
        : posts.filter((p) => p.category === activeCategory);

    if (!filtered.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;
    list.innerHTML = filtered.map(renderPostCard).join('');
    bindVoteButtons(list);
    if (window.PickleShare) {
      window.PickleShare.bindShareButtons(list, (id) => postsCache.find((p) => p.id === id));
    }
    if (window.PickleComments) {
      window.PickleComments.bind(list);
      window.PickleComments.prefetchCounts(filtered.map((p) => p.id));
    }
  }

  function bindVoteButtons(listEl) {
    listEl.querySelectorAll('.btn-vote').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.btn-vote').forEach((btn) => {
      btn.addEventListener('click', onVoteClick);
    });
  }

  async function submitVote(postId, choice, userId) {
    const sb = window.PickleSupabase.getClient();
    const { error } = await sb.from('votes').insert({
      user_id: userId,
      post_id: postId,
      choice,
    });
    if (error) throw error;
  }

  async function resolveVoteUser() {
    if (window.PickleAuth?.ensureAuthenticated) {
      const auth = await window.PickleAuth.ensureAuthenticated({ skipProfile: true, timeoutMs: 8000 });
      return auth?.user ?? null;
    }
    if (window.PickleAuth?.resolveAuthUser) {
      return window.PickleAuth.resolveAuthUser();
    }
    if (window.PickleAuth?.isLoggedIn?.()) {
      return window.PickleAuth.getUser();
    }
    return null;
  }

  async function onVoteClick(e) {
    const btn = e.currentTarget;
    const card = btn.closest('.poll-card');
    if (!card || card.classList.contains('voted') || btn.disabled) return;

    const user = await resolveVoteUser();
    if (!user?.id) {
      goToLoginForVote();
      return;
    }

    const choice = btn.dataset.choice;
    const postId = card.dataset.id;
    const post = postsCache.find((p) => p.id === postId);
    if (!post || post._voted) return;

    btn.disabled = true;

    try {
      await submitVote(postId, choice, user.id);
      if (post && post.author_id && window.PickleProfile?.tryAwardPostAuthorStarScoreFireAndForget) {
        window.PickleProfile.tryAwardPostAuthorStarScoreFireAndForget(
          post.author_id,
          postId,
          'VOTE'
        );
      }
      if (window.PicklePoints && window.PicklePoints.tryAwardPoints) {
        window.PicklePoints.tryAwardPoints(user.id, 'vote', 'Vote').catch(function (err) {
          console.warn('[P!CKLE Feed] vote points skipped', err);
        });
      } else if (window.PicklePoints && window.PicklePoints.awardPoints) {
        console.log('✅ [Vote] 완료 -> awardPoints 호출 시도');
        window.PicklePoints.awardPoints(user.id, 'vote').catch(function (err) {
          console.warn('[P!CKLE Feed] vote points skipped', err);
        });
      }
      postsCache = await fetchPosts();
      renderFeed(postsCache);
      showToast('투표가 반영되었습니다!');
    } catch (err) {
      btn.disabled = false;
      const msg = err.message || String(err);
      if (msg.includes('duplicate') || msg.includes('unique')) {
        alert('이미 이 불판에 투표하셨습니다.');
        postsCache = await fetchPosts();
        renderFeed(postsCache);
      } else if (
        window.PickleAuth?.isSessionMissingError?.(err) ||
        /auth session missing|login_required/i.test(msg)
      ) {
        goToLoginForVote();
      } else {
        alert('투표 저장 실패: ' + msg);
      }
    }
  }

  function showToast(msg) {
    const t = $('feedToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  function setCategory(categoryId) {
    activeCategory = categoryId || 'all';
    document.querySelectorAll('.feed-tab[data-category]').forEach((t) => {
      t.classList.toggle('active', t.dataset.category === activeCategory);
    });
    renderFeed(postsCache);
    if (window.PickleAppShell?.syncCategory) {
      window.PickleAppShell.syncCategory(activeCategory);
    }
  }

  function bindTabs() {
    document.querySelectorAll('.feed-tab[data-category]').forEach((tab) => {
      tab.addEventListener('click', () => {
        setCategory(tab.dataset.category || 'all');
      });
    });
  }

  function checkCreatedToast() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('created') === '1') {
      showToast('🔥 새 불판이 피드에 올라갔습니다!');
      params.delete('created');
      const q = params.toString();
      const url = window.location.pathname + (q ? '?' + q : '');
      window.history.replaceState({}, '', url);
    }
  }

  function applyCategoryFromUrl() {
    const cat = new URLSearchParams(window.location.search).get('cat');
    if (cat) setCategory(cat);
  }

  async function initFeed() {
    const loading = $('feedLoading');
    const errEl = $('feedError');

    try {
      postsCache = await fetchPosts();
      if (errEl) errEl.hidden = true;
      applyCategoryFromUrl();
      renderFeed(postsCache);
      bindTabs();
      checkCreatedToast();
      if (window.PickleShare?.scrollToPostFromUrl) {
        window.PickleShare.scrollToPostFromUrl();
      }
    } catch (err) {
      console.error('[P!CKLE Feed]', err);
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent =
          '불판을 불러오지 못했습니다. ' +
          (err.message || '') +
          ' — SQL 시드 실행 여부를 확인하세요.';
      }
    } finally {
      if (loading) loading.hidden = true;
    }
  }

  async function refresh() {
    postsCache = await fetchPosts();
    renderFeed(postsCache);
  }

  window.PickleFeed = {
    init: initFeed,
    refresh,
    showToast,
    setCategory,
    getCategory: () => activeCategory,
  };

  window.addEventListener('pickle-auth-changed', () => {
    if (postsCache.length) {
      refresh().catch(console.error);
    }
  });
})();
