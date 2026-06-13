/**
 * P!CKLE — 투표 카드 공유 (Web Share API + 클립보드 Fallback)
 */
(function () {
  'use strict';

  function buildSharePayload(post) {
    const topic =
      post.title?.trim() ||
      `${post.option_a_name} VS ${post.option_b_name}`;
    const title = `P!CKLE · ${topic}`;
    const text = [
      `🔥 당신의 선택은?`,
      `${post.option_a_name} vs ${post.option_b_name}`,
      `지금 P!CKLE에서 투표하고 결과를 확인해 보세요!`,
    ].join('\n');

    const url = new URL(window.location.href);
    url.searchParams.set('post', post.id);
    url.hash = '';

    return { title, text, url: url.toString() };
  }

  function notifyCopied() {
    if (window.PickleFeed?.showToast) {
      window.PickleFeed.showToast('클립보드에 링크가 복사되었습니다!');
      return;
    }
    alert('클립보드에 링크가 복사되었습니다!');
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  async function fallbackCopyShareUrl(url) {
    try {
      await copyToClipboard(url);
      notifyCopied();
      if (window.PickleRankingEvents?.recordPostShare && post?.id) {
        window.PickleRankingEvents.recordPostShare(post.id, 'copy');
      }
    } catch (err) {
      console.warn('[P!CKLE Share] clipboard failed', err);
      alert('링크 복사에 실패했습니다. URL을 직접 복사해 주세요:\n' + url);
    }
  }

  async function sharePost(post) {
    if (!post?.id) return;

    const payload = buildSharePayload(post);

    if (document.getElementById('shareSheet') && window.PickleShareSheet) {
      window.PickleShareSheet.setShareContext({
        title: payload.title,
        url: payload.url,
        description: payload.text,
        postId: post.id,
      });
      window.PickleShareSheet.openShareSheet();
      return;
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: payload.title,
          text: payload.text,
          url: payload.url,
        });
        if (window.PickleRankingEvents?.recordPostShare) {
          window.PickleRankingEvents.recordPostShare(post.id, 'native');
        }
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.warn('[P!CKLE Share] navigator.share failed, fallback', err);
      }
    }

    await fallbackCopyShareUrl(payload.url);
  }

  function bindShareButtons(listEl, getPostById) {
    if (!listEl) return;

    listEl.querySelectorAll('.btn-share').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });

    listEl.querySelectorAll('.btn-share').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const postId = btn.dataset.postId;
        const post = getPostById(postId);
        if (!post) return;

        btn.disabled = true;
        try {
          await sharePost(post);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function scrollToPostFromUrl() {
    const postId = new URLSearchParams(window.location.search).get('post');
    if (!postId) return;

    const card = document.querySelector(`.poll-card[data-id="${postId}"]`);
    if (!card) return;

    requestAnimationFrame(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('poll-card--highlight');
      setTimeout(() => card.classList.remove('poll-card--highlight'), 2200);
    });
  }

  window.PickleShare = {
    buildSharePayload,
    sharePost,
    bindShareButtons,
    scrollToPostFromUrl,
  };
})();
