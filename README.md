# 우리 둘

둘만의 커플 기록장. 아이폰 홈 화면에 추가해서 앱처럼 쓰고, 진짜 푸시 알림을 받아요.

- 오늘의 질문 (둘 다 답해야 공개), 함께 키우는 캐릭터
- 사진함 (올려 두면 상대가 시간 날 때 저장)
- 캘린더 (데이트·일정·기념일·생일, 반복, 여행), 다음 데이트 카운트다운
- 추억 타임라인·지도, 버킷리스트, 연말 결산 카드
- 푸시 알림: 상대의 답·사진·콕·일정·추억, 아침 9시 기념일/데이트, 저녁 6시 오늘의 질문

## 구조

| 부분 | 쓰는 것 | 비용 |
| --- | --- | --- |
| 앱 화면 (`web/`) | GitHub Pages | 무료 |
| 데이터·사진·로그인 (`supabase/migrations`) | Supabase 무료 요금제 | 무료 |
| 푸시 알림 보내기 (`supabase/functions`) | Supabase Edge Functions + Web Push | 무료 |
| 자동 배포 (`.github/workflows/deploy.yml`) | GitHub Actions | 무료 |

`main`에 올리면 GitHub Actions가 Supabase 설정, 함수 배포, 앱 게시를 모두 자동으로 해요.

## 처음 한 번 설정

1. **Supabase 프로젝트 만들기**: Region은 Northeast Asia (Seoul). DB 비밀번호를 메모해요.
2. **익명 로그인 켜기**: Authentication → Sign In / Providers → Allow anonymous sign-ins.
3. **액세스 토큰 만들기**: https://supabase.com/dashboard/account/tokens
4. **이 저장소에 비밀값 3개 넣기**: Settings → Secrets and variables → Actions → New repository secret
   - `SUPABASE_PROJECT_REF`: 프로젝트 ID (대시보드 주소의 `/project/` 뒤 20자)
   - `SUPABASE_DB_PASSWORD`: DB 비밀번호
   - `SUPABASE_ACCESS_TOKEN`: 3번의 토큰
5. **Actions 탭 → deploy → Run workflow** (또는 `main`에 아무 변경이나 올리기)
6. 끝나면 `https://<GitHub 아이디>.github.io/<저장소 이름>/` 이 앱 주소예요.

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
