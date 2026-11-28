/**
 * P!CKLE — 약관·개인정보 동의 확인 팝업
 * 소셜(카카오/구글) 로그인 회원과 동의 기록이 없는 기존 회원에게 한 번 보여준다.
 * SQL: pickle_consent_138.sql (pickle_my_consent_status / pickle_record_consent)
 * SQL 이 아직 없거나 오류가 나면 아무것도 하지 않는다(서비스 이용을 막지 않음).
 */
(function () {
  'use strict';

  var ROOT_ID = 'pickleConsentRoot';
  var OK_FLAG_PREFIX = 'pk_consent_ok_';
  var running = false;

  function getClient() {
    try {
      if (typeof window.getPickleSupabaseClient === 'function') return window.getPickleSupabaseClient();
      if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.isReady()) {
        return window.PickleSupabaseBootstrap.getClient();
      }
      if (window.PickleSupabase && window.PickleSupabase.getClient) return window.PickleSupabase.getClient();
      if (window.supabaseClient) return window.supabaseClient;
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function flagGet(uid) {
    try {
      return window.sessionStorage.getItem(OK_FLAG_PREFIX + uid) === '1';
    } catch (e) {
      return false;
    }
  }

  function flagSet(uid) {
    try {
      window.sessionStorage.setItem(OK_FLAG_PREFIX + uid, '1');
    } catch (e) {
      /* ignore */
    }
  }

  function policyUrl(type) {
    return 'policy.html?type=' + type;
  }

  function buildModal(onAgree, onDecline) {
    var wrap = document.createElement('div');
    wrap.id = ROOT_ID;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'pickleConsentTitle');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
      'padding:20px;background:rgba(0,0,0,0.85);';

    var rowStyle =
      'display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;' +
      'background:#09090b;border:1px solid #27272a;cursor:pointer;font-size:0.88rem;color:#e4e4e7;line-height:1.45;';
    var linkStyle = 'color:#73A5FF;text-decoration:underline;font-weight:700;margin-left:4px;white-space:nowrap;';

    wrap.innerHTML =
      '<div style="width:100%;max-width:400px;background:#111113;border:1px solid #27272a;border-radius:18px;padding:24px 20px;box-sizing:border-box;">' +
      '<div id="pickleConsentTitle" style="font-size:1.1rem;font-weight:900;color:#fff;margin-bottom:6px;">서비스 이용 동의 확인</div>' +
      '<div style="font-size:0.82rem;color:#a1a1aa;line-height:1.55;margin-bottom:16px;">' +
      '픽클을 계속 이용하시려면 아래 내용에 동의해 주세요. 동의하신 시각과 약관 버전이 기록됩니다.</div>' +
      '<label style="' + rowStyle + 'margin-bottom:10px;border-color:#3f3f46;font-weight:800;">' +
      '<input type="checkbox" id="pickleConsentAll" style="margin-top:3px;"><span>전체 동의</span></label>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">' +
      '<label style="' + rowStyle + '"><input type="checkbox" class="pickleConsentItem" id="pickleConsentAge" style="margin-top:3px;">' +
      '<span><b style="color:#FF85A1;">[필수]</b> 만 14세 이상입니다.</span></label>' +
      '<label style="' + rowStyle + '"><input type="checkbox" class="pickleConsentItem" id="pickleConsentTerms" style="margin-top:3px;">' +
      '<span><b style="color:#FF85A1;">[필수]</b> 이용약관에 동의합니다.' +
      '<a href="' + policyUrl('terms') + '" target="_blank" rel="noopener" style="' + linkStyle + '">보기</a></span></label>' +
      '<label style="' + rowStyle + '"><input type="checkbox" class="pickleConsentItem" id="pickleConsentPrivacy" style="margin-top:3px;">' +
      '<span><b style="color:#FF85A1;">[필수]</b> 개인정보 수집·이용에 동의합니다.' +
      '<a href="' + policyUrl('privacy') + '" target="_blank" rel="noopener" style="' + linkStyle + '">보기</a></span></label>' +
      '</div>' +
      '<div id="pickleConsentMsg" style="min-height:18px;font-size:0.8rem;color:#ff6b6b;margin-bottom:8px;"></div>' +
      '<button type="button" id="pickleConsentSubmit" disabled style="width:100%;padding:14px;border:none;border-radius:12px;' +
      'background:#39ff14;color:#09090b;font-weight:900;font-size:0.95rem;cursor:pointer;opacity:0.4;margin-bottom:8px;">동의하고 계속하기</button>' +
      '<button type="button" id="pickleConsentDecline" style="width:100%;padding:12px;border:none;border-radius:12px;' +
      'background:none;color:#a1a1aa;font-weight:700;font-size:0.82rem;cursor:pointer;">동의하지 않고 로그아웃</button>' +
      '</div>';

    document.body.appendChild(wrap);

    var all = wrap.querySelector('#pickleConsentAll');
    var items = Array.prototype.slice.call(wrap.querySelectorAll('.pickleConsentItem'));
    var submit = wrap.querySelector('#pickleConsentSubmit');

    function refresh() {
      var allChecked = items.every(function (i) { return i.checked; });
      all.checked = allChecked;
      submit.disabled = !allChecked;
      submit.style.opacity = allChecked ? '1' : '0.4';
    }

    all.addEventListener('change', function () {
      items.forEach(function (i) { i.checked = all.checked; });
      refresh();
    });
    items.forEach(function (i) { i.addEventListener('change', refresh); });

    submit.addEventListener('click', function () {
      if (submit.disabled) return;
      onAgree(wrap);
    });
    wrap.querySelector('#pickleConsentDecline').addEventListener('click', function () {
      onDecline(wrap);
    });

    return wrap;
  }

  function setMsg(wrap, text) {
    var el = wrap.querySelector('#pickleConsentMsg');
    if (el) el.textContent = text || '';
  }

  function explain(err) {
    var m = (err && err.message) || '';
    if (/profile_not_ready/.test(m)) return '프로필을 준비하는 중입니다. 잠시 후 다시 눌러 주세요.';
    if (/login_required/.test(m)) return '로그인이 필요합니다. 다시 로그인해 주세요.';
    return '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  /**
   * 로그인한 회원에게 동의 기록이 없으면 팝업을 띄운다.
   * @returns {Promise<'skipped'|'shown'|'agreed'>}
   */
  async function ensure() {
    if (running || document.getElementById(ROOT_ID)) return 'skipped';
    running = true;
    try {
      var sb = getClient();
      if (!sb || !sb.auth) return 'skipped';

      var sess = await sb.auth.getSession();
      var user = sess && sess.data && sess.data.session && sess.data.session.user;
      if (!user) return 'skipped';
      if (flagGet(user.id)) return 'skipped';

      var res = await sb.rpc('pickle_my_consent_status');
      if (res.error || !res.data) return 'skipped'; // SQL 미설치 등 → 이용을 막지 않음
      if (!res.data.needs_consent) {
        flagSet(user.id);
        return 'skipped';
      }

      return await new Promise(function (resolve) {
        var busy = false;
        document.body.style.overflow = 'hidden';

        buildModal(
          async function onAgree(wrap) {
            if (busy) return;
            busy = true;
            var btn = wrap.querySelector('#pickleConsentSubmit');
            btn.disabled = true;
            btn.textContent = '저장 중...';
            setMsg(wrap, '');
            try {
              var r = await sb.rpc('pickle_record_consent', { p_over14: true });
              if (r.error) throw r.error;
              flagSet(user.id);
              document.body.style.overflow = '';
              wrap.remove();
              resolve('agreed');
            } catch (err) {
              busy = false;
              btn.disabled = false;
              btn.textContent = '동의하고 계속하기';
              setMsg(wrap, explain(err));
            }
          },
          async function onDecline(wrap) {
            if (busy) return;
            busy = true;
            try {
              await sb.auth.signOut();
            } catch (e) {
              /* ignore */
            }
            document.body.style.overflow = '';
            wrap.remove();
            window.location.href = 'login.html';
            resolve('shown');
          }
        );
      });
    } catch (e) {
      return 'skipped';
    } finally {
      running = false;
    }
  }

  window.PickleConsent = { ensure: ensure };
})();
