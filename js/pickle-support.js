/**
 * P!CKLE — 고객센터: 1:1 문의 접수(inquiries 저장) + FAQ(faqs 테이블 연동)
 * 사용: settings.html / mypage.html 의 #faqArea, #inquiryArea
 */
(function () {
  'use strict';

  var TYPE_MAP = {
    account: { type: 'account', label: '계정/로그인' },
    bug: { type: 'other', label: '오류/버그 제보' },
    event: { type: 'point', label: '이벤트/리워드' },
    penalty: { type: 'report', label: '신고/제재 이의제기' },
    suggest: { type: 'other', label: '카테고리 제안' },
  };

  function getClient() {
    var b = window.PickleSupabaseBootstrap;
    if (!b) throw new Error('Supabase 초기화 모듈이 없습니다.');
    return b.getClient();
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function submitInquiry(btn) {
    var area = btn && btn.closest ? btn.closest('#inquiryArea') : document.getElementById('inquiryArea');
    if (!area) return;

    var select = area.querySelector('select');
    var emailInput = area.querySelector('input[type="email"]');
    var textarea = area.querySelector('textarea');
    var content = textarea ? textarea.value.trim() : '';
    var replyEmail = emailInput ? emailInput.value.trim() : '';
    var picked = select && select.value ? TYPE_MAP[select.value] : null;

    if (select && !select.value) {
      alert('문의 유형을 선택해 주세요.');
      return;
    }
    if (content.length < 5) {
      alert('문의 내용을 5자 이상 입력해 주세요.');
      return;
    }
    if (replyEmail && replyEmail.indexOf('@') === -1) {
      alert('답변 받을 이메일 형식을 확인해 주세요.');
      return;
    }

    var original = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '접수 중...';
    }

    try {
      var sb = getClient();
      var sessionRes = await sb.auth.getSession();
      var user = sessionRes && sessionRes.data && sessionRes.data.session
        ? sessionRes.data.session.user
        : null;
      if (!user) {
        alert('로그인이 필요합니다.');
        return;
      }

      var label = picked ? picked.label : '일반';
      var fullContent = content + (replyEmail ? '\n\n[답변 받을 이메일] ' + replyEmail : '');
      var title = '[' + label + '] ' + content.replace(/\s+/g, ' ').slice(0, 30);

      var res = await sb.from('inquiries').insert({
        user_id: user.id,
        inquiry_type: picked ? picked.type : 'general',
        title: title,
        content: fullContent,
      });
      if (res.error) throw res.error;

      alert('문의가 접수되었습니다.\n담당자 확인 후 답변을 보내드립니다.');
      if (textarea) textarea.value = '';
      if (select) select.selectedIndex = 0;
      if (typeof window.closePanel === 'function' && document.getElementById('supportPanel')) {
        window.closePanel('supportPanel');
      }
    } catch (err) {
      console.error('[PickleSupport] 문의 접수 실패', err);
      alert('문의 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original;
      }
    }
  }

  // 관리자 [고객센터 > FAQ] 에서 게시한 항목으로 교체 (게시된 FAQ 가 없으면 화면의 기본 문구 유지)
  async function loadFaqs() {
    var area = document.getElementById('faqArea');
    if (!area) return;
    try {
      var res = await getClient()
        .from('faqs')
        .select('id, question, answer, display_order')
        .eq('is_published', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (res.error || !res.data || !res.data.length) return;

      area.innerHTML = res.data
        .map(function (f) {
          return (
            '<div class="notice-item" onclick="toggleNotice(this)">' +
            '<div class="notice-header-bar">' +
            '<div class="notice-item-title">' + escapeHtml(f.question) + '</div>' +
            '<span class="chevron-icon">▼</span>' +
            '</div>' +
            '<div class="notice-body"><div class="notice-body-inner" style="white-space:pre-wrap;">' +
            escapeHtml(f.answer) +
            '</div></div></div>'
          );
        })
        .join('');
    } catch (err) {
      console.warn('[PickleSupport] FAQ 로드 실패(기본 문구 유지)', err);
    }
  }

  // 관리자 [고객센터 > 카카오톡 연동 설정] 값으로 "카카오톡 상담" 버튼 노출
  async function loadKakaoButton() {
    var host = document.getElementById('faqArea');
    host = host && host.parentElement;
    if (!host || document.getElementById('pickleKakaoCsBtn')) return;
    try {
      var res = await getClient()
        .from('cs_settings')
        .select('kakao_channel_name, kakao_channel_url, is_kakao_enabled')
        .eq('id', 1)
        .maybeSingle();
      var row = res && res.data;
      if (!row || row.is_kakao_enabled === false) return;
      var url = String(row.kakao_channel_url || '').trim();
      if (!/^https?:\/\//i.test(url) || /_x{4,}/i.test(url)) return;

      var a = document.createElement('a');
      a.id = 'pickleKakaoCsBtn';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '🟡 카카오톡 ' + (row.kakao_channel_name || '채널') + ' 로 상담하기';
      a.style.cssText =
        'display:block;margin-top:16px;padding:14px;text-align:center;background:#FEE500;color:#000;' +
        'font-weight:900;border-radius:8px;text-decoration:none;font-size:0.95rem;';
      host.appendChild(a);
    } catch (err) {
      console.warn('[PickleSupport] 카카오 상담 설정 로드 실패', err);
    }
  }

  window.PickleSupport = { submitInquiry: submitInquiry, loadFaqs: loadFaqs, loadKakaoButton: loadKakaoButton };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      loadFaqs();
      loadKakaoButton();
    });
  } else {
    loadFaqs();
    loadKakaoButton();
  }
})();
