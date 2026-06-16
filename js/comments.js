/**
 * P!CKLE — 불판 댓글 (comments 테이블)
 */
(function () {
  'use strict';

  const openPanels = new Set();
  const loadedPanels = new Set();

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return '방금 전';
    if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
    if (sec < 604800) return `${Math.floor(sec / 86400)}일 전`;
    return d.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function extractCommentAuthorSnapshot(user) {
    const meta = (user && user.user_metadata) || {};
    let nickname = meta.nickname ? String(meta.nickname).trim() : '';

    if (!nickname && user && user.email) {
      nickname = String(user.email).split('@')[0] || '';
    }
    if (!nickname) {
      nickname = '픽클러';
    }

    let avatarHtml = '';
    if (meta.avatar_html && String(meta.avatar_html).trim()) {
      avatarHtml = String(meta.avatar_html).trim();
    } else if (meta.avatar_emoji && String(meta.avatar_emoji).trim()) {
      avatarHtml = String(meta.avatar_emoji).trim();
    } else {
      const avatarUrl = meta.avatar_url || meta.picture || meta.avatar || '';
      if (avatarUrl) {
        avatarHtml = `<img src="${String(avatarUrl).replace(/"/g, '&quot;')}" alt="">`;
      } else {
        avatarHtml = '🥒';
      }
    }

    return {
      author_nickname: nickname,
      author_avatar_html: avatarHtml,
    };
  }

  function normalizeCommentRow(comment) {
    if (!comment) return comment;
    let nickname = comment.author_nickname ? String(comment.author_nickname).trim() : '';
    let avatarHtml = comment.author_avatar_html ? String(comment.author_avatar_html).trim() : '';
    if (!nickname && comment.users?.nickname) {
      nickname = String(comment.users.nickname).trim();
    }
    comment.author_nickname = nickname || null;
    comment.author_avatar_html = avatarHtml || null;
    return comment;
  }

  function authorLabel(comment) {
    if (comment?.author_nickname && String(comment.author_nickname).trim()) {
      return String(comment.author_nickname).trim();
    }
    const usersJoin = comment.users;
    const me = window.PickleAuth?.getUser();
    if (me && comment.user_id === me.id && me.email) {
      return window.PickleAuth.emailLocalPart(me.email);
    }
    if (usersJoin?.nickname) return usersJoin.nickname;
    return '픽클러';
  }

  function authorAvatarInner(comment) {
    const raw = comment?.author_avatar_html ? String(comment.author_avatar_html).trim() : '';
    if (!raw) return escapeHtml('🥒');
    if (raw.indexOf('<') !== -1) return raw;
    return escapeHtml(raw);
  }

  function displayBody(comment) {
    return comment.filtered_content || comment.content || '';
  }

  function renderCommentHtml(comment) {
    const name = authorLabel(comment);
    return `
      <li class="comment-item" data-comment-id="${comment.id}">
        <div class="comment-author-avatar">${authorAvatarInner(comment)}</div>
        <div class="comment-meta">
          <span class="comment-author">${escapeHtml(name)}</span>
          <time class="comment-time" datetime="${escapeHtml(comment.created_at)}">${formatTime(comment.created_at)}</time>
        </div>
        <p class="comment-body">${escapeHtml(displayBody(comment))}</p>
      </li>
    `;
  }

  function renderCommentsSection(postId, isOpen) {
    const loggedIn = window.PickleAuth?.isLoggedIn();
    const openClass = isOpen ? ' open' : '';

    const composer = loggedIn
      ? `
        <form class="comments-form" data-post-id="${postId}">
          <textarea
            class="comments-input"
            name="content"
            rows="2"
            maxlength="2000"
            placeholder="의견을 남겨 보세요…"
            required
          ></textarea>
          <button type="submit" class="btn-comment-submit">등록</button>
        </form>
      `
      : `
        <p class="comments-login-prompt">
          댓글을 남기려면 <a href="login.html?redirect=index.html" class="comments-login-link">로그인</a>하세요
        </p>
      `;

    return `
      <div class="comments-wrap">
        <button type="button" class="btn-comments-toggle${openClass}" data-post-id="${postId}" aria-expanded="${isOpen}">
          <span class="comments-toggle-icon">💬</span>
          <span class="comments-toggle-text">댓글 보기/쓰기</span>
          <span class="comments-count" data-post-id="${postId}"></span>
          <span class="comments-chevron" aria-hidden="true">▼</span>
        </button>
        <div class="comments-panel${openClass}" data-post-id="${postId}">
          <div class="comments-loading" hidden>댓글 불러오는 중…</div>
          <ul class="comments-list" data-post-id="${postId}"></ul>
          <p class="comments-empty" hidden>아직 댓글이 없습니다. 첫 댓글을 남겨 보세요!</p>
          ${composer}
        </div>
      </div>
    `;
  }

  const COMMENT_SELECT_VARIANTS = [
    'id, content, filtered_content, created_at, user_id, author_nickname, author_avatar_html',
    'id, content, filtered_content, created_at, user_id, users:user_id ( nickname )',
  ];

  function isCommentSchemaColumnError(error) {
    if (!error) return false;
    const msg = String(error.message || '').toLowerCase();
    return (
      msg.includes('author_nickname') ||
      msg.includes('author_avatar_html') ||
      msg.includes('column') ||
      msg.includes('could not find') ||
      error.code === '42703' ||
      error.code === 'PGRST204'
    );
  }

  async function fetchComments(postId) {
    const sb = window.PickleSupabase.getClient();
    let lastError = null;

    for (let i = 0; i < COMMENT_SELECT_VARIANTS.length; i++) {
      const { data, error } = await sb
        .from('comments')
        .select(COMMENT_SELECT_VARIANTS[i])
        .eq('post_id', postId)
        .order('created_at', { ascending: false });

      if (!error) {
        return (data || []).map(normalizeCommentRow);
      }

      lastError = error;
      if (!isCommentSchemaColumnError(error)) {
        throw error;
      }
    }

    throw lastError || new Error('댓글을 불러오지 못했습니다.');
  }

  async function fetchCommentCount(postId) {
    try {
      const list = await fetchComments(postId);
      return list.length;
    } catch {
      return 0;
    }
  }

  function updateCountBadge(postId, count) {
    document.querySelectorAll(`.comments-count[data-post-id="${postId}"]`).forEach((el) => {
      el.textContent = count > 0 ? `(${count})` : '';
    });
  }

  async function loadCommentsPanel(postId, panelEl) {
    const listEl = panelEl.querySelector('.comments-list');
    const loadingEl = panelEl.querySelector('.comments-loading');
    const emptyEl = panelEl.querySelector('.comments-empty');

    if (!listEl) return;

    loadingEl.hidden = false;
    emptyEl.hidden = true;

    try {
      const comments = await fetchComments(postId);
      listEl.innerHTML = comments.map(renderCommentHtml).join('');
      emptyEl.hidden = comments.length > 0;
      updateCountBadge(postId, comments.length);
      loadedPanels.add(postId);
    } catch (err) {
      listEl.innerHTML = `<li class="comment-error">댓글을 불러오지 못했습니다. ${escapeHtml(err.message)}</li>`;
    } finally {
      loadingEl.hidden = true;
    }
  }

  async function submitComment(postId, content, panelEl) {
    const text = content.trim();
    if (!text) throw new Error('댓글 내용을 입력해 주세요.');
    if (!window.PickleAuth?.isLoggedIn()) {
      throw new Error('로그인이 필요합니다');
    }

    const sb = window.PickleSupabase.getClient();
    const authResult = await sb.auth.getUser();
    const user = authResult.data?.user;
    if (!user) {
      throw new Error('로그인이 필요합니다');
    }

    const authorSnapshot = extractCommentAuthorSnapshot(user);
    const insertPayload = {
      user_id: user.id,
      post_id: postId,
      content: text,
      filtered_content: text,
      ai_filter_status: 'passed',
      visibility_status: 'visible',
      author_nickname: authorSnapshot.author_nickname,
      author_avatar_html: authorSnapshot.author_avatar_html,
    };

    let { data, error } = await sb
      .from('comments')
      .insert(insertPayload)
      .select(
        'id, content, filtered_content, created_at, user_id, author_nickname, author_avatar_html'
      )
      .single();

    if (error && isCommentSchemaColumnError(error)) {
      delete insertPayload.author_nickname;
      delete insertPayload.author_avatar_html;
      ({ data, error } = await sb
        .from('comments')
        .insert(insertPayload)
        .select(
          'id, content, filtered_content, created_at, user_id, users:user_id ( nickname )'
        )
        .single());
    }

    if (error) throw error;

    data = normalizeCommentRow(data);
    if (!data.author_nickname) data.author_nickname = authorSnapshot.author_nickname;
    if (!data.author_avatar_html) data.author_avatar_html = authorSnapshot.author_avatar_html;

    const listEl = panelEl.querySelector('.comments-list');
    const emptyEl = panelEl.querySelector('.comments-empty');
    if (listEl) {
      listEl.insertAdjacentHTML('afterbegin', renderCommentHtml(data));
    }
    if (emptyEl) emptyEl.hidden = true;

    const count = listEl ? listEl.querySelectorAll('.comment-item').length : 1;
    updateCountBadge(postId, count);

    return data;
  }

  function setPanelOpen(postId, open) {
    const card = document.querySelector(`.poll-card[data-id="${postId}"]`);
    if (!card) return;

    const toggle = card.querySelector('.btn-comments-toggle');
    const panel = card.querySelector(`.comments-panel[data-post-id="${postId}"]`);

    if (open) {
      openPanels.add(postId);
    } else {
      openPanels.delete(postId);
    }

    if (toggle) {
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (panel) {
      panel.classList.toggle('open', open);
      panel.hidden = !open;
    }
  }

  async function onToggleClick(e) {
    const btn = e.currentTarget;
    const postId = btn.dataset.postId;
    const card = btn.closest('.poll-card');
    const panel = card?.querySelector(`.comments-panel[data-post-id="${postId}"]`);
    if (!panel) return;

    const willOpen = !openPanels.has(postId);
    setPanelOpen(postId, willOpen);

    if (willOpen && !loadedPanels.has(postId)) {
      await loadCommentsPanel(postId, panel);
    }
  }

  async function onSubmitForm(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const postId = form.dataset.postId;
    const panel = form.closest('.comments-panel');
    const input = form.querySelector('.comments-input');
    const btn = form.querySelector('.btn-comment-submit');
    const text = input?.value || '';

    if (!window.PickleAuth?.isLoggedIn()) {
      if (
        window.location.hash.includes('access_token=') ||
        window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()
      ) {
        return;
      }
      if (window.PickleAuth?.promptAuthForAction) {
        await window.PickleAuth.promptAuthForAction({
          message: '로그인이 필요한 서비스입니다.',
          redirect: 'index.html',
          from: 'comment',
        });
        return;
      }
      if (confirm('로그인이 필요한 서비스입니다.\n\n로그인 페이지로 이동할까요?')) {
        window.location.href = 'login.html?redirect=index.html&from=comment';
      }
      return;
    }

    btn.disabled = true;
    try {
      await submitComment(postId, text, panel);
      input.value = '';
      if (window.PickleFeed?.showToast) {
        window.PickleFeed.showToast('댓글이 등록되었습니다');
      }
    } catch (err) {
      alert('댓글 등록 실패: ' + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  }

  function bind(rootEl) {
    if (!rootEl) return;

    rootEl.querySelectorAll('.btn-comments-toggle').forEach((btn) => {
      btn.addEventListener('click', onToggleClick);
    });

    rootEl.querySelectorAll('.comments-form').forEach((form) => {
      form.addEventListener('submit', onSubmitForm);
    });

    openPanels.forEach((postId) => {
      const panel = rootEl.querySelector(`.comments-panel[data-post-id="${postId}"]`);
      if (panel) loadCommentsPanel(postId, panel);
    });
  }

  function isPanelOpen(postId) {
    return openPanels.has(postId);
  }

  async function prefetchCounts(postIds) {
    await Promise.all(
      postIds.map(async (id) => {
        const n = await fetchCommentCount(id);
        updateCountBadge(id, n);
      })
    );
  }

  window.PickleComments = {
    renderCommentsSection,
    bind,
    isPanelOpen,
    prefetchCounts,
    formatTime,
  };
})();
