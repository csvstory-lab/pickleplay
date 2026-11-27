/**
 * P!CKLE Admin — 고객센터 > 공지사항 관리 (notices 테이블)
 * 유저 앱(설정 · 마이페이지 > 공지사항)에 노출됩니다. (SQL: pickle_notices_116.sql)
 */
(function () {
  'use strict';

  var cache = [];
  var editId = null;
  var CAT = {
    notice: '📢 공지',
    update: '✨ 업데이트',
    event: '🎁 이벤트',
    maintenance: '🛠 점검',
  };

  function sb() {
    if (typeof window.getPickleSupabaseClient === 'function') return window.getPickleSupabaseClient();
    if (window.supabaseClient) return window.supabaseClient;
    throw new Error('Supabase 클라이언트를 초기화할 수 없습니다.');
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmt(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '—';
    var p = function (n) {
      return String(n).padStart(2, '0');
    };
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // <input type="datetime-local"> 값(로컬 시각) ↔ ISO
  function toLocalInput(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '';
    var p = function (n) {
      return String(n).padStart(2, '0');
    };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function render() {
    var tbody = document.getElementById('noticeTableBody');
    if (!tbody) return;
    if (!cache.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center; color:var(--text-sub); padding:40px;">등록된 공지사항이 없습니다. 오른쪽 위 [새 공지 작성]으로 등록하세요.</td></tr>';
      return;
    }
    var now = Date.now();
    tbody.innerHTML = cache
      .map(function (r) {
        var scheduled = r.is_published && new Date(r.published_at).getTime() > now;
        var state = scheduled ? '<div style="font-size:0.72rem;color:var(--theme-gold);">⏰ 예약 대기</div>' : '';
        return (
          '<tr>' +
          '<td><span style="font-weight:600;font-size:0.85rem;">' + esc(CAT[r.category] || r.category) + '</span></td>' +
          '<td style="color:#fff;font-weight:600;">' + (r.is_pinned ? '📌 ' : '') + esc(r.title) + '</td>' +
          '<td style="color:var(--text-sub);font-size:0.85rem;">' + esc(fmt(r.published_at)) + state + '</td>' +
          '<td style="text-align:center;"><label class="switch"><input type="checkbox" ' +
          (r.is_published ? 'checked' : '') +
          ' onchange="toggleNoticePublished(\'' + r.id + '\', this.checked)"><span class="slider"></span></label></td>' +
          '<td style="text-align:center;">' +
          '<button class="btn-action" style="margin-right:5px;" onclick="openNoticeModal(\'edit\', \'' + r.id + '\')">수정</button>' +
          '<button class="btn-action" style="color:var(--neon-pink);border-color:var(--neon-pink);" onclick="deleteNotice(\'' + r.id + '\')">삭제</button>' +
          '</td></tr>'
        );
      })
      .join('');
  }

  async function load() {
    var tbody = document.getElementById('noticeTableBody');
    try {
      var res = await sb()
        .from('notices')
        .select('id, category, title, body, is_published, is_pinned, published_at, created_at')
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false });
      if (res.error) throw res.error;
      cache = res.data || [];
      render();
    } catch (err) {
      console.error('[Admin Notices] 불러오기 실패:', err);
      var needSql = /notices|relation|schema cache/i.test(String(err && err.message));
      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="5" style="text-align:center; color:var(--neon-pink); padding:40px;">' +
          (needSql
            ? '공지사항 테이블이 아직 없습니다. Supabase에서 pickle_notices_116.sql 을 먼저 실행해 주세요.'
            : '공지사항을 불러오지 못했습니다: ' + esc(err && err.message)) +
          '</td></tr>';
      }
    }
  }

  function find(id) {
    return cache.find(function (r) {
      return r.id === id;
    });
  }

  window.openNoticeModal = function (mode, id) {
    editId = mode === 'edit' ? id : null;
    var r = editId ? find(editId) : null;
    if (editId && !r) {
      alert('공지를 찾을 수 없습니다.');
      return;
    }
    document.getElementById('noticeModalTitle').textContent = r ? '✏️ 공지 수정' : '➕ 새 공지 작성';
    document.getElementById('noticeCategoryInput').value = r ? r.category : 'notice';
    document.getElementById('noticeTitleInput').value = r ? r.title : '';
    document.getElementById('noticeBodyInput').value = r ? r.body : '';
    document.getElementById('noticePublishedAtInput').value = r ? toLocalInput(r.published_at) : '';
    document.getElementById('noticePinnedInput').checked = r ? !!r.is_pinned : false;
    document.getElementById('noticePublishedInput').checked = r ? !!r.is_published : true;
    document.getElementById('noticeModal').style.display = 'flex';
  };

  window.closeNoticeModal = function () {
    document.getElementById('noticeModal').style.display = 'none';
    editId = null;
  };

  window.saveNotice = async function () {
    var title = document.getElementById('noticeTitleInput').value.trim();
    if (!title) {
      alert('제목을 입력해 주세요.');
      return;
    }
    var at = document.getElementById('noticePublishedAtInput').value;
    var payload = {
      category: document.getElementById('noticeCategoryInput').value,
      title: title,
      body: document.getElementById('noticeBodyInput').value,
      is_pinned: document.getElementById('noticePinnedInput').checked,
      is_published: document.getElementById('noticePublishedInput').checked,
      published_at: at ? new Date(at).toISOString() : new Date().toISOString(),
    };
    try {
      var q;
      if (editId) {
        q = sb().from('notices').update(payload).eq('id', editId);
      } else {
        var who = '';
        try {
          var u = await sb().auth.getUser();
          who = (u && u.data && u.data.user && u.data.user.email) || '';
        } catch (e) {}
        payload.created_by = who;
        q = sb().from('notices').insert(payload);
      }
      var res = await q;
      if (res.error) throw res.error;
      alert(payload.is_published ? '✅ 저장되었습니다. 유저 앱에 노출됩니다.' : '✅ 임시저장되었습니다. (앱에는 아직 보이지 않습니다)');
      window.closeNoticeModal();
      await load();
    } catch (err) {
      console.error('[Admin Notices] 저장 실패:', err);
      alert('공지 저장에 실패했습니다.\n' + (err.message || String(err)));
    }
  };

  window.toggleNoticePublished = async function (id, checked) {
    try {
      var res = await sb().from('notices').update({ is_published: !!checked }).eq('id', id);
      if (res.error) throw res.error;
    } catch (err) {
      console.error('[Admin Notices] 노출 변경 실패:', err);
      alert('노출 상태 변경에 실패했습니다.\n' + (err.message || String(err)));
    }
    await load();
  };

  window.deleteNotice = async function (id) {
    if (!confirm('이 공지를 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      var res = await sb().from('notices').delete().eq('id', id);
      if (res.error) throw res.error;
      await load();
    } catch (err) {
      console.error('[Admin Notices] 삭제 실패:', err);
      alert('공지 삭제에 실패했습니다.\n' + (err.message || String(err)));
    }
  };

  document.addEventListener('DOMContentLoaded', load);
})();
