# P!CKLE Supabase DB 설치 가이드 (비개발자용)

이 가이드는 **복사 → 붙여넣기 → 실행**만 하면 데이터베이스가 완성되도록 만든 것입니다.

---

## 준비물

1. [Supabase](https://supabase.com) 계정
2. P!CKLE용으로 만든 **프로젝트** 1개
3. PC에 있는 SQL 파일 3개 (아래 순서대로)

| 순서 | 파일 이름 | 만드는 것 |
|:---:|-----------|-----------|
| 1 | `01_create_core_tables.sql` | 회원, 불판, 투표, 1:1 문의 |
| 2 | `02_create_community_tables.sql` | 댓글, FAQ, 금칙어/AI 필터 |
| 3 | `03_create_cs_settings.sql` | 카카오 URL, 운영시간, CS 이메일 |

---

## 1단계 — Supabase 프로젝트 열기

1. 브라우저에서 **https://supabase.com** 접속 후 로그인
2. **P!CKLE** (또는 만든 이름) 프로젝트 카드를 클릭해 들어갑니다

---

## 2단계 — SQL Editor 화면으로 이동

1. 왼쪽 메뉴에서 **SQL Editor** (번개·코드 모양 아이콘) 클릭
2. 오른쪽에 코드를 적는 **큰 입력창**이 보이면 성공입니다
3. 필요하면 상단 **+ New query** 를 눌러 빈 쿼리를 하나 만듭니다

---

## 3단계 — 첫 번째 SQL 실행 (핵심 테이블)

1. PC에서 폴더 열기:  
   `Pickle_APP` → `supabase` → **`01_create_core_tables.sql`**
2. 파일을 메모장 등으로 열고 **전체 선택** (Windows: `Ctrl + A`) → **복사** (`Ctrl + C`)
3. Supabase SQL Editor 입력창을 클릭 → **붙여넣기** (`Ctrl + V`)
4. 오른쪽 아래 또는 상단의 **Run** (또는 **실행**) 버튼 클릭
5. 아래쪽 **Results** 영역에 **초록색 Success** / **성공** 비슷한 메시지가 나오면 OK  
   - 빨간 **Error** 가 나오면: 이미 한 번 실행했을 수 있습니다. 에러 문구를 복사해 개발 담당자에게 전달하세요.

**확인:** 왼쪽 **Table Editor** → `users`, `posts`, `votes`, `inquiries` 네 개가 보이면 1번 성공입니다.

---

## 4단계 — 두 번째 SQL 실행 (댓글·FAQ·금칙어)

1. SQL Editor에서 **+ New query** 로 새 탭을 엽니다 (이전 내용 지우고 붙여넣어도 됩니다)
2. **`02_create_community_tables.sql`** 파일 내용 **전체 복사** → Editor에 **붙여넣기** → **Run**

**확인:** Table Editor에 `comments`, `faqs`, `banned_words` 가 추가되었는지 봅니다.

> ⚠️ **2번은 반드시 1번 다음에** 실행하세요. `comments` 가 `users`, `posts` 를 참조합니다.

---

## 5단계 — 세 번째 SQL 실행 (CS 설정)

1. 다시 **New query**
2. **`03_create_cs_settings.sql`** 전체 복사 → 붙여넣기 → **Run**

**확인:** Table Editor → **`cs_settings`** 테이블 → 데이터 **1줄** (id = 1)  
   - 카카오 URL, 이메일 등은 여기서 직접 수정하거나, 나중에 백오피스에서 수정하면 됩니다.

---

## 6단계 — 최종 점검 (체크리스트)

Table Editor 왼쪽 목록에 아래 **8개**가 모두 있으면 기획안 기준 DB 구성이 **완료**된 것입니다.

| # | 테이블 | 한 줄 설명 |
|---|--------|------------|
| 1 | users | 회원 |
| 2 | posts | 불판(A/B 투표) |
| 3 | votes | 투표 기록 |
| 4 | inquiries | 1:1 문의 |
| 5 | comments | 불판 댓글 |
| 6 | faqs | 자주 묻는 질문 |
| 7 | banned_words | 금칙어·AI 필터 |
| 8 | cs_settings | 카카오·운영시간·CS 이메일 |

---

## 자주 묻는 질문

**Q. 같은 SQL을 두 번 Run 했어요.**  
- 대부분 `IF NOT EXISTS` 로 되어 있어 **다시 실행해도 괜찮은 경우가 많습니다.**  
- 에러가 나면 문구를 캡처해 두세요.

**Q. cs_settings 값은 어디서 바꾸나요?**  
- Table Editor → `cs_settings` → id `1` 행 더블클릭 또는 연필 아이콘으로 수정 → Save

**Q. 관리자 백오피스에서 FAQ·금칙어를 왜 안 바뀌나요?**  
- 일반 유저 권한은 **읽기만** 가능하게 해 두었습니다. 백오피스 연동 시 **service_role** 키 또는 관리자 전용 정책을 추가해야 합니다.

---

## 다음에 할 일 (개발 연동 시)

- Supabase **Project Settings → API** 에서 `URL`, `anon key` 를 프론트엔드에 연결
- 실제 카카오 채널 주소로 `cs_settings.kakao_channel_url` 수정
- `banned_words` 의 **예시금칙어** 행 삭제 후 실제 운영 단어 등록

---

*P!CKLE · pickleapp.kr*
