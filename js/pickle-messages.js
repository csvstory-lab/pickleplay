/**
 * P!CKLE — 쪽지(메시지) 작성 · 메시지함 · 읽지 않음 뱃지
 * @build 20260617_messages1
 */
(function () {
  'use strict';

  var STYLE_ID = 'pickle-messages-styles';
  var MOUNTED = false;
  var currentTargetUserId = null;

  function getClient() {
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.getClient) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    return null;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.pickle-message-overlay{position:fixed;inset:0;z-index:10200;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);opacity:0;visibility:hidden;transition:opacity .25s,visibility .25s;max-width:480px;margin:0 auto;left:0;right:0}' +
      '.pickle-message-overlay.open{opacity:1;visibility:visible}' +
      '.pickle-message-compose{position:fixed;left:0;right:0;bottom:0;max-width:480px;margin:0 auto;z-index:10201;background:#1c1c1e;border-radius:20px 20px 0 0;padding:20px 20px calc(24px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.1);transform:translateY(100%);transition:transform .28s cubic-bezier(.32,.72,0,1);font-family:Pretendard,sans-serif}' +
      '.pickle-message-compose.open{transform:translateY(0)}' +
      '.pickle-message-compose .modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}' +
      '.pickle-message-compose .modal-title{margin:0;font-size:1rem;font-weight:800;color:#fff;display:flex;align-items:center;gap:6px}' +
      '.pickle-message-compose .modal-title .ph{color:#4ade80}' +
      '.pickle-message-compose .btn-close{background:#2c2c2e;border:1px solid rgba(255,255,255,.1);color:#a1a1aa;border-radius:50%;width:32px;height:32px;cursor:pointer}' +
      '.pickle-message-compose .form-textarea{width:100%;box-sizing:border-box;background:#0a0a0c;border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#fff;padding:12px;font-family:inherit;font-size:.85rem;resize:vertical;min-height:110px;margin-bottom:12px}' +
      '.pickle-message-compose .btn-send{width:100%;padding:14px;border:none;border-radius:14px;background:#4ade80;color:#0a0a0c;font-weight:800;font-size:.92rem;cursor:pointer}' +
      '.pickle-message-inbox-sheet{position:fixed;left:0;right:0;bottom:0;max-width:480px;margin:0 auto;z-index:10201;background:#1c1c1e;border-radius:20px 20px 0 0;padding:18px 18px calc(24px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.1);transform:translateY(100%);transition:transform .28s cubic-bezier(.32,.72,0,1);max-height:78vh;display:flex;flex-direction:column;font-family:Pretendard,sans-serif}' +
      '.pickle-message-inbox-sheet.open{transform:translateY(0)}' +
      '.pickle-message-inbox-list{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px}' +
      '.pickle-message-inbox-item{background:#2c2c2e;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;cursor:pointer}' +
      '.pickle-message-inbox-item.unread{border-color:rgba(255,160,146,.35);background:rgba(255,160,146,.06)}' +
      '.pickle-message-inbox-item .msg-from{font-size:.82rem;font-weight:800;color:#73a5ff;margin-bottom:6px}' +
      '.pickle-message-inbox-item .msg-body{font-size:.85rem;color:#e4e4e7;line-height:1.45;word-break:keep-all}' +
      '.pickle-message-inbox-item .msg-time{font-size:.7rem;color:#71717a;margin-top:8px;font-weight:700}' +
      '.pickle-message-inbox-empty{text-align:center;padding:32px 12px;color:#a1a1aa;font-size:.85rem;font-weight:600}';
    document.head.appendChild(style);
  }

  function mountMessageUi() {
    if (MOUNTED) return;
    injectStyles();

    if (!document.getElementById('pickleMessageOverlay')) {
      var root = document.createElement('div');
      root.innerHTML =
        '<div class="pickle-message-overlay" id="pickleMessageOverlay" aria-hidden="true"></div>' +
        '<div class="pickle-message-compose" id="pickleMessageCompose" role="dialog" aria-modal="true" aria-hidden="true">' +
        '<div class="modal-header">' +
        '<h3 class="modal-title"><i class="ph-fill ph-paper-plane-tilt" aria-hidden="true"></i><span id="pickleMessageTargetNickname">유저</span>님께 메시지</h3>' +
        '<button type="button" class="btn-close" id="pickleMessageComposeClose" aria-label="닫기">✕</button>' +
        '</div>' +
        '<textarea class="form-textarea" id="pickleMessageContent" placeholder="상대방에게 보낼 메시지를 입력해주세요. (비방/위험 문구 입력 시 제재를 받을 수 있습니다)"></textarea>' +
        '<button type="button" class="btn-send" id="pickleMessageSendBtn">보내기</button>' +
        '</div>' +
        '<div class="pickle-message-inbox-sheet" id="pickleMessageInboxSheet" role="dialog" aria-modal="true" aria-hidden="true">' +
        '<div class="modal-header">' +
        '<h3 class="modal-title"><i class="ph ph-envelope-simple" aria-hidden="true"></i> 메세지함</h3>' +
        '<button type="button" class="btn-close" id="pickleMessageInboxClose" aria-label="닫기">✕</button>' +
        '</div>' +
        '<ul class="pickle-message-inbox-list" id="pickleMessageInboxList"></ul>' +
        '</div>';
      document.body.appendChild(root);
    }

    var overlay = document.getElementById('pickleMessageOverlay');
    var composeClose = document.getElementById('pickleMessageComposeClose');
    var inboxClose = document.getElementById('pickleMessageInboxClose');
    var sendBtn = document.getElementById('pickleMessageSendBtn');

    if (overlay && overlay.dataset.bound !== '1') {
      overlay.dataset.bound = '1';
      overlay.addEventListener('click', closeAllMessageUi);
    }
    if (composeClose && composeClose.dataset.bound !== '1') {
      composeClose.dataset.bound = '1';
      composeClose.addEventListener('click', closeAllMessageUi);
    }
    if (inboxClose && inboxClose.dataset.bound !== '1') {
      inboxClose.dataset.bound = '1';
      inboxClose.addEventListener('click', closeAllMessageUi);
    }
    if (sendBtn && sendBtn.dataset.bound !== '1') {
      sendBtn.dataset.bound = '1';
      sendBtn.addEventListener('click', submitDirectMessage);
    }

    document.body.setAttribute('data-message-page', '1');
    MOUNTED = true;
  }

  function openOverlay() {
    var overlay = document.getElementById('pickleMessageOverlay');
    if (overlay) {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
    }
    document.body.style.overflow = 'hidden';
  }

  function closeAllMessageUi() {
    ['pickleMessageCompose', 'pickleMessageInboxSheet'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.classList.remove('open');
        el.setAttribute('aria-hidden', 'true');
      }
    });
    var overlay = document.getElementById('pickleMessageOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    currentTargetUserId = null;
  }

  function openMessageModal() {
    mountMessageUi();

    var followBtn = document.getElementById('popupFollowBtn');
    var targetUid = followBtn ? followBtn.getAttribute('data-user-id') : currentTargetUserId;
    var targetNameEl = document.getElementById('popupUserName');
    var targetName = targetNameEl ? targetNameEl.textContent.trim() : '유저';

    if (!targetUid) {
      alert('상대 유저의 고유 정보가 올바르지 않습니다.');
      return;
    }

    currentTargetUserId = targetUid;

    if (window.PickleFollows && typeof window.PickleFollows.closeUserProfileModal === 'function') {
      window.PickleFollows.closeUserProfileModal();
    } else if (window.PickleProfileModal && typeof window.PickleProfileModal.close === 'function') {
      window.PickleProfileModal.close();
    }

    var nickEl = document.getElementById('pickleMessageTargetNickname');
    var contentEl = document.getElementById('pickleMessageContent');
    if (nickEl) nickEl.textContent = targetName;
    if (contentEl) contentEl.value = '';

    openOverlay();
    var compose = document.getElementById('pickleMessageCompose');
    if (compose) {
      compose.classList.add('open');
      compose.setAttribute('aria-hidden', 'false');
    }
  }

  async function getCurrentUser() {
    if (window.PickleAuth && window.PickleAuth.getUser) {
      var u = window.PickleAuth.getUser();
      if (u) return u;
    }
    var sb = getClient();
    if (!sb) return null;
    var res = await sb.auth.getUser();
    return res.data && res.data.user ? res.data.user : null;
  }

  async function submitDirectMessage() {
    mountMessageUi();

    var contentEl = document.getElementById('pickleMessageContent');
    var content = contentEl ? contentEl.value.trim() : '';
    var targetUid = currentTargetUserId;

    if (!content) {
      alert('메시지 내용을 입력해주세요.');
      return;
    }
    if (!targetUid) {
      alert('수신인 대상 식별 정보가 유실되었습니다.');
      return;
    }

    try {
      var user = await getCurrentUser();
      if (!user) {
        alert('로그인한 회원만 쪽지를 발송할 수 있습니다.');
        return;
      }
      if (user.id === targetUid) {
        alert('나 자신에게는 메시지를 보낼 수 없습니다.');
        return;
      }

      var sb = getClient();
      if (!sb) throw new Error('Supabase 클라이언트 없음');

      var payload = {
        sender_id: user.id,
        receiver_id: targetUid,
        content: content,
      };

      var result = await sb.from('messages').insert([payload]);
      if (result.error) throw result.error;

      var nickEl = document.getElementById('pickleMessageTargetNickname');
      var nick = nickEl ? nickEl.textContent.trim() : '상대방';
      alert(nick + '님께 메시지가 전달되었습니다.');
      closeAllMessageUi();
    } catch (err) {
      console.error('[P!CKLE Messages] send failed', err);
      alert('메시지 발송 오류가 발생했습니다.');
    }
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    var then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    var diffSec = Math.floor((Date.now() - then) / 1000);
    if (diffSec < 60) return '방금 전';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + '분 전';
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + '시간 전';
    return new Date(iso).toLocaleDateString('ko-KR');
  }

  async function fetchUnreadCount(userId) {
    if (!userId) return 0;
    var sb = getClient();
    if (!sb) return 0;

    try {
      var res = await sb
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .eq('is_read', false);

      if (!res.error && res.count != null) return Number(res.count) || 0;
    } catch (err) {
      console.warn('[P!CKLE Messages] unread count (is_read)', err);
    }

    try {
      var res2 = await sb
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .is('read_at', null);

      if (!res2.error && res2.count != null) return Number(res2.count) || 0;
    } catch (err2) {
      console.warn('[P!CKLE Messages] unread count (read_at)', err2);
    }

    return 0;
  }

  function updateInboxBadge(count) {
    var badge = document.getElementById('messageInboxBadge');
    if (!badge) return;
    var n = Number(count) || 0;
    if (n > 0) {
      badge.textContent = String(n > 99 ? '99+' : n);
      badge.classList.remove('hidden');
      badge.hidden = false;
    } else {
      badge.textContent = '0';
      badge.classList.add('hidden');
      badge.hidden = true;
    }
  }

  async function refreshInboxBadge(userId) {
    var uid = userId;
    if (!uid) {
      var user = await getCurrentUser();
      uid = user && user.id;
    }
    if (!uid) {
      updateInboxBadge(0);
      return 0;
    }
    var count = await fetchUnreadCount(uid);
    updateInboxBadge(count);
    return count;
  }

  async function markMessageRead(messageId) {
    if (!messageId) return;
    var sb = getClient();
    if (!sb) return;

    var patch = { is_read: true };
    var res = await sb.from('messages').update(patch).eq('id', messageId);
    if (res.error) {
      await sb.from('messages').update({ read_at: new Date().toISOString() }).eq('id', messageId);
    }
  }

  async function loadInboxList(userId) {
    var listEl = document.getElementById('pickleMessageInboxList');
    if (!listEl) return;

    listEl.innerHTML = '<li class="pickle-message-inbox-empty">불러오는 중...</li>';

    var sb = getClient();
    if (!sb || !userId) {
      listEl.innerHTML = '<li class="pickle-message-inbox-empty">로그인이 필요합니다.</li>';
      return;
    }

    var result = await sb
      .from('messages')
      .select('id, sender_id, content, created_at, is_read, read_at')
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (result.error) {
      listEl.innerHTML =
        '<li class="pickle-message-inbox-empty">메시지를 불러오지 못했습니다.</li>';
      console.warn('[P!CKLE Messages] inbox load failed', result.error);
      return;
    }

    var rows = result.data || [];
    if (!rows.length) {
      listEl.innerHTML = '<li class="pickle-message-inbox-empty">받은 메시지가 없습니다.</li>';
      return;
    }

    var senderIds = rows.map(function (r) {
      return r.sender_id;
    }).filter(Boolean);
    var nickMap = Object.create(null);

    if (senderIds.length) {
      var usersRes = await sb.from('users').select('id, nickname').in('id', senderIds);
      if (!usersRes.error && usersRes.data) {
        usersRes.data.forEach(function (u) {
          if (u && u.id) nickMap[u.id] = u.nickname || '픽클러';
        });
      }
    }

    listEl.innerHTML = rows
      .map(function (row) {
        var unread = row.is_read === false || (row.read_at == null && row.is_read !== true);
        return (
          '<li class="pickle-message-inbox-item' +
          (unread ? ' unread' : '') +
          '" data-message-id="' +
          escapeHtml(row.id) +
          '">' +
          '<div class="msg-from">' +
          escapeHtml(nickMap[row.sender_id] || '픽클러') +
          '</div>' +
          '<div class="msg-body">' +
          escapeHtml(row.content || '') +
          '</div>' +
          '<div class="msg-time">' +
          escapeHtml(formatRelativeTime(row.created_at)) +
          '</div>' +
          '</li>'
        );
      })
      .join('');

    listEl.querySelectorAll('.pickle-message-inbox-item[data-message-id]').forEach(function (item) {
      item.addEventListener('click', function () {
        var mid = item.getAttribute('data-message-id');
        markMessageRead(mid).then(function () {
          item.classList.remove('unread');
          refreshInboxBadge(userId);
        });
      });
    });
  }

  async function openMessageInbox() {
    mountMessageUi();
    var user = await getCurrentUser();
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    openOverlay();
    var sheet = document.getElementById('pickleMessageInboxSheet');
    if (sheet) {
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
    }

    await loadInboxList(user.id);
    await refreshInboxBadge(user.id);
  }

  window.PickleMessages = {
    mount: mountMessageUi,
    openCompose: openMessageModal,
    openInbox: openMessageInbox,
    submitDirectMessage: submitDirectMessage,
    fetchUnreadCount: fetchUnreadCount,
    refreshInboxBadge: refreshInboxBadge,
    closeAll: closeAllMessageUi,
  };

  window.openMessageModal = openMessageModal;
  window.submitDirectMessage = submitDirectMessage;
  window.openMessageInbox = openMessageInbox;

  document.addEventListener('DOMContentLoaded', function () {
    mountMessageUi();
    if (document.getElementById('btnMessageInbox')) {
      refreshInboxBadge();
    }
  });
})();
