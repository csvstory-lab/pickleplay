/**
 * P!CKLE login.html — Supabase Auth 직접 연동
 * window.PICKLE_SUPABASE_CONFIG + PickleSupabaseBootstrap
 */
(function () {
  'use strict';

  var FEED_PATH = 'index.html';
  var PASSWORD_RULE_MSG = '비밀번호는 8자 이상, 영문/숫자/특수문자를 포함해야 합니다.';
  var STRONG_PASSWORD_RE =
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

  function bootstrap() {
    return window.PickleSupabaseBootstrap;
  }

  function getSupabaseClient() {
    var b = bootstrap();
    if (!b) {
      throw new Error(
        'Supabase 초기화 모듈이 없습니다. supabase-bootstrap.js 로드 순서를 확인해 주세요.'
      );
    }
    return b.getClient();
  }

  function guardConfigForUserAction() {
    var b = bootstrap();
    if (!b) {
      alert('인증 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      return false;
    }
    if (!b.isReady()) {
      alert(b.getErrorMessage());
      return false;
    }
    return true;
  }

  /** 로그인 성공 후 이동 — 기본 메인 피드(index.html) */
  function getRedirectAfterLogin() {
    return new URLSearchParams(window.location.search).get('redirect') || FEED_PATH;
  }

  /** OAuth 콜백 — Supabase 대시보드 Redirect URL과 일치해야 함 */
  function getOAuthRedirectTo() {
    return window.location.origin + '/index.html';
  }

  function isStrongPassword(password) {
    return STRONG_PASSWORD_RE.test(String(password || ''));
  }

  function formatAuthError(err) {
    var msg = (err && err.message) ? err.message : '요청에 실패했습니다.';
    if (/invalid login credentials/i.test(msg)) {
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    }
    if (/user already registered/i.test(msg)) {
      return '이미 가입된 이메일입니다. 로그인해 주세요.';
    }
    if (/password should be at least/i.test(msg)) {
      return PASSWORD_RULE_MSG;
    }
    if (/unable to validate email/i.test(msg)) {
      return '올바른 이메일 주소를 입력해 주세요.';
    }
    return msg;
  }

  function bindAuthScreens() {
    var loginView = document.getElementById('loginView');
    var signupView = document.getElementById('signupView');
    var goSignupBtn = document.getElementById('btnEmailSignup');
    var backToLoginBtn = document.getElementById('btnBackToLogin');

    function showLoginView() {
      if (loginView) loginView.classList.remove('is-hidden');
      if (signupView) signupView.classList.add('is-hidden');
      window.scrollTo(0, 0);
    }

    function showSignupView() {
      if (loginView) loginView.classList.add('is-hidden');
      if (signupView) signupView.classList.remove('is-hidden');
      window.scrollTo(0, 0);
      var firstField = document.getElementById('signupEmailInput');
      if (firstField) firstField.focus();
    }

    if (goSignupBtn) {
      goSignupBtn.addEventListener('click', function (e) {
        e.preventDefault();
        showSignupView();
      });
    }

    if (backToLoginBtn) {
      backToLoginBtn.addEventListener('click', function (e) {
        e.preventDefault();
        showLoginView();
      });
    }

    return {
      showLoginView: showLoginView,
      showSignupView: showSignupView,
    };
  }

  function bindLoginForm() {
    var loginBtn = document.getElementById('btnEmailLogin');
    var emailInput = document.getElementById('mainEmailInput');
    var pwInput = document.getElementById('mainPwInput');
    if (!loginBtn || !emailInput || !pwInput) return;

    function validateLogin() {
      var email = emailInput.value.trim();
      var password = pwInput.value;
      if (!email || email.indexOf('@') === -1) {
        alert('올바른 이메일 주소를 입력해 주세요.');
        emailInput.focus();
        return null;
      }
      if (!password) {
        alert('비밀번호를 입력해 주세요.');
        pwInput.focus();
        return null;
      }
      return { email: email, password: password };
    }

    loginBtn.addEventListener('click', async function () {
      if (!guardConfigForUserAction()) return;

      var creds = validateLogin();
      if (!creds) return;

      loginBtn.disabled = true;
      loginBtn.textContent = '로그인 중…';

      try {
        await signInWithEmail(creds.email, creds.password);
        window.location.href = getRedirectAfterLogin();
      } catch (err) {
        alert(formatAuthError(err));
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = '로그인';
      }
    });

    function onEnterSubmit(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        loginBtn.click();
      }
    }

    emailInput.addEventListener('keydown', onEnterSubmit);
    pwInput.addEventListener('keydown', onEnterSubmit);
  }

  function bindSignupForm(screenApi) {
    var signupBtn = document.getElementById('btnSignupSubmit');
    var emailInput = document.getElementById('signupEmailInput');
    var pwInput = document.getElementById('signupPwInput');
    var pwConfirmInput = document.getElementById('password-confirm');
    var age14Checkbox = document.getElementById('signup-age14');
    var marketingCheckbox = document.getElementById('signup-marketing');
    var ageGroupSelect = document.getElementById('signup-age-group');
    if (!signupBtn || !emailInput || !pwInput || !pwConfirmInput) return;

    function getSelectedGender() {
      var selected = document.querySelector('input[name="signupGender"]:checked');
      return selected ? selected.value : '';
    }

    function resetSignupFields() {
      emailInput.value = '';
      pwInput.value = '';
      pwConfirmInput.value = '';
      if (age14Checkbox) age14Checkbox.checked = false;
      if (marketingCheckbox) marketingCheckbox.checked = false;
      if (ageGroupSelect) ageGroupSelect.value = '';
      document.querySelectorAll('input[name="signupGender"]').forEach(function (el) {
        el.checked = false;
      });
    }

    function validateSignup() {
      var email = emailInput.value.trim();
      var password = pwInput.value;
      var passwordConfirm = pwConfirmInput.value;

      if (!email || email.indexOf('@') === -1) {
        alert('올바른 이메일 주소를 입력해 주세요.');
        emailInput.focus();
        return null;
      }
      if (!password) {
        alert('비밀번호를 입력해 주세요.');
        pwInput.focus();
        return null;
      }
      if (!isStrongPassword(password)) {
        alert(PASSWORD_RULE_MSG);
        pwInput.focus();
        return null;
      }
      if (password !== passwordConfirm) {
        alert('비밀번호 확인이 일치하지 않습니다.');
        pwConfirmInput.focus();
        return null;
      }
      if (!age14Checkbox || !age14Checkbox.checked) {
        alert('만 14세 이상임에 동의해 주세요.');
        if (age14Checkbox) age14Checkbox.focus();
        return null;
      }
      var gender = getSelectedGender();
      if (!gender) {
        alert('성별을 선택해 주세요.');
        return null;
      }
      var ageGroup = ageGroupSelect ? ageGroupSelect.value : '';
      if (!ageGroup) {
        alert('연령대를 선택해 주세요.');
        if (ageGroupSelect) ageGroupSelect.focus();
        return null;
      }

      return {
        email: email,
        password: password,
        gender: gender,
        ageGroup: ageGroup,
        marketingConsent: !!(marketingCheckbox && marketingCheckbox.checked),
      };
    }

    signupBtn.addEventListener('click', async function () {
      if (!guardConfigForUserAction()) return;

      var payload = validateSignup();
      if (!payload) return;

      signupBtn.disabled = true;
      signupBtn.textContent = '가입 처리 중…';

      try {
        await signUpWithEmail(payload.email, payload.password, {
          nickname: payload.email.split('@')[0],
          gender: payload.gender,
          age_group: payload.ageGroup,
          marketing_consent: payload.marketingConsent,
        });
        alert('가입 완료! 로그인해주세요.');
        resetSignupFields();
        if (screenApi && screenApi.showLoginView) {
          screenApi.showLoginView();
        }
      } catch (err) {
        alert(formatAuthError(err));
      } finally {
        signupBtn.disabled = false;
        signupBtn.textContent = '픽클 회원가입';
      }
    });

    function onEnterSubmit(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        signupBtn.click();
      }
    }

    pwInput.addEventListener('keydown', onEnterSubmit);
    pwConfirmInput.addEventListener('keydown', onEnterSubmit);
  }

  async function signInWithOAuth(provider) {
    if (!guardConfigForUserAction()) {
      throw new Error('Supabase config not ready');
    }
    if (provider !== 'kakao' && provider !== 'google') {
      throw new Error('지원하지 않는 로그인 방식입니다.');
    }
    var sb = getSupabaseClient();
    var result = await sb.auth.signInWithOAuth({
      provider: provider,
      options: {
        redirectTo: window.location.origin + '/index.html',
      },
    });

    if (result.error) throw result.error;
    return result.data;
  }

  async function signUpWithEmail(email, password, profileData) {
    var meta = profileData || {};
    var sb = getSupabaseClient();
    var result = await sb.auth.signUp({
      email: String(email).trim(),
      password: password,
      options: {
        data: {
          nickname: String(meta.nickname || '').trim() || '픽클러',
          signup_platform: 'email',
          gender: meta.gender || null,
          age_group: meta.age_group || null,
          marketing_consent: !!meta.marketing_consent,
        },
      },
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function signInWithEmail(email, password) {
    var sb = getSupabaseClient();
    var result = await sb.auth.signInWithPassword({
      email: String(email).trim(),
      password: password,
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function signUpOrSignIn(email, password, profileData) {
    try {
      return await signUpWithEmail(email, password, profileData);
    } catch (err) {
      var msg = err.message || '';
      if (/already|registered|exists|duplicate/i.test(msg)) {
        return await signInWithEmail(email, password);
      }
      throw err;
    }
  }

  async function initLoginPage() {
    var screenApi = bindAuthScreens();
    bindLoginForm();
    bindSignupForm(screenApi);

    var b = bootstrap();
    if (!b || !b.isReady()) {
      console.warn('[P!CKLE Login]', b ? b.getErrorMessage() : 'bootstrap missing');
      return;
    }

    try {
      var sb = getSupabaseClient();
      var sessionResult = await sb.auth.getSession();
      if (sessionResult.data.session && window.location.pathname.endsWith('login.html')) {
        window.location.replace(getRedirectAfterLogin());
      }
    } catch (err) {
      console.warn('[P!CKLE Login]', err);
    }
  }

  window.PickleLogin = {
    getSupabaseClient: getSupabaseClient,
    signInWithOAuth: signInWithOAuth,
    signUpWithEmail: signUpWithEmail,
    signInWithEmail: signInWithEmail,
    signUpOrSignIn: signUpOrSignIn,
    getRedirectAfterLogin: getRedirectAfterLogin,
    getOAuthRedirectTo: getOAuthRedirectTo,
    guardConfigForUserAction: guardConfigForUserAction,
    isStrongPassword: isStrongPassword,
    init: initLoginPage,
  };

  document.addEventListener('DOMContentLoaded', initLoginPage);
})();
