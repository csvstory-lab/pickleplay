/**
 * P!CKLE — 마이페이지
 */
(function () {
  'use strict';

  const CATEGORY_LABELS = {
    hot: '🔥 핫',
    brand: '🤝 브랜드',
    love: '💔 연애',
    brain: '🤯 뇌정지',
    ugc: '✨ UGC',
    other: '기타',
  };

  let activeTab = 'created';

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

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function showProfileMessage(text, isError) {
    const el = $('profileMessage');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className = 'profile-message' + (isError ? ' error' : ' success');
  }

  function renderProfile(user) {
    const emailEl = $('mpEmail');
    const nickInput = $('mpNicknameInput');
    const displayEl = $('mpDisplayName');

    const email = user.email || '(소셜 로그인 — 이메일 없음)';
    const nick = window.PickleAuth.getDisplayName(user);

    if (emailEl) emailEl.textContent = email;
    if (nickInput) nickInput.value = user.user_metadata?.nickname || nick;
    if (displayEl) displayEl.textContent = nick;
  }

  async function fetchMyPosts(userId) {
    const sb = window.PickleSupabase.getClient();
    const { data, error } = await sb
      .from('posts')
      .select('id, title, option_a_name, option_b_name, category, visibility_status, created_at')
      .eq('author_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async function fetchMyVotes(userId) {
    const sb = window.PickleSupabase.getClient();
    const { data, error } = await sb
      .from('votes')
      .select(
        `
        id,
        choice,
        created_at,
        post_id,
        posts:post_id (
          id,
          title,
          option_a_name,
          option_b_name,
          category,
          visibility_status
        )
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  function renderCreatedItem(post) {
    const cat = CATEGORY_LABELS[post.category] || post.category;
    const title = post.title
      ? `<span class="activity-topic">${escapeHtml(post.title)}</span>`
      : '';
    const status =
      post.visibility_status !== 'visible'
        ? `<span class="activity-badge">${escapeHtml(post.visibility_status)}</span>`
        : '';

    return `
      <li class="activity-item">
        <div class="activity-head">
          <span class="activity-cat">${escapeHtml(cat)}</span>
          ${status}
          <time>${formatDate(post.created_at)}</time>
        </div>
        ${title}
        <p class="activity-vs">${escapeHtml(post.option_a_name)} <span>VS</span> ${escapeHtml(post.option_b_name)}</p>
        <a href="index.html" class="activity-link">피드에서 보기 →</a>
      </li>
    `;
  }

  function renderVoteItem(vote) {
    const post = vote.posts;
    if (!post) {
      return `
        <li class="activity-item muted">
          <p>투표한 불판을 불러올 수 없습니다 (삭제·비공개)</p>
          <time>${formatDate(vote.created_at)}</time>
        </li>
      `;
    }

    const cat = CATEGORY_LABELS[post.category] || post.category;
    const choiceLabel = vote.choice === 'A' ? post.option_a_name : post.option_b_name;
    const choiceClass = vote.choice === 'A' ? 'choice-a' : 'choice-b';
    const title = post.title
      ? `<span class="activity-topic">${escapeHtml(post.title)}</span>`
      : '';

    return `
      <li class="activity-item">
        <div class="activity-head">
          <span class="activity-cat">${escapeHtml(cat)}</span>
          <span class="activity-choice ${choiceClass}">${vote.choice} 선택 · ${escapeHtml(choiceLabel)}</span>
          <time>${formatDate(vote.created_at)}</time>
        </div>
        ${title}
        <p class="activity-vs">${escapeHtml(post.option_a_name)} <span>VS</span> ${escapeHtml(post.option_b_name)}</p>
        <a href="index.html" class="activity-link">피드에서 보기 →</a>
      </li>
    `;
  }

  function renderActivityList(itemsHtml, emptyText) {
    if (!itemsHtml.length) {
      return `<p class="activity-empty">${escapeHtml(emptyText)}</p>`;
    }
    return `<ul class="activity-list">${itemsHtml}</ul>`;
  }

  async function loadCreatedTab(userId) {
    const el = $('tabCreated');
    if (!el) return;
    el.innerHTML = '<p class="activity-loading">불러오는 중…</p>';
    try {
      const posts = await fetchMyPosts(userId);
      const html = posts.map(renderCreatedItem).join('');
      el.innerHTML = renderActivityList(
        html,
        '아직 만든 불판이 없습니다. ✏️ 글쓰기에서 첫 밸런스 게임을 올려 보세요!'
      );
    } catch (err) {
      el.innerHTML = `<p class="activity-error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadVotedTab(userId) {
    const el = $('tabVoted');
    if (!el) return;
    el.innerHTML = '<p class="activity-loading">불러오는 중…</p>';
    try {
      const votes = await fetchMyVotes(userId);
      const html = votes.map(renderVoteItem).join('');
      el.innerHTML = renderActivityList(
        html,
        '아직 참여한 투표가 없습니다. 메인 피드에서 A/B를 골라 보세요!'
      );
    } catch (err) {
      el.innerHTML = `<p class="activity-error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadActivity(userId) {
    await Promise.all([loadCreatedTab(userId), loadVotedTab(userId)]);
  }

  function bindTabs() {
    document.querySelectorAll('.mp-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        document.querySelectorAll('.mp-tab').forEach((t) => {
          t.classList.toggle('active', t === tab);
        });
        const panelId = activeTab === 'created' ? 'panelCreated' : 'panelVoted';
        document.querySelectorAll('.mp-panel').forEach((p) => {
          p.classList.toggle('active', p.id === panelId);
        });
      });
    });
  }

  function bindNicknameForm() {
    const form = $('formNickname');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('btnSaveNickname');
      const nick = $('mpNicknameInput').value;

      btn.disabled = true;
      try {
        const user = await window.PickleAuth.updateNickname(nick);
        renderProfile(user);
        $('mpDisplayName').textContent = window.PickleAuth.getDisplayName(user);
        showProfileMessage('닉네임이 저장되었습니다.', false);
      } catch (err) {
        showProfileMessage(err.message || '저장에 실패했습니다.', true);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function bindLogout() {
    const btn = $('btnLogout');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        await window.PickleAuth.signOut();
        window.location.href = 'index.html';
      } catch (err) {
        alert(err.message || '로그아웃에 실패했습니다.');
      }
    });
  }

  async function init() {
    await window.PickleAuth.init();

    if (!window.PickleAuth.isLoggedIn()) {
      window.PickleAuth.goToLogin({ redirect: 'mypage.html' });
      return;
    }

    const user = window.PickleAuth.getUser();
    renderProfile(user);
    bindNicknameForm();
    bindLogout();
    bindTabs();
    await loadActivity(user.id);
  }

  window.PickleMypage = { init };

  document.addEventListener('DOMContentLoaded', init);
})();
