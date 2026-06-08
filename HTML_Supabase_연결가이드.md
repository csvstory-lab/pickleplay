# P!CKLE HTML ↔ Supabase 연결 가이드 (초보자용)

## 만든 파일

| 파일 | 역할 |
|------|------|
| `js/supabase-config.js` | URL + Anon Key (비밀번호 같은 것) |
| `js/supabase-client.js` | Supabase와 통신하는 공통 도구 |
| `js/supabase-config.example.js` | 설정 예시 (Git 공유용) |
| `index.html` | 연결 테스트 페이지 |

---

## 모든 HTML에 넣는 3줄 (순서 중요!)

`</body>` 바로 **위**에 아래를 **순서 그대로** 붙여 넣습니다.

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/supabase-config.js"></script>
<script src="js/supabase-client.js"></script>
```

그 다음, 페이지 전용 script 에서:

```javascript
const sb = window.PickleSupabase.getClient();
// 예: FAQ 목록
const { data, error } = await sb.from('faqs').select('*').eq('is_published', true);
```

---

## 로컬에서 테스트하는 방법

1. `Pickle_APP` 폴더에서 `index.html` 더블클릭  
   - 또는 VS Code / Cursor 에서 **Live Server** 로 열기  
2. **「✅ DB 연결 성공」** 이 보이면 성공  
3. 실패 시: SQL 3개 실행 여부, `js/supabase-config.js` URL/키 확인

> `file://` 로 열 때 일부 브라우저에서 제한이 있을 수 있습니다. 그때는 Live Server 사용을 권장합니다.

---

## 새 HTML 파일을 만들 때

1. HTML 파일을 `Pickle_APP` 폴더에 저장 (예: `feed.html`)  
2. `js` 폴더와 **같은 깊이**에 두기 → `js/supabase-config.js` 경로가 맞음  
3. 위 **3줄 script** 를 `</body>` 위에 추가  

하위 폴더에 HTML을 두면 경로가 바뀝니다:

```html
<script src="../js/supabase-config.js"></script>
```

---

## 관리자(admin.html) 참고

- 일반 **Anon Key** 로는 RLS 때문에 회원 전체 목록 등이 **안 보일 수 있습니다**.  
- 백오피스 전체 제어는 추후 **Edge Function** 또는 **service_role**(서버 전용) 연동이 필요합니다.  
- 지금 단계는 **연결 테스트 + 공개 데이터(FAQ, cs_settings 등)** 부터 연결하면 됩니다.

---

## 보안

- `js/supabase-config.js` 는 `.gitignore` 에 포함되어 GitHub에 안 올라가게 해 두었습니다.  
- 키가 유출되면 Supabase → Settings → API 에서 **Rotate** 하세요.
