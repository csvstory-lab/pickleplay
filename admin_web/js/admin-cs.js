/**
 * P!CKLE Admin — 고객센터 (CS) Supabase 연동
 */
(function () {
  'use strict';

  var dbClient = null;
  var inquiriesCache = [];
  var faqsCache = [];
  var currentInquiryId = null;
  var faqEditId = null;

  var INQUIRY_TYPE_LABELS = {
    general: '일반',
    account: '계정/로그인',
    point: '포인트/리워드',
    ad: '광고',
    report: '신고/제재',
    other: '기타',
  };

  function getSupabaseClient() {
    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) {
      return window.supabaseClient;
    }
    throw new Error('Supabase 클라이언트를 초기화할 수 없습니다. supabase-config.js 를 확인해 주세요.');
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    var now = new Date();
    var isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    if (isToday) return '오늘 ' + hh + ':' + mm;
    return (
      d.getFullYear() +
      '.' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '.' +
      String(d.getDate()).padStart(2, '0') +
      ' ' +
      hh +
      ':' +
      mm
    );
  }

  function inquiryTypeLabel(type) {
    return INQUIRY_TYPE_LABELS[type] || type || '일반';
  }

  function statusBadgeHtml(status) {
    if (status === 'pending') {
      return '<span class="status-badge status-pending">⚠️ 대기중</span>';
    }
    if (status === 'in_progress') {
      return '<span class="status-badge status-progress">처리중</span>';
    }
    if (status === 'completed') {
      return '<span class="status-badge status-completed">답변완료</span>';
    }
    return '<span class="status-badge">' + escapeHtml(status) + '</span>';
  }

  function sortInquiries(rows) {
    var order = { pending: 0, in_progress: 1, completed: 2 };
    return rows.slice().sort(function (a, b) {
      var sa = order[a.status] != null ? order[a.status] : 9;
      var sb = order[b.status] != null ? order[b.status] : 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  function formatStatNumber(value) {
    return Math.max(0, Number(value) || 0).toLocaleString('ko-KR');
  }

  function isAnsweredStatus(status) {
    return status === 'completed' || status === 'answered';
  }

  function isSameLocalDay(iso) {
    if (!iso) return false;
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    var now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  function getAnsweredAt(row) {
    return row.replied_at || row.updated_at || null;
  }

  function animateCountUp(el, target, durationMs) {
    if (!el) return;
    var safeTarget = Math.max(0, Number(target) || 0);
    var duration = durationMs || 900;
    var startTime = null;

    function tick(now) {
      if (!startTime) startTime = now;
      var progress = Math.min((now - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(safeTarget * eased);
      el.textContent = formatStatNumber(current);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = formatStatNumber(safeTarget);
      }
    }

    requestAnimationFrame(tick);
  }

  function animateDecimalCountUp(el, target, durationMs) {
    if (!el) return;
    var safeTarget = Math.max(0, Number(target) || 0);
    var duration = durationMs || 900;
    var startTime = null;

    function tick(now) {
      if (!startTime) startTime = now;
      var progress = Math.min((now - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = safeTarget * eased;
      el.textContent = current.toFixed(1);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = safeTarget.toFixed(1);
      }
    }

    requestAnimationFrame(tick);
  }

  function renderInquiryKpis(rows) {
    var totalEl = document.getElementById('kpiTotal');
    var pendingEl = document.getElementById('kpiPending');
    var todayEl = document.getElementById('kpiTodayAnswered');
    var avgNumEl = document.getElementById('kpiAvgTimeNum');

    var pending = rows.filter(function (r) {
      return r.status === 'pending';
    }).length;

    var todayDone = rows.filter(function (r) {
      if (!isAnsweredStatus(r.status)) return false;
      return isSameLocalDay(getAnsweredAt(r));
    }).length;

    var answeredRows = rows.filter(function (r) {
      return isAnsweredStatus(r.status) && r.created_at && getAnsweredAt(r);
    });

    var avgHours = 0;
    if (answeredRows.length > 0) {
      var totalMs = answeredRows.reduce(function (sum, r) {
        var start = new Date(r.created_at).getTime();
        var end = new Date(getAnsweredAt(r)).getTime();
        if (Number.isNaN(start) || Number.isNaN(end) || end < start) return sum;
        return sum + (end - start);
      }, 0);
      avgHours = totalMs / answeredRows.length / (1000 * 60 * 60);
    }

    animateCountUp(totalEl, rows.length);
    animateCountUp(pendingEl, pending);
    animateCountUp(todayEl, todayDone);
    animateDecimalCountUp(avgNumEl, avgHours);
  }

  function renderInquiryTable(rows) {
    var tbody = document.getElementById('inquiryTableBody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center; color:var(--text-sub); padding:40px;">등록된 1:1 문의가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = sortInquiries(rows)
      .map(function (row, index) {
        var user = row.users || {};
        var nickname = user.nickname || '익명 픽클러';
        var subInfo = user.signup_platform || row.user_id || '—';
        var rowStyle =
          row.status === 'pending' ? ' style="background-color: rgba(255, 51, 51, 0.05);"' : '';
        var btnLabel =
          row.status === 'completed'
            ? '상세보기'
            : row.status === 'pending'
              ? '답변하기'
              : '답변/처리';
        var btnClass = row.status === 'completed' ? 'btn-action' : 'btn-action primary';

        return (
          '<tr' +
          rowStyle +
          '>' +
          '<td style="text-align:center;">' +
          (index + 1) +
          '</td>' +
          '<td><span class="type-badge">[' +
          escapeHtml(inquiryTypeLabel(row.inquiry_type)) +
          ']</span> ' +
          '<span style="color:#fff; font-weight:600; cursor:pointer;" onclick="openInquiryModal(\'' +
          row.id +
          '\')">' +
          escapeHtml(row.title) +
          '</span></td>' +
          '<td><div style="font-weight:600; color:#fff;">' +
          escapeHtml(nickname) +
          '</div><div style="font-size:0.75rem; color:var(--text-sub);">' +
          escapeHtml(subInfo) +
          '</div></td>' +
          '<td style="font-size:0.8rem;">' +
          formatDateTime(row.created_at) +
          '</td>' +
          '<td style="text-align:center;">' +
          statusBadgeHtml(row.status) +
          '</td>' +
          '<td style="text-align:center;"><button class="' +
          btnClass +
          '" onclick="openInquiryModal(\'' +
          row.id +
          '\')">' +
          btnLabel +
          '</button></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function renderFaqTable(rows) {
    var tbody = document.getElementById('faqTableBody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center; color:var(--text-sub); padding:40px;">등록된 FAQ가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (row, index) {
        return (
          '<tr data-faq-id="' +
          row.id +
          '">' +
          '<td style="text-align:center;"><span class="drag-handle">≡</span> ' +
          (index + 1) +
          '</td>' +
          '<td><span style="color:var(--theme-gold); font-weight:600; font-size:0.85rem;">FAQ</span></td>' +
          '<td style="color:#fff; font-weight:600;">Q. ' +
          escapeHtml(row.question) +
          '</td>' +
          '<td style="text-align:center;"><label class="switch"><input type="checkbox" ' +
          (row.is_published ? 'checked' : '') +
          ' onchange="toggleFaqPublished(\'' +
          row.id +
          '\', this.checked)"><span class="slider"></span></label></td>' +
          '<td style="text-align:center;">' +
          '<button class="btn-action" style="margin-right:5px;" onclick="openFaqModal(\'edit\', \'' +
          row.id +
          '\')">수정</button>' +
          '<button class="btn-action" style="color:var(--neon-pink); border-color:var(--neon-pink);" onclick="deleteFaq(\'' +
          row.id +
          '\')">삭제</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  async function loadCSData() {
    try {
      var sb = getSupabaseClient();

      var inquiryResult = await sb
        .from('inquiries')
        .select(
          'id, user_id, inquiry_type, title, content, status, admin_reply, created_at, updated_at, replied_at, users:user_id ( nickname, signup_platform )'
        )
        .order('created_at', { ascending: false });

      if (inquiryResult.error) throw inquiryResult.error;

      var faqResult = await sb
        .from('faqs')
        .select('id, question, answer, display_order, is_published, created_at, updated_at')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (faqResult.error) throw faqResult.error;

      inquiriesCache = inquiryResult.data || [];
      faqsCache = faqResult.data || [];

      renderInquiryKpis(inquiriesCache);
      renderInquiryTable(inquiriesCache);
      renderFaqTable(faqsCache);

      await loadKakaoSettings();
    } catch (err) {
      console.error('[Admin CS] loadCSData 실패:', err);
      alert('CS 데이터를 불러오지 못했습니다.\n' + (err.message || String(err)));
    }
  }

  async function loadKakaoSettings() {
    var sb = getSupabaseClient();
    var result = await sb.from('cs_settings').select('*').eq('id', 1).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return;

    var row = result.data;
    var nameEl = document.getElementById('kakaoChannelName');
    var urlEl = document.getElementById('kakaoChannelUrl');
    var openEl = document.getElementById('kakaoWeekdayOpen');
    var closeEl = document.getElementById('kakaoWeekdayClose');
    var enabledEl = document.getElementById('kakaoChatbotPriority');

    if (nameEl) nameEl.value = row.kakao_channel_name || '';
    if (urlEl) urlEl.value = row.kakao_channel_url || '';
    if (openEl && row.weekday_open) openEl.value = String(row.weekday_open).slice(0, 5);
    if (closeEl && row.weekday_close) closeEl.value = String(row.weekday_close).slice(0, 5);
    if (enabledEl) enabledEl.checked = row.is_kakao_enabled !== false;
  }

  function findInquiry(id) {
    return inquiriesCache.find(function (row) {
      return row.id === id;
    });
  }

  function findFaq(id) {
    return faqsCache.find(function (row) {
      return row.id === id;
    });
  }

  window.switchTab = function (tabId, element) {
    document.querySelectorAll('.cs-tab').forEach(function (el) {
      el.classList.remove('active');
    });
    element.classList.add('active');
    document.querySelectorAll('.tab-view').forEach(function (view) {
      view.classList.remove('active');
    });
    document.getElementById(tabId + 'Tab').classList.add('active');
  };

  window.openInquiryModal = function (inquiryId) {
    var inquiry = findInquiry(inquiryId);
    if (!inquiry) {
      alert('문의 정보를 찾을 수 없습니다.');
      return;
    }

    currentInquiryId = inquiry.id;
    var modal = document.getElementById('inquiryModal');
    var title = document.getElementById('inquiryModalTitle');
    var type = document.getElementById('modalInquiryType');
    var subj = document.getElementById('modalInquiryTitle');
    var desc = document.getElementById('modalInquiryDesc');
    var user = document.getElementById('modalInquiryUser');
    var email = document.getElementById('modalInquiryEmail');
    var textarea = document.getElementById('replyTextarea');
    var btnSubmit = document.getElementById('btnSubmitReply');
    var btnToss = document.getElementById('btnTossToLegal');
    var replyDate = document.getElementById('replyDate');

    var userMeta = inquiry.users || {};
    type.textContent = '[' + inquiryTypeLabel(inquiry.inquiry_type) + ']';
    type.style.color = 'var(--text-sub)';
    subj.textContent = inquiry.title || '';
    desc.textContent = inquiry.content || '';
    user.textContent = userMeta.nickname || '익명 픽클러';
    email.textContent = userMeta.signup_platform || inquiry.user_id || '—';

    btnToss.style.display = inquiry.inquiry_type === 'report' ? 'inline-block' : 'none';
    btnToss.style.animation = '';

    if (inquiry.status === 'completed') {
      title.textContent = '✅ 1:1 문의 상세 내역 (답변완료)';
      textarea.value = inquiry.admin_reply || '';
      textarea.readOnly = true;
      btnSubmit.style.display = 'none';
      replyDate.style.display = inquiry.replied_at ? 'inline' : 'none';
      replyDate.textContent = inquiry.replied_at
        ? formatDateTime(inquiry.replied_at) + ' 답변완료'
        : '';
    } else {
      title.textContent = '💬 1:1 문의 답변하기';
      textarea.value = inquiry.admin_reply || '';
      textarea.readOnly = false;
      btnSubmit.style.display = 'inline-block';
      replyDate.style.display = 'none';
    }

    modal.style.display = 'flex';
  };

  window.closeInquiryModal = function () {
    document.getElementById('inquiryModal').style.display = 'none';
    currentInquiryId = null;
    var btnToss = document.getElementById('btnTossToLegal');
    if (btnToss) btnToss.style.animation = '';
  };

  window.tossToLegal = function () {
    if (
      !confirm(
        '해당 문의는 일반 CS로 처리 불가한 [권리침해] 건입니다.\n\n🚨 [신고 및 제재 관리] 부서의 권리침해(법무) 대기열로 즉시 이관하시겠습니까?'
      )
    ) {
      return;
    }
    alert('✅ 법무 부서 이관은 신고 관리 화면에서 처리해 주세요.');
    closeInquiryModal();
  };

  window.submitReply = async function () {
    if (!currentInquiryId) {
      alert('선택된 문의가 없습니다.');
      return;
    }

    var text = document.getElementById('replyTextarea').value.trim();
    if (!text) {
      alert('답변 내용을 작성해주세요.');
      return;
    }
    if (!confirm('작성하신 내용으로 답변을 저장하고 [답변완료] 처리하시겠습니까?')) return;

    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('inquiries')
        .update({
          admin_reply: text,
          status: 'completed',
        })
        .eq('id', currentInquiryId)
        .select('id')
        .maybeSingle();

      if (result.error) throw result.error;

      alert('✅ 답변이 저장되었으며, 처리 상태가 [답변완료]로 변경되었습니다.');
      closeInquiryModal();
      await loadCSData();
    } catch (err) {
      console.error('[Admin CS] submitReply 실패:', err);
      alert('답변 저장에 실패했습니다.\n' + (err.message || String(err)));
    }
  };

  window.saveKakaoSettings = async function () {
    var nameEl = document.getElementById('kakaoChannelName');
    var urlEl = document.getElementById('kakaoChannelUrl');
    var openEl = document.getElementById('kakaoWeekdayOpen');
    var closeEl = document.getElementById('kakaoWeekdayClose');
    var enabledEl = document.getElementById('kakaoChatbotPriority');

    var payload = {
      kakao_channel_name: nameEl ? nameEl.value.trim() : null,
      kakao_channel_url: urlEl ? urlEl.value.trim() : null,
      weekday_open: openEl && openEl.value ? openEl.value + ':00' : null,
      weekday_close: closeEl && closeEl.value ? closeEl.value + ':00' : null,
      is_kakao_enabled: enabledEl ? enabledEl.checked : true,
      operating_hours_summary:
        openEl && closeEl && openEl.value && closeEl.value
          ? '평일 ' + openEl.value + '~' + closeEl.value
          : null,
    };

    try {
      var sb = getSupabaseClient();
      var result = await sb.from('cs_settings').update(payload).eq('id', 1).select('id').maybeSingle();
      if (result.error) throw result.error;
      alert('✅ 카카오 비즈니스 센터 설정이 Supabase에 저장되었습니다.');
    } catch (err) {
      console.error('[Admin CS] saveKakaoSettings 실패:', err);
      alert('설정 저장에 실패했습니다.\n' + (err.message || String(err)));
    }
  };

  window.openFaqModal = function (mode, faqId) {
    faqEditId = mode === 'edit' ? faqId : null;
    var title = document.getElementById('faqModalTitle');
    var questionEl = document.getElementById('faqQuestionInput');
    var answerEl = document.getElementById('faqAnswerInput');
    var publishedEl = document.getElementById('faqPublishedInput');

    if (mode === 'new') {
      title.textContent = '➕ 새 FAQ 등록';
      if (questionEl) questionEl.value = '';
      if (answerEl) answerEl.value = '';
      if (publishedEl) publishedEl.checked = true;
    } else {
      var row = findFaq(faqId);
      if (!row) {
        alert('FAQ를 찾을 수 없습니다.');
        return;
      }
      title.textContent = '✏️ FAQ 수정';
      if (questionEl) questionEl.value = row.question || '';
      if (answerEl) answerEl.value = row.answer || '';
      if (publishedEl) publishedEl.checked = !!row.is_published;
    }

    document.getElementById('faqModal').style.display = 'flex';
  };

  window.closeFaqModal = function () {
    document.getElementById('faqModal').style.display = 'none';
    faqEditId = null;
  };

  window.saveFaq = async function () {
    var questionEl = document.getElementById('faqQuestionInput');
    var answerEl = document.getElementById('faqAnswerInput');
    var publishedEl = document.getElementById('faqPublishedInput');

    var question = questionEl ? questionEl.value.trim() : '';
    var answer = answerEl ? answerEl.value.trim() : '';
    var isPublished = publishedEl ? publishedEl.checked : true;

    if (!question || !answer) {
      alert('질문과 답변을 모두 입력해 주세요.');
      return;
    }

    try {
      var sb = getSupabaseClient();

      if (faqEditId) {
        var updateResult = await sb
          .from('faqs')
          .update({
            question: question,
            answer: answer,
            is_published: isPublished,
          })
          .eq('id', faqEditId)
          .select('id')
          .maybeSingle();
        if (updateResult.error) throw updateResult.error;
      } else {
        var maxOrder = faqsCache.reduce(function (max, row) {
          return Math.max(max, row.display_order || 0);
        }, 0);
        var insertResult = await sb
          .from('faqs')
          .insert({
            question: question,
            answer: answer,
            is_published: isPublished,
            display_order: maxOrder + 1,
          })
          .select('id')
          .maybeSingle();
        if (insertResult.error) throw insertResult.error;
      }

      alert('✅ FAQ가 Supabase에 저장되었습니다.');
      closeFaqModal();
      await loadCSData();
    } catch (err) {
      console.error('[Admin CS] saveFaq 실패:', err);
      alert('FAQ 저장에 실패했습니다.\n' + (err.message || String(err)));
    }
  };

  window.toggleFaqPublished = async function (faqId, checked) {
    try {
      var sb = getSupabaseClient();
      var result = await sb
        .from('faqs')
        .update({ is_published: !!checked })
        .eq('id', faqId);
      if (result.error) throw result.error;
      await loadCSData();
    } catch (err) {
      console.error('[Admin CS] toggleFaqPublished 실패:', err);
      alert('노출 상태 변경에 실패했습니다.');
      await loadCSData();
    }
  };

  window.deleteFaq = async function (faqId) {
    if (!confirm('이 FAQ를 삭제하시겠습니까?')) return;
    try {
      var sb = getSupabaseClient();
      var result = await sb.from('faqs').delete().eq('id', faqId);
      if (result.error) throw result.error;
      await loadCSData();
    } catch (err) {
      console.error('[Admin CS] deleteFaq 실패:', err);
      alert('FAQ 삭제에 실패했습니다.\n' + (err.message || String(err)));
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    loadCSData();
  });
})();
