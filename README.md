# 우리 둘

둘만의 커플 기록장. 아이폰 홈 화면에 추가해서 앱처럼 쓰고, 진짜 푸시 알림을 받아요.

- 오늘의 질문 (둘 다 답해야 공개), 함께 키우는 캐릭터, 오늘 우리 기분
- 타임캡슐 편지 (정한 날에 열림), 데이트·메뉴 룰렛
- 사진함 (올려 두면 상대가 시간 날 때 저장)
- 캘린더 (데이트·일정·기념일·생일, 반복, 여행), 다음 데이트 카운트다운
- 추억 타임라인·지도, 버킷리스트, 연말 결산 카드
- 푸시 알림: 상대의 답·기분·사진·콕·일정·추억·편지, 아침 9시 기념일/데이트/열리는 편지, 저녁 6시 오늘의 질문

## 구조

| 부분 | 쓰는 것 | 비용 |
| --- | --- | --- |
| 앱 화면 (`web/`) | GitHub Pages | 무료 |
| 데이터·사진·로그인 (`supabase/migrations`) | Supabase 무료 요금제 | 무료 |
| 푸시 알림 보내기 (`supabase/functions`) | Supabase Edge Functions + Web Push | 무료 |
| 자동 배포 (`.github/workflows/deploy.yml`) | GitHub Actions | 무료 |

`main`에 올리면 GitHub Actions가 Supabase 설정, 함수 배포, 앱 게시를 모두 자동으로 해요.

## 처음 한 번 설정

1. https://supabase.com 에 가입하고 https://supabase.com/dashboard/account/tokens 에서 토큰을 만들어요.
2. 이 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - 이름 `SUPABASE_ACCESS_TOKEN`, 값은 1번의 토큰
3. 이 저장소 **Settings → Pages → Source: GitHub Actions**
4. **Actions → deploy → Run workflow** (또는 `main`에 아무 변경이나 올리기)

배포 작업이 알아서 해요: Supabase 프로젝트 `uri-dul`(서울) 만들기, 익명 로그인 켜기, 데이터베이스 표·규칙,
푸시 키, 알림 함수, 실제 서버 테스트(두 사람 + 낯선 사람, 브라우저 두 대), 그리고 앱 게시까지.
끝나면 `https://<GitHub 아이디>.github.io/<저장소 이름>/` 이 앱 주소예요.

## 업데이트

`main`에 올리면 2~3분 뒤 새 버전이 게시돼요. 폰에서는 앱을 다시 열 때 새 버전으로 바뀌고, 기록은 그대로예요.
데이터베이스를 바꿀 때는 `supabase/migrations/`에 새 파일을 더하면 배포할 때 한 번만 적용돼요.

## 테스트

- `tests/sql/run.sh`: 로컬 Postgres에서 접근 규칙 테스트 (`PGHOST`, `PGPORT` 지정)
- `tests/e2e/api.mjs`, `tests/e2e/ui.mjs`: 배포 때 실제 서버로 도는 테스트

## 아이폰에 설치

1. Safari로 앱 주소를 열어요.
2. 공유 버튼 → **홈 화면에 추가** → 추가.
3. 홈 화면의 **우리 둘** 아이콘으로 열어요. (iOS 16.4 이상)
4. **새로 시작하기** → 우리 정보 입력 → **초대 링크 보내기**.
5. 상대도 링크를 열어 홈 화면에 추가한 뒤, 앱에서 초대 코드를 넣어요.
6. 각자 설정(톱니바퀴) → **알림 켜기**.

## 알아 둘 것

- 설정의 **내 복구 코드**를 캡처해 두세요. 폰을 바꾸면 초대 코드 + 복구 코드로 기록을 되찾아요.
- Supabase 무료 프로젝트는 일주일 동안 조용하면 멈출 수 있어요. `keepalive` 작업이 3일마다 깨워요. 멈췄다면 대시보드에서 Resume project를 누르면 돼요.
- 사진 저장 공간은 무료 요금제 기준 1GB예요.
