/**
 * P!CKLE — 회원 탈퇴 (delete_user_account RPC)
 */
(function () {
  'use strict';

  var WITHDRAW_CONFIRM_MSG = '탈퇴 시 모든 기록이 삭제됩니다. 진행하시겠습니까?';
  var WITHDRAW_ERROR_MSG =
    '탈퇴 처리 중 문제가 발생했습니다. 관리자에게 문의해주세요.';
  var WITHDRAW_SUCCESS_MSG = '탈퇴 처리가 완료되었습니다';

  function getClient() {
    if (window.PickleAuth && window.PickleAuth.getClient) {
      return window.PickleAuth.getClient();
    }
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.isReady()) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    throw new Error('Supabase 클라이언트를 사용할 수 없습니다.');
  }

  /**
   * RPC 성공 후에만 signOut 수행
   */
  async function deleteUserAccount() {
    var sb = getClient();
    var rpcResult = await sb.rpc('delete_user_account');

    if (rpcResult.error) {
      throw rpcResult.error;
    }

    var signOutResult = await sb.auth.signOut();
    if (signOutResult.error) {
      console.warn('[P!CKLE Account] signOut after delete', signOutResult.error);
    }

    return true;
  }

  async function handleWithdrawClick(options) {
    var opts = options || {};

    if (!confirm(opts.confirmMessage || WITHDRAW_CONFIRM_MSG)) {
      return false;
    }

    var triggerEl = opts.triggerEl || null;
    if (triggerEl) {
      triggerEl.style.pointerEvents = 'none';
      triggerEl.dataset.withdrawBusy = '1';
    }

    try {
      await deleteUserAccount();
      alert(opts.successMessage || WITHDRAW_SUCCESS_MSG);
      window.location.href = opts.redirectTo || 'index.html';
      return true;
    } catch (err) {
      console.error('[P!CKLE Account] withdraw failed', err);
      alert(opts.errorMessage || WITHDRAW_ERROR_MSG);
      return false;
    } finally {
      if (triggerEl) {
        triggerEl.style.pointerEvents = '';
        delete triggerEl.dataset.withdrawBusy;
      }
    }
  }

  function bindWithdrawButton(buttonId, options) {
    var btn = document.getElementById(buttonId);
    if (!btn || btn.dataset.withdrawBound === '1') return;

    btn.dataset.withdrawBound = '1';
    btn.addEventListener('click', function () {
      if (btn.dataset.withdrawBusy === '1') return;
      handleWithdrawClick(
        Object.assign({}, options || {}, {
          triggerEl: btn,
        })
      );
    });
  }

  window.PickleAccount = {
    deleteUserAccount: deleteUserAccount,
    handleWithdrawClick: handleWithdrawClick,
    bindWithdrawButton: bindWithdrawButton,
  };
})();
