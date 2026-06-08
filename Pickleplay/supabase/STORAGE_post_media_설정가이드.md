# post_media Storage 버킷 설정 (CEO용)

## 1. 버킷 만들기

1. [Supabase 대시보드](https://supabase.com/dashboard) → 프로젝트 선택
2. 왼쪽 메뉴 **Storage** 클릭
3. **New bucket** 버튼
4. 설정:
   - **Name:** `post_media` (이름 정확히 동일하게)
   - **Public bucket:** ✅ **켜기** (피드에서 이미지 URL 공개 조회)
5. **Create bucket** 저장

## 2. SQL 정책 적용

1. **SQL Editor** 열기
2. 프로젝트 폴더의 `09_storage_post_media_policies.sql` 내용 전체 복사 → **Run**
3. (미디어 DB 컬럼이 없다면) `08_posts_media_columns.sql` 도 먼저 Run

## 3. 동작 확인

1. 앱에서 로그인 후 **새 불판** → 이미지 1장 업로드 → 등록
2. Storage → `post_media` 버킷에 `{내 UUID}/...jpg` 파일이 생기는지 확인
3. 홈 피드에서 이미지가 보이면 성공

## 문제 해결

| 증상 | 해결 |
|------|------|
| `Bucket not found` | 버킷 이름이 `post_media` 인지, Public 인지 확인 |
| `new row violates row-level security` | `09_storage_...sql` 재실행 |
| 피드에 이미지 안 보임 | 버킷 **Public** 여부 확인, 브라우저 새로고침 |
| `media_type column` 오류 | `08_posts_media_columns.sql` 실행 |
