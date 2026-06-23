/**
 * P!CKLE — 쪽지(메시지) 작성 · 메시지함 · 읽지 않음 뱃지 · 발송 방어
 * @build 20260617_messages2
 */
(function () {
  'use strict';

  var STYLE_ID = 'pickle-messages-styles';
  var TOAST_ID = 'pickleMessageToast';
  var MOUNTED = false;
  var currentTargetUserId = null;

  var DAILY_LIMIT = 5;
  var COOLDOWN_MS = 60 * 1000;
  var LAST_SENT_KEY = 'pickle_msg_last_sent';

  var ERROR_MESSAGES = {
    auth_required: '로그인이 필요합니다.',
    invalid_receiver: '수신자 정보가 올바르지 않습니다.',
    empty_content: '메시지 내용을 입력해주세요.',
    level_too_low:
      'Lv.2부터 메세지를 보낼 수 있어요! (투표에 참여해 레벨업 해보세요 🔥)',
    daily_limit: '오늘 보낼 수 있는 메세지를 모두 소진했어요.',
    cooldown: '메세지를 너무 빠르게 보내고 있어요. 1분 후 다시 시도해 주세요.',
    duplicate_content: '동일한 내용의 메세지는 연속해서 보낼 수 없습니다.',
    blocked_by_receiver: '상대방에게 메세지를 보낼 수 없습니다.',
    receiver_not_found: '수신자를 찾을 수 없습니다.',
    content_too_long: '메시지가 너무 깁니다. (최대 2,000자)',
  };

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

  function showToast(msg) {
    if (!msg) return;
    var toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.className = 'pickle-message-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toast.classList.remove('show');
    }, 3200);
  }

  function getLastSentMeta() {
    try {
      var raw = sessionStorage.getItem(LAST_SENT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function setLastSentMeta(content) {
    try {
      sessionStorage.setItem(
        LAST_SENT_KEY,
        JSON.stringify({ content: content, at: Date.now() })
      );
    } catch (err) {
      /* ignore */
    }
  }

  function startOfUtcDayIso() {
    var d = new Date();
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    ).toISOString();
  }

  async function fetchSenderLevel(userId) {
    var sb = getClient();
    if (!sb || !userId) return 1;

    if (window.PickleProfile && window.PickleProfile.fetchRankingPoints) {
      var pts = await window.PickleProfile.fetchRankingPoints(sb, userId);
      if (window.PickleProfile.getUserLevelFromPoints) {
        return window.PickleProfile.getUserLevelFromPoints(pts);
      }
    }

    var res = await sb.from('users').select('star_score').eq('id', userId).maybeSingle();
    if (res.error || !res.data) return 1;
    var score = Number(res.data.star_score) || 0;
    if (score >= 1000) return 5;
    if (score >= 600) return 4;
    if (score >= 300) return 3;
    if (score >= 100) return 2;
    return 1;
  }

  async function fetchTodaySendCount(senderId) {
    var sb = getClient();
    if (!sb || !senderId) return 0;

    var res = await sb
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', senderId)
      .gte('created_at', startOfUtcDayIso());

    if (res.error) {
      console.warn('[P!CKLE Messages] daily count failed', res.error);
      return 0;
    }
    return Number(res.count) || 0;
  }

  function checkClientCooldown() {
    var meta = getLastSentMeta();
    if (!meta || !meta.at) return null;
    var elapsed = Date.now() - Number(meta.at);
    if (elapsed < COOLDOWN_MS) {
      return ERROR_MESSAGES.cooldown;
    }
    return null;
  }

  function checkClientDuplicate(content) {
    var meta = getLastSentMeta();
    if (!meta || !meta.content) return null;
    if (String(meta.content).trim() === String(content).trim()) {
      return ERROR_MESSAGES.duplicate_content;
    }
    return null;
  }

  async function validateBeforeSend(user, targetUid, content) {
    if (!user || !user.id) {
      return { ok: false, message: ERROR_MESSAGES.auth_required };
    }
    if (!targetUid) {
      return { ok: false, message: ERROR_MESSAGES.invalid_receiver };
    }
    if (!content) {
      return { ok: false, message: ERROR_MESSAGES.empty_content };
    }
    if (user.id === targetUid) {
      return { ok: false, message: '나 자신에게는 메시지를 보낼 수 없습니다.' };
    }

    var level = await fetchSenderLevel(user.id);
    if (level < 2) {
      return { ok: false, message: ERROR_MESSAGES.level_too_low };
    }

    var todayCount = await fetchTodaySendCount(user.id);
    if (todayCount >= DAILY_LIMIT) {
      return { ok: false, message: ERROR_MESSAGES.daily_limit };
    }

    var cooldownMsg = checkClientCooldown();
    if (cooldownMsg) return { ok: false, message: cooldownMsg };

    var dupMsg = checkClientDuplicate(content);
    if (dupMsg) return { ok: false, message: dupMsg };

    return { ok: true };
  }

  function mapRpcResult(data) {
    if (!data) return '메시지 발송 오류가 발생했습니다.';
    if (data.ok) return null;
    var code = data.code || '';
    return ERROR_MESSAGES[code] || '메시지 발송 오류가 발생했습니다.';
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
      '.pickle-message-inbox-item{background:#2c2c2e;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px}' +
      '.pickle-message-inbox-item.unread{border-color:rgba(255,160,146,.35);background:rgba(255,160,146,.06)}' +
      '.pickle-message-inbox-item .msg-from{font-size:.82rem;font-weight:800;color:#73a5ff;margin-bottom:6px}' +
      '.pickle-message-inbox-item .msg-body{font-size:.85rem;color:#e4e4e7;line-height:1.45;word-break:keep-all}' +
      '.pickle-message-inbox-item .msg-footer{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px}' +
      '.pickle-message-inbox-item .msg-time{font-size:.7rem;color:#71717a;font-weight:700}' +
      '.pickle-message-inbox-item .msg-block-btn{border:1px solid rgba(255,160,146,.35);background:rgba(255,160,146,.1);color:#ffa092;border-radius:999px;padding:5px 10px;font-size:.68rem;font-weight:800;cursor:pointer;font-family:inherit;flex-shrink:0}' +
      '.pickle-message-inbox-item .msg-block-btn:active{transform:scale(.97)}' +
      '.pickle-message-inbox-empty{text-align:center;padding:32px 12px;color:#a1a1aa;font-size:.85rem;font-weight:600}' +
      '.pickle-message-toast{position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(12px);max-width:min(420px,calc(100vw - 32px));background:rgba(28,28,30,.96);color:#fcfcfc;border:1px solid rgba(74,222,128,.35);border-radius:14px;padding:12px 16px;font-size:.82rem;font-weight:700;line-height:1.45;text-align:center;z-index:10300;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;box-shadow:0 8px 24px rgba(0,0,0,.45);font-family:Pretendard,sans-serif}' +
      '.pickle-message-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}';
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

  async function openMessageModal() {
    mountMessageUi();

    var followBtn = document.getElementById('popupFollowBtn');
    var targetUid = followBtn ? followBtn.getAttribute('data-user-id') : currentTargetUserId;
    var targetNameEl = document.getElementById('popupUserName');
    var targetName = targetNameEl ? targetNameEl.textContent.trim() : '유저';

    if (!targetUid) {
      showToast('상대 유저의 고유 정보가 올바르지 않습니다.');
      return;
    }

    var user = await getCurrentUser();
    if (!user) {
      showToast(ERROR_MESSAGES.auth_required);
      return;
    }

    var level = await fetchSenderLevel(user.id);
    if (level < 2) {
      showToast(ERROR_MESSAGES.level_too_low);
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

    if (!targetUid) {
      var followBtn = document.getElementById('popupFollowBtn');
      targetUid = followBtn ? followBtn.getAttribute('data-user-id') : null;
    }

    try {
      var user = await getCurrentUser();
      var validation = await validateBeforeSend(user, targetUid, content);
      if (!validation.ok) {
        showToast(validation.message);
        return;
      }

      var sb = getClient();
      if (!sb) throw new Error('Supabase 클라이언트 없음');

      var rpc = await sb.rpc('send_pickle_message', {
        p_receiver_id: targetUid,
        p_content: content,
      });

      if (rpc.error) throw rpc.error;

      var errMsg = mapRpcResult(rpc.data);
      if (errMsg) {
        showToast(errMsg);
        return;
      }

      setLastSentMeta(content);

      var nickEl = document.getElementById('pickleMessageTargetNickname');
      var nick = nickEl ? nickEl.textContent.trim() : '상대방';
      showToast(nick + '님께 메시지가 전달되었습니다.');
      closeAllMessageUi();
    } catch (err) {
      console.error('[P!CKLE Messages] send failed', err);
      showToast('메시지 발송 오류가 발생했습니다.');
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

    var res = await sb
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('is_read', false);

    if (!res.error && res.count != null) return Number(res.count) || 0;
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
    await sb.from('messages').update({ is_read: true }).eq('id', messageId);
  }

  async function blockSender(blockerId, senderId) {
    if (!blockerId || !senderId || blockerId === senderId) return false;
    var sb = getClient();
    if (!sb) return false;

    var res = await sb.from('blocked_users').insert({
      blocker_id: blockerId,
      blocked_id: senderId,
    });

    if (res.error) {
      if (res.error.code === '23505') return true;
      console.warn('[P!CKLE Messages] block failed', res.error);
      showToast('차단 처리에 실패했습니다.');
      return false;
    }
    return true;
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
      .select('id, sender_id, content, created_at, is_read')
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

    var senderIds = rows
      .map(function (r) {
        return r.sender_id;
      })
      .filter(Boolean);
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
        var unread = row.is_read === false;
        return (
          '<li class="pickle-message-inbox-item' +
          (unread ? ' unread' : '') +
          '" data-message-id="' +
          escapeHtml(row.id) +
          '" data-sender-id="' +
          escapeHtml(row.sender_id) +
          '">' +
          '<div class="msg-from">' +
          escapeHtml(nickMap[row.sender_id] || '픽클러') +
          '</div>' +
          '<div class="msg-body">' +
          escapeHtml(row.content || '') +
          '</div>' +
          '<div class="msg-footer">' +
          '<span class="msg-time">' +
          escapeHtml(formatRelativeTime(row.created_at)) +
          '</span>' +
          '<button type="button" class="msg-block-btn" data-block-sender="' +
          escapeHtml(row.sender_id) +
          '">차단</button>' +
          '</div>' +
          '</li>'
        );
      })
      .join('');

    listEl.querySelectorAll('.pickle-message-inbox-item[data-message-id]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        if (e.target.closest('.msg-block-btn')) return;
        var mid = item.getAttribute('data-message-id');
        markMessageRead(mid).then(function () {
          item.classList.remove('unread');
          refreshInboxBadge(userId);
        });
      });
    });

    listEl.querySelectorAll('.msg-block-btn[data-block-sender]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var senderId = btn.getAttribute('data-block-sender');
        var nick =
          btn.closest('.pickle-message-inbox-item') &&
          btn.closest('.pickle-message-inbox-item').querySelector('.msg-from');
        var nickText = nick ? nick.textContent.trim() : '이 유저';
        if (!confirm(nickText + '님을 차단할까요?\n차단하면 앞으로 이 유저의 메세지를 받지 않습니다.')) {
          return;
        }
        blockSender(userId, senderId).then(function (ok) {
          if (!ok) return;
          showToast(nickText + '님을 차단했습니다.');
          var item = btn.closest('.pickle-message-inbox-item');
          if (item) item.remove();
          if (!listEl.querySelector('.pickle-message-inbox-item')) {
            listEl.innerHTML =
              '<li class="pickle-message-inbox-empty">받은 메시지가 없습니다.</li>';
          }
          refreshInboxBadge(userId);
        });
      });
    });
  }

  async function openMessageInbox() {
    mountMessageUi();
    var user = await getCurrentUser();
    if (!user) {
      showToast(ERROR_MESSAGES.auth_required);
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
    showToast: showToast,
    validateBeforeSend: validateBeforeSend,
    blockSender: blockSender,
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
