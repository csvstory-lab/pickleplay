/**
 * P!CKLE — 마이페이지 권리침해 / 게시중단 요청 (right_infringements)
 */
(function () {
  'use strict';

  var LEGAL_BUCKET = 'post_media';
  var LEGAL_MAX_BYTES = 10 * 1024 * 1024;
  var LEGAL_ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ];
  var submitting = false;

  function $(id) {
    return document.getElementById(id);
  }

  function getSupabaseClient() {
    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) {
      return window.supabaseClient;
    }
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    if (window.PickleMypage && window.PickleMypage.getSupabaseClient) {
      return window.PickleMypage.getSupabaseClient();
    }
    return null;
  }

  function sanitizeExt(filename) {
    var m = String(filename || '').match(/\.([a-zA-Z0-9]+)$/);
    var ext = (m && m[1] || 'bin').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'].includes(ext) ? ext : 'bin';
  }

  function validateLegalFile(file, label) {
    if (!file) throw new Error(label + ' 파일을 첨부해 주세요.');
    if (!LEGAL_ALLOWED_TYPES.includes(file.type)) {
      throw new Error(label + '은(는) JPG, PNG, WEBP, GIF, PDF만 가능합니다.');
    }
    if (file.size > LEGAL_MAX_BYTES) {
      throw new Error(label + '은(는) 10MB 이하만 업로드할 수 있습니다.');
    }
  }

  async function uploadLegalFile(sb, userId, file, kind) {
    validateLegalFile(file, kind === 'id' ? '신분증' : '위임장');
    var ext = sanitizeExt(file.name);
    var path = userId + '/legal/' + kind + '_' + Date.now() + '.' + ext;
    var uploadResult = await sb.storage.from(LEGAL_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (uploadResult.error) {
      throw new Error(
        uploadResult.error.message ||
          '증빙 파일 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.'
      );
    }
    var urlResult = sb.storage.from(LEGAL_BUCKET).getPublicUrl(path);
    return urlResult.data && urlResult.data.publicUrl ? urlResult.data.publicUrl : path;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function isValidPhone(value) {
    var digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }

  function resetLegalForm() {
    var requester = $('legalRequesterType');
    var reporterName = $('legalReporterName');
    var reporterPhone = $('legalReporterPhone');
    var reporterEmail = $('legalReporterEmail');
    var targetUrl = $('legalTargetUrl');
    var reason = $('legalReason');
    var detail = $('legalDetail');
    var idFile = $('legalIdFile');
    var powerFile = $('legalPowerFile');
    var agree = $('legalAgree');
    var idText = $('legalIdText');
    var powerText = $('legalPowerText');
    var idBox = $('legalIdBox');
    var powerBox = $('legalPowerBox');

    if (requester) requester.value = '';
    if (reporterName) reporterName.value = '';
    if (reporterPhone) reporterPhone.value = '';
    if (reporterEmail) reporterEmail.value = '';
    if (targetUrl) targetUrl.value = '';
    if (reason) reason.value = '';
    if (detail) detail.value = '';
    if (idFile) idFile.value = '';
    if (powerFile) powerFile.value = '';
    if (agree) agree.checked = false;
    if (idText) idText.textContent = '클릭하여 파일 업로드 (JPG, PNG, PDF)';
    if (powerText) powerText.textContent = '클릭하여 위임장 업로드';
    if (idBox) {
      idBox.style.borderColor = '';
      idBox.style.backgroundColor = '';
    }
    if (powerBox) {
      powerBox.style.borderColor = '';
      powerBox.style.backgroundColor = '';
    }
  }

  function setSubmitting(isBusy) {
    submitting = isBusy;
    var btn = $('btnSubmitLegal');
    if (!btn) return;
    btn.disabled = isBusy;
    btn.textContent = isBusy ? '접수 중…' : '법적 게시중단 요청서 제출';
    btn.style.opacity = isBusy ? '0.65' : '';
  }

  async function submitLegalForm() {
    if (submitting) return;

    var agreeEl = $('legalAgree');
    if (!agreeEl || !agreeEl.checked) {
      alert('법적 책임 동의 항목에 체크해 주셔야 접수가 가능합니다.');
      return;
    }

    var requesterEl = $('legalRequesterType');
    var reporterNameEl = $('legalReporterName');
    var reporterPhoneEl = $('legalReporterPhone');
    var reporterEmailEl = $('legalReporterEmail');
    var targetUrlEl = $('legalTargetUrl');
    var reasonEl = $('legalReason');
    var detailEl = $('legalDetail');
    var idFileEl = $('legalIdFile');
    var powerFileEl = $('legalPowerFile');

    var requesterType = requesterEl ? String(requesterEl.value || '').trim() : '';
    var reporterName = reporterNameEl ? String(reporterNameEl.value || '').trim() : '';
    var reporterPhone = reporterPhoneEl ? String(reporterPhoneEl.value || '').trim() : '';
    var reporterEmail = reporterEmailEl ? String(reporterEmailEl.value || '').trim() : '';
    var targetUrl = targetUrlEl ? String(targetUrlEl.value || '').trim() : '';
    var reason = reasonEl ? String(reasonEl.value || '').trim() : '';
    var detail = detailEl ? String(detailEl.value || '').trim() : '';
    var idFile = idFileEl && idFileEl.files && idFileEl.files[0] ? idFileEl.files[0] : null;
    var powerFile =
      powerFileEl && powerFileEl.files && powerFileEl.files[0] ? powerFileEl.files[0] : null;

    if (!requesterType) {
      alert('요청자 구분을 선택해 주세요.');
      return;
    }
    if (!reporterName || reporterName.length < 2) {
      alert('신고자 이름을 2자 이상 입력해 주세요.');
      return;
    }
    if (!reporterPhone || !isValidPhone(reporterPhone)) {
      alert('유효한 연락처(휴대폰)를 입력해 주세요.');
      return;
    }
    if (!reporterEmail || !isValidEmail(reporterEmail)) {
      alert('유효한 이메일 주소를 입력해 주세요.');
      return;
    }
    if (!targetUrl) {
      alert('침해 대상 게시물 URL을 입력해 주세요.');
      return;
    }
    if (!reason) {
      alert('침해 사유를 선택해 주세요.');
      return;
    }
    if (!detail || detail.length < 10) {
      alert('상세 소명 내용을 10자 이상 구체적으로 작성해 주세요.');
      return;
    }
    if (!idFile) {
      alert('신분증 또는 사업자등록증 사본을 첨부해 주세요.');
      return;
    }
    if (requesterType === 'agency' && !powerFile) {
      alert('법적 대리인은 위임장 첨부가 필수입니다.');
      return;
    }

    if (
      !confirm(
        '작성하신 소명 자료와 증빙 서류를 바탕으로 게시중단 요청을 접수하시겠습니까?\n접수 완료 시 관리자의 법무 검토가 시작됩니다.'
      )
    ) {
      return;
    }

    setSubmitting(true);

    try {
      var sb = getSupabaseClient();
      if (!sb) {
        throw new Error('서버 연결 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      }

      var user = null;
      if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
        var auth = await window.PickleAuth.ensureAuthenticated({ skipProfile: true });
        user = auth && auth.user ? auth.user : null;
      }
      if (!user && window.PickleMypage && window.PickleMypage.getCurrentUser) {
        user = window.PickleMypage.getCurrentUser();
      }
      if (!user) {
        var sessionRes = await sb.auth.getSession();
        user =
          sessionRes.data && sessionRes.data.session && sessionRes.data.session.user
            ? sessionRes.data.session.user
            : null;
      }
      if (!user || !user.id) {
        alert('로그인이 필요합니다. 로그인 후 다시 시도해 주세요.');
        if (window.PickleAuth && window.PickleAuth.goToLogin) {
          window.PickleAuth.goToLogin({ redirect: 'mypage.html' });
        }
        return;
      }

      var idDocUrl = await uploadLegalFile(sb, user.id, idFile, 'id');
      var powerUrl = null;
      if (powerFile) {
        powerUrl = await uploadLegalFile(sb, user.id, powerFile, 'power');
      }

      var payload = {
        user_id: user.id,
        reporter_name: reporterName,
        reporter_phone: reporterPhone,
        reporter_email: reporterEmail,
        requester_type: requesterType,
        target_url: targetUrl,
        reason: reason,
        detail: detail,
        id_file_url: idDocUrl,
        power_of_attorney_url: powerUrl,
        status: 'pending',
      };

      var insertResult = await sb.from('right_infringements').insert(payload).select('id').single();

      if (insertResult.error) {
        console.error('[P!CKLE Legal] insert failed', insertResult.error);
        throw new Error(
          insertResult.error.message ||
            '요청서 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'
        );
      }

      if (!insertResult.data || !insertResult.data.id) {
        throw new Error('요청서가 저장되지 않았습니다. 고객센터로 문의해 주세요.');
      }

      alert(
        '✅ 성공적으로 법적 검토 요청이 접수되었습니다.\n접수 번호: ' +
          String(insertResult.data.id).slice(0, 8).toUpperCase() +
          '\n처리 결과는 기재해주신 이메일로 회신됩니다.'
      );

      resetLegalForm();
      if (typeof closePanel === 'function') {
        closePanel('legalPanel');
      }
    } catch (err) {
      console.error('[P!CKLE Legal] submit failed', err);
      alert(
        err && err.message
          ? '접수 실패: ' + err.message
          : '요청서 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  window.submitLegalForm = submitLegalForm;

  window.PickleLegalReport = {
    submit: submitLegalForm,
    reset: resetLegalForm,
  };
})();
