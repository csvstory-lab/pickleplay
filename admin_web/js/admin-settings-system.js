/**
 * P!CKLE Admin — system_settings (general / point / penalty) load & save
 */
(function () {
  'use strict';

  var DEFAULT_GENERAL = {
    maintenance_enabled: false,
    maintenance_message:
      '안정적인 서비스 제공을 위해 시스템 점검 중입니다. (14:00~16:00)',
    auto_login_default: true,
    block_copy: true,
    block_drag: true,
    block_screenshot: false,
    favicon_url: '',
    og_image_url: '',
    meta_title: '픽클 (P!CKLE) - 도파민 터지는 투표 커뮤니티',
    meta_description: '세상의 모든 논쟁거리, 픽클에서 투표하고 이야기하세요!',
    meta_keywords: '투표,밸런스게임,도파민,픽클,이슈,커뮤니티,MBTI,연애상담,썰',
    naver_verification: 'naver-site-verification-1a2b3c',
    google_verification: 'google-site-verification-9x8y7z',
    sns_youtube: 'https://youtube.com/@pickle_official',
    sns_instagram: 'https://instagram.com/pickle_kr',
    sns_tiktok: 'https://tiktok.com/@pickle_kr',
    sns_kakao: 'http://pf.kakao.com/_xxxxxx',
    sns_blog: 'https://blog.naver.com/pickle_team',
    sns_facebook: '',
    app_store_url: 'https://apps.apple.com/app/id123456789',
    play_store_url: 'https://play.google.com/store/apps/details?id=com.pickle.app',
    company_name: '(주)픽클컴퍼니',
    ceo_name: '홍길동',
    business_number: '123-45-67890',
    mail_order_number: '제 2026-서울성동-1234호',
    company_address: '서울특별시 성동구 뚝섬로 123, 픽클타워 7층',
  };

  var DEFAULT_POINT = {
    engine_enabled: false,
    signup_welcome: 1000,
    referral_inviter: 500,
    referral_invitee: 500,
    event_participate: 10,
    event_share: 50,
    ugc_post: 5,
    ugc_comment: 1,
    honor_weekly_best: 500,
    honor_best_comment: 50,
    expiry_period: '1y',
    daily_cap: 1000,
  };

  var DEFAULT_PENALTY = {
    engine_enabled: false,
    report_blind_threshold: 10,
    ai_profanity_filter: true,
    ai_vision_threshold: 80,
    score_profanity_block: 10,
    score_ai_vision: 50,
    score_abuse: 10,
    score_spam: 30,
    score_illegal: 50,
    auto_30_points: 30,
    auto_30_action: 'suspend_3d',
    auto_50_points: 50,
    auto_50_action: 'suspend_7d',
    auto_100_points: 100,
  };

  var SYSTEM_ASSETS_BUCKET = 'system_assets';
  var SITE_META_JSON_PATH = 'site_meta.json';
  var DEFAULT_OG_PUBLIC =
    'https://jszgznanptutwxcsnrep.supabase.co/storage/v1/object/public/system_assets/og/default_og.png';
  var DEFAULT_FAVICON_PUBLIC =
    'https://jszgznanptutwxcsnrep.supabase.co/storage/v1/object/public/system_assets/favicon/default_favicon.png';
  var systemImageUploadsInitialized = false;
  var POINT_CONFIG_INVALIDATION_KEY = 'pickle_point_config_invalidation';

  var ASSET_UI = {
    favicon: {
      boxId: 'faviconUploadBox',
      hiddenId: 'gen_faviconUrl',
      fileInputId: 'faviconFileInput',
      folder: 'favicon',
      maxBytes: 1024 * 1024,
      defaultHtml:
        '<span style="font-size: 2rem;">🔸</span>' +
        '<span class="asset-placeholder">favicon.ico (클릭하여 변경)</span>',
    },
    og: {
      boxId: 'ogImageUploadBox',
      hiddenId: 'gen_ogImageUrl',
      fileInputId: 'ogImageFileInput',
      folder: 'og',
      maxBytes: 3 * 1024 * 1024,
      defaultHtml:
        '<span style="font-size: 1.5rem; margin-bottom:5px;">📸</span>' +
        '<span class="asset-placeholder">OG Image 업로드</span>' +
        '<span style="font-size:0.75rem; color:#a1a1aa; font-weight:normal;">* 권장해상도 : 1200x630<br>* 최소해상도 : 200x200 / 3MB 이하 / PNG 포맷 권장</span>',
    },
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  function sanitizeImageExt(filename) {
    var m = String(filename || '').match(/\.([a-zA-Z0-9]+)$/);
    var ext = (m && m[1] ? m[1] : 'png').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'ico'].indexOf(ext) !== -1 ? ext : 'png';
  }

  function validateSystemImageFile(file, type) {
    if (!file) throw new Error('이미지 파일이 없습니다.');
    var cfg = ASSET_UI[type];
    var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'];
    if (file.type && allowed.indexOf(file.type) === -1 && type !== 'favicon') {
      throw new Error('JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있습니다.');
    }
    if (cfg && file.size > cfg.maxBytes) {
      var mb = Math.round(cfg.maxBytes / (1024 * 1024));
      throw new Error('파일 크기는 ' + mb + 'MB 이하여야 합니다.');
    }
  }

  function renderSystemImagePreview(type, url, fileName) {
    var cfg = ASSET_UI[type];
    if (!cfg) return;
    var box = $(cfg.boxId);
    if (!box) return;

    box.classList.remove('is-uploading');
    if (url) {
      box.classList.add('has-preview');
      var label = fileName || String(url).split('/').pop() || '업로드 완료';
      box.innerHTML =
        '<img class="asset-preview" src="' +
        escapeAttr(url) +
        '" alt="">' +
        '<span class="asset-status" style="color:var(--neon-green);">✅ ' +
        escapeHtml(label) +
        '</span>' +
        '<span style="font-size:0.75rem;color:var(--text-sub);font-weight:600;">클릭하여 변경</span>';
      return;
    }

    box.classList.remove('has-preview');
    box.innerHTML = cfg.defaultHtml;
  }

  function setSystemImageUploading(type) {
    var cfg = ASSET_UI[type];
    var box = cfg ? $(cfg.boxId) : null;
    if (!box) return;
    box.classList.add('is-uploading');
    box.classList.remove('has-preview');
    box.innerHTML =
      '<span style="font-size:1.5rem;">⏳</span>' +
      '<span class="asset-status">업로드 중...</span>';
  }

  async function uploadSystemImage(file, type, getSupabaseClient) {
    var cfg = ASSET_UI[type];
    if (!cfg) throw new Error('지원하지 않는 이미지 유형입니다.');
    validateSystemImageFile(file, type);

    var sb = getSupabaseClient();
    var ext = sanitizeImageExt(file.name);
    var path;
    if (type === 'og') {
      path = 'og/default_og.' + ext;
    } else if (type === 'favicon') {
      path = 'favicon/default_favicon.' + ext;
    } else {
      path =
        cfg.folder +
        '/' +
        Date.now() +
        '_' +
        Math.random().toString(36).slice(2, 10) +
        '.' +
        ext;
    }

    var uploadRes = await sb.storage.from(SYSTEM_ASSETS_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: type === 'og' || type === 'favicon',
      contentType: file.type || 'image/png',
    });

    if (uploadRes.error) {
      if (/bucket/i.test(uploadRes.error.message || '')) {
        throw new Error(
          'system_assets 버킷이 없습니다. Supabase에서 PUBLIC 버킷 생성 후 62_storage_system_assets.sql 을 실행해 주세요.'
        );
      }
      throw uploadRes.error;
    }

    var urlRes = sb.storage.from(SYSTEM_ASSETS_BUCKET).getPublicUrl(path);
    return urlRes.data.publicUrl;
  }

  function initSystemImageUploads(getSupabaseClient) {
    Object.keys(ASSET_UI).forEach(function (type) {
      var cfg = ASSET_UI[type];
      var box = $(cfg.boxId);
      var fileInput = $(cfg.fileInputId);
      if (!box || !fileInput || box.dataset.uploadBound === '1') return;

      box.dataset.uploadBound = '1';
      box.addEventListener('click', function () {
        if (box.classList.contains('is-uploading')) return;
        fileInput.click();
      });
      box.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          box.click();
        }
      });

      fileInput.addEventListener('change', async function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;

        try {
          setSystemImageUploading(type);
          var publicUrl = await uploadSystemImage(file, type, getSupabaseClient);
          setInput(cfg.hiddenId, publicUrl);
          renderSystemImagePreview(type, publicUrl, file.name);
        } catch (err) {
          renderSystemImagePreview(type, getInput(cfg.hiddenId));
          alert('이미지 업로드 실패: ' + (err.message || String(err)));
        } finally {
          fileInput.value = '';
        }
      });
    });
  }

  function ensureSystemImageUploads(getSupabaseClient) {
    if (systemImageUploadsInitialized) return;
    initSystemImageUploads(getSupabaseClient);
    systemImageUploadsInitialized = true;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setCheckbox(id, value) {
    var el = $(id);
    if (el) el.checked = !!value;
  }

  function setInput(id, value) {
    var el = $(id);
    if (el) el.value = value == null ? '' : String(value);
  }

  function setSelect(id, value) {
    var el = $(id);
    if (!el) return;
    el.value = value == null ? '' : String(value);
  }

  function getCheckbox(id) {
    var el = $(id);
    return el ? !!el.checked : false;
  }

  function getInput(id) {
    var el = $(id);
    return el ? String(el.value || '').trim() : '';
  }

  function getNumber(id, fallback) {
    var n = parseInt(getInput(id), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function getSelect(id) {
    var el = $(id);
    return el ? String(el.value || '') : '';
  }

  function bindGeneralConfig(cfg) {
    var c = Object.assign({}, DEFAULT_GENERAL, cfg || {});
    setCheckbox('gen_maintenanceEnabled', c.maintenance_enabled);
    setInput('gen_maintenanceMessage', c.maintenance_message);
    setCheckbox('gen_autoLoginDefault', c.auto_login_default);
    setCheckbox('gen_blockCopy', c.block_copy);
    setCheckbox('gen_blockDrag', c.block_drag);
    setCheckbox('gen_blockScreenshot', c.block_screenshot);
    setInput('gen_faviconUrl', c.favicon_url);
    setInput('gen_ogImageUrl', c.og_image_url);
    renderSystemImagePreview('favicon', c.favicon_url);
    renderSystemImagePreview('og', c.og_image_url);
    setInput('gen_metaTitle', c.meta_title);
    setInput('gen_metaDescription', c.meta_description);
    setInput('gen_metaKeywords', c.meta_keywords);
    setInput('gen_naverVerification', c.naver_verification);
    setInput('gen_googleVerification', c.google_verification);
    setInput('gen_snsYoutube', c.sns_youtube);
    setInput('gen_snsInstagram', c.sns_instagram);
    setInput('gen_snsTiktok', c.sns_tiktok);
    setInput('gen_snsKakao', c.sns_kakao);
    setInput('gen_snsBlog', c.sns_blog);
    setInput('gen_snsFacebook', c.sns_facebook);
    setInput('gen_appStoreUrl', c.app_store_url);
    setInput('gen_playStoreUrl', c.play_store_url);
    setInput('gen_companyName', c.company_name);
    setInput('gen_ceoName', c.ceo_name);
    setInput('gen_businessNumber', c.business_number);
    setInput('gen_mailOrderNumber', c.mail_order_number);
    setInput('gen_companyAddress', c.company_address);
  }

  function collectGeneralConfig() {
    return {
      maintenance_enabled: getCheckbox('gen_maintenanceEnabled'),
      maintenance_message: getInput('gen_maintenanceMessage'),
      auto_login_default: getCheckbox('gen_autoLoginDefault'),
      block_copy: getCheckbox('gen_blockCopy'),
      block_drag: getCheckbox('gen_blockDrag'),
      block_screenshot: getCheckbox('gen_blockScreenshot'),
      favicon_url: getInput('gen_faviconUrl'),
      og_image_url: getInput('gen_ogImageUrl'),
      meta_title: getInput('gen_metaTitle'),
      meta_description: getInput('gen_metaDescription'),
      meta_keywords: getInput('gen_metaKeywords'),
      naver_verification: getInput('gen_naverVerification'),
      google_verification: getInput('gen_googleVerification'),
      sns_youtube: getInput('gen_snsYoutube'),
      sns_instagram: getInput('gen_snsInstagram'),
      sns_tiktok: getInput('gen_snsTiktok'),
      sns_kakao: getInput('gen_snsKakao'),
      sns_blog: getInput('gen_snsBlog'),
      sns_facebook: getInput('gen_snsFacebook'),
      app_store_url: getInput('gen_appStoreUrl'),
      play_store_url: getInput('gen_playStoreUrl'),
      company_name: getInput('gen_companyName'),
      ceo_name: getInput('gen_ceoName'),
      business_number: getInput('gen_businessNumber'),
      mail_order_number: getInput('gen_mailOrderNumber'),
      company_address: getInput('gen_companyAddress'),
    };
  }

  function bindPointConfig(cfg) {
    var c = Object.assign({}, DEFAULT_POINT, cfg || {});
    setCheckbox('masterToggle', c.engine_enabled);
    setInput('point_signupWelcome', c.signup_welcome);
    setInput('point_referralInviter', c.referral_inviter);
    setInput('point_referralInvitee', c.referral_invitee);
    setInput('point_eventParticipate', c.event_participate);
    setInput('point_eventShare', c.event_share);
    setInput('point_ugcPost', c.ugc_post);
    setInput('point_ugcComment', c.ugc_comment);
    setInput('point_honorWeeklyBest', c.honor_weekly_best);
    setInput('point_honorBestComment', c.honor_best_comment);
    setSelect('point_expiryPeriod', c.expiry_period);
    setInput('point_dailyCap', c.daily_cap);
  }

  function collectPointConfig() {
    return {
      engine_enabled: getCheckbox('masterToggle'),
      signup_welcome: getNumber('point_signupWelcome', DEFAULT_POINT.signup_welcome),
      referral_inviter: getNumber('point_referralInviter', DEFAULT_POINT.referral_inviter),
      referral_invitee: getNumber('point_referralInvitee', DEFAULT_POINT.referral_invitee),
      event_participate: getNumber('point_eventParticipate', DEFAULT_POINT.event_participate),
      event_share: getNumber('point_eventShare', DEFAULT_POINT.event_share),
      ugc_post: getNumber('point_ugcPost', DEFAULT_POINT.ugc_post),
      ugc_comment: getNumber('point_ugcComment', DEFAULT_POINT.ugc_comment),
      honor_weekly_best: getNumber('point_honorWeeklyBest', DEFAULT_POINT.honor_weekly_best),
      honor_best_comment: getNumber('point_honorBestComment', DEFAULT_POINT.honor_best_comment),
      expiry_period: getSelect('point_expiryPeriod') || DEFAULT_POINT.expiry_period,
      daily_cap: getNumber('point_dailyCap', DEFAULT_POINT.daily_cap),
    };
  }

  function bindPenaltyConfig(cfg) {
    var c = Object.assign({}, DEFAULT_PENALTY, cfg || {});
    setCheckbox('pen_engineEnabled', c.engine_enabled);
    setInput('pen_reportBlindThreshold', c.report_blind_threshold);
    setCheckbox('pen_aiProfanityFilter', c.ai_profanity_filter);
    setInput('pen_aiVisionThreshold', c.ai_vision_threshold);
    setInput('pen_scoreProfanityBlock', c.score_profanity_block);
    setInput('pen_scoreAiVision', c.score_ai_vision);
    setInput('pen_scoreAbuse', c.score_abuse);
    setInput('pen_scoreSpam', c.score_spam);
    setInput('pen_scoreIllegal', c.score_illegal);
    setInput('pen_auto30Points', c.auto_30_points);
    setSelect('pen_auto30Action', c.auto_30_action);
    setInput('pen_auto50Points', c.auto_50_points);
    setSelect('pen_auto50Action', c.auto_50_action);
    setInput('pen_auto100Points', c.auto_100_points);
  }

  function collectPenaltyConfig() {
    return {
      engine_enabled: getCheckbox('pen_engineEnabled'),
      report_blind_threshold: getNumber(
        'pen_reportBlindThreshold',
        DEFAULT_PENALTY.report_blind_threshold
      ),
      ai_profanity_filter: getCheckbox('pen_aiProfanityFilter'),
      ai_vision_threshold: getNumber('pen_aiVisionThreshold', DEFAULT_PENALTY.ai_vision_threshold),
      score_profanity_block: getNumber('pen_scoreProfanityBlock', DEFAULT_PENALTY.score_profanity_block),
      score_ai_vision: getNumber('pen_scoreAiVision', DEFAULT_PENALTY.score_ai_vision),
      score_abuse: getNumber('pen_scoreAbuse', DEFAULT_PENALTY.score_abuse),
      score_spam: getNumber('pen_scoreSpam', DEFAULT_PENALTY.score_spam),
      score_illegal: getNumber('pen_scoreIllegal', DEFAULT_PENALTY.score_illegal),
      auto_30_points: getNumber('pen_auto30Points', DEFAULT_PENALTY.auto_30_points),
      auto_30_action: getSelect('pen_auto30Action') || DEFAULT_PENALTY.auto_30_action,
      auto_50_points: getNumber('pen_auto50Points', DEFAULT_PENALTY.auto_50_points),
      auto_50_action: getSelect('pen_auto50Action') || DEFAULT_PENALTY.auto_50_action,
      auto_100_points: getNumber('pen_auto100Points', DEFAULT_PENALTY.auto_100_points),
    };
  }

  function bindAllSettings(row) {
    bindGeneralConfig(row && row.general_config);
    bindPointConfig(row && row.point_config);
    bindPenaltyConfig(row && row.penalty_config);
    if (typeof window.toggleEngine === 'function') {
      window.toggleEngine(true);
    }
  }

  function collectAllSettings() {
    return {
      general_config: collectGeneralConfig(),
      point_config: collectPointConfig(),
      penalty_config: collectPenaltyConfig(),
    };
  }

  async function loadSystemSettings(getSupabaseClient) {
    ensureSystemImageUploads(getSupabaseClient);
    var sb = getSupabaseClient();
    var res = await sb
      .from('system_settings')
      .select('general_config, point_config, penalty_config')
      .eq('id', 1)
      .single();

    if (res.error) throw res.error;
    bindAllSettings(res.data || {});
    return res.data;
  }

  function buildPublishedSiteMeta(generalConfig) {
    var c = Object.assign({}, DEFAULT_GENERAL, generalConfig || {});
    var ogImage = String(c.og_image_url || '').trim();
    var favicon = String(c.favicon_url || '').trim();
    return {
      meta_title: String(c.meta_title || DEFAULT_GENERAL.meta_title).trim(),
      meta_description: String(c.meta_description || DEFAULT_GENERAL.meta_description).trim(),
      meta_keywords: String(c.meta_keywords || DEFAULT_GENERAL.meta_keywords).trim(),
      og_image_url: ogImage || DEFAULT_OG_PUBLIC,
      favicon_url: favicon || DEFAULT_FAVICON_PUBLIC,
      site_origin: 'https://pickleplay.kr',
      updated_at: new Date().toISOString(),
      version: Date.now(),
    };
  }

  /**
   * 카카오 스크랩 봇·Edge Middleware용 site_meta.json 배포
   */
  async function publishSiteMetaJson(getSupabaseClient, generalConfig) {
    var sb = getSupabaseClient();
    var payload = buildPublishedSiteMeta(generalConfig);
    var body = JSON.stringify(payload, null, 2);
    var blob = new Blob([body], { type: 'application/json' });
    var res = await sb.storage.from(SYSTEM_ASSETS_BUCKET).upload(SITE_META_JSON_PATH, blob, {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '60',
    });

    if (res.error) {
      console.warn('[AdminSettings] site_meta.json 배포 실패:', res.error.message || res.error);
      return payload;
    }

    return payload;
  }

  async function saveSystemSettings(getSupabaseClient) {
    var sb = getSupabaseClient();
    var payload = collectAllSettings();
    var res = await sb
      .from('system_settings')
      .update({
        general_config: payload.general_config,
        point_config: payload.point_config,
        penalty_config: payload.penalty_config,
      })
      .eq('id', 1);

    if (res.error) throw res.error;

    var publishedMeta = await publishSiteMetaJson(getSupabaseClient, payload.general_config);
    notifyPointConfigChanged();
    notifyGeneralConfigChanged(publishedMeta && publishedMeta.version);
    return res.data;
  }

  var GENERAL_CONFIG_INVALIDATION_KEY = 'pickle_general_config_invalidation';

  function notifyGeneralConfigChanged(version) {
    try {
      localStorage.setItem(
        GENERAL_CONFIG_INVALIDATION_KEY,
        String(version != null ? version : Date.now())
      );
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * 포인트 설정 변경 시 유저 앱 캐시 무효화 (동일 브라우저·다른 탭 포함)
   */
  function notifyPointConfigChanged() {
    if (window.PicklePoints && typeof window.PicklePoints.clearPointConfigCache === 'function') {
      window.PicklePoints.clearPointConfigCache();
      return;
    }
    try {
      localStorage.setItem(POINT_CONFIG_INVALIDATION_KEY, String(Date.now()));
    } catch (e) {
      /* ignore */
    }
  }

  function setAdminModalBusy(busy) {
    var modal = document.getElementById('adminModal');
    if (!modal) return;
    modal.querySelectorAll('button, input, select').forEach(function (el) {
      if (busy) {
        el.dataset.wasDisabled = el.disabled ? '1' : '0';
        el.disabled = true;
      } else if (el.dataset.wasDisabled !== undefined) {
        el.disabled = el.dataset.wasDisabled === '1';
        delete el.dataset.wasDisabled;
      }
    });
  }

  function formatForcePasswordError(data, priorError) {
    if (!data) {
      return '❌ 비밀번호 변경 실패\n\n' + (priorError && priorError.message ? priorError.message : 'unknown');
    }
    var reason = data.reason || data.detail || '';
    var errText = data.error || data.message || '';
    if (reason === 'forbidden' || reason === 'super_required') {
      return '❌ 최고 관리자(super)만 비밀번호를 변경할 수 있습니다.';
    }
    if (reason === 'user_not_found') {
      return '❌ Supabase Auth에 해당 이메일 계정이 없습니다.\n신규 계정 발급으로 Auth 계정을 먼저 생성해 주세요.';
    }
    if (reason === 'invalid_password') {
      return '❌ 비밀번호는 8자 이상이어야 합니다.';
    }
    return '❌ 비밀번호 변경 실패\n\n' + (reason ? '[' + reason + '] ' : '') + errText;
  }

  /**
   * super 전용 — Edge Function → RPC fallback
   */
  async function forceAdminPasswordChange(getSupabaseClient, email, password) {
    var sb = getSupabaseClient();
    var targetEmail = String(email || '').trim().toLowerCase();
    var newPassword = String(password || '');

    if (!targetEmail || targetEmail.indexOf('@') === -1) {
      return { ok: false, message: '유효한 대상 이메일이 없습니다.' };
    }
    if (newPassword.length < 8) {
      return { ok: false, message: '새 비밀번호는 8자 이상이어야 합니다.' };
    }

    if (
      !confirm(
        '[' +
          targetEmail +
          '] 계정 비밀번호를\n즉시 변경하시겠습니까?\n\n• 이메일 발송 없음\n• OAuth 계정 포함'
      )
    ) {
      return { ok: false, cancelled: true };
    }

    console.log('[AdminSettings] forceAdminPasswordChange:', targetEmail);

    var invokeRes = await sb.functions.invoke('admin-force-password', {
      body: { email: targetEmail, password: newPassword },
    });

    if (!invokeRes.error && invokeRes.data && invokeRes.data.ok === true) {
      console.log('[AdminSettings] ✅ Edge Function 성공:', invokeRes.data);
      return {
        ok: true,
        via: 'edge_function',
        data: invokeRes.data,
        message:
          '✅ 비밀번호가 즉시 변경되었습니다.\n\n• 계정: ' +
          targetEmail +
          '\n• 입력한 새 비밀번호로 admin_login.html에서 로그인해 보세요.',
      };
    }

    console.warn('[AdminSettings] Edge Function 실패 — RPC fallback:', invokeRes.error || invokeRes.data);

    var rpcRes = await sb.rpc('admin_force_set_password', {
      p_email: targetEmail,
      p_password: newPassword,
    });

    if (rpcRes.error) {
      return {
        ok: false,
        message: '❌ 비밀번호 변경 실패\n\n' + (rpcRes.error.message || String(rpcRes.error)),
      };
    }

    if (!rpcRes.data || rpcRes.data.ok !== true) {
      return {
        ok: false,
        message: formatForcePasswordError(rpcRes.data, invokeRes.error),
      };
    }

    console.log('[AdminSettings] ✅ RPC fallback 성공:', rpcRes.data);
    return {
      ok: true,
      via: 'rpc',
      data: rpcRes.data,
      message:
        '✅ 비밀번호가 즉시 변경되었습니다.\n\n• 계정: ' +
        targetEmail +
        '\n• 입력한 새 비밀번호로 admin_login.html에서 로그인해 보세요.\n\n(RPC fallback 적용)',
    };
  }

  /**
   * 계정 수정 모달 — 비밀번호 즉시 변경 버튼 바인딩
   */
  function initAdminPasswordChange(getSupabaseClient, getTargetEmail) {
    var btn = document.getElementById('btnAdminPasswordChange');
    var input = document.getElementById('admNewPassword');
    var modal = document.getElementById('adminModal');

    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    if (modal) {
      modal.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    }

    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();

      var targetEmail = typeof getTargetEmail === 'function' ? getTargetEmail() : null;
      if (!targetEmail) {
        alert('수정 중인 계정 이메일이 없습니다.');
        return;
      }

      var password = input ? input.value : '';
      if (password.length < 8) {
        alert('새 비밀번호는 8자 이상이어야 합니다.');
        return;
      }

      var prevLabel = btn.textContent;
      btn.textContent = '변경 중…';
      setAdminModalBusy(true);

      try {
        var result = await forceAdminPasswordChange(getSupabaseClient, targetEmail, password);
        if (result.cancelled) return;
        alert(result.message || (result.ok ? '✅ 완료' : '❌ 실패'));
        if (result.ok && input) input.value = '';
      } catch (err) {
        console.error('[AdminSettings] initAdminPasswordChange', err);
        alert('❌ 오류: ' + (err.message || String(err)));
      } finally {
        setAdminModalBusy(false);
        btn.textContent = prevLabel || '비밀번호 즉시 변경';
      }
    });
  }

  window.loadSystemSettings = loadSystemSettings;
  window.uploadSystemImage = uploadSystemImage;
  window.AdminSettingsSystem = {
    load: loadSystemSettings,
    save: saveSystemSettings,
    bindAll: bindAllSettings,
    collectAll: collectAllSettings,
    uploadSystemImage: uploadSystemImage,
    renderSystemImagePreview: renderSystemImagePreview,
    notifyPointConfigChanged: notifyPointConfigChanged,
    notifyGeneralConfigChanged: notifyGeneralConfigChanged,
    publishSiteMetaJson: publishSiteMetaJson,
    buildPublishedSiteMeta: buildPublishedSiteMeta,
    forceAdminPasswordChange: forceAdminPasswordChange,
    initAdminPasswordChange: initAdminPasswordChange,
  };
})();
