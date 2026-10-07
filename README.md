# 마일스톤 테스트 사이트

Firebase Hosting: https://fmv-schedule.web.app

프로젝트 4개·업무 48개의 가상 샘플 데이터로 화면과 기능을 테스트합니다. 관리자·기획 담당자·기획팀장 역할은 상단에서 선택합니다. 각 브라우저에 독립 저장되며 샘플 데이터 초기화로 원복할 수 있습니다.

운영 Firebase DB, 실제 계정 로그인, Google Chat 및 여러 사용자 간 동기화는 연결되지 않습니다. 실제 업무나 개인정보를 입력하지 마세요. 링크를 아는 누구나 접속할 수 있는 공개 테스트 사이트입니다.

## 배포

`npm run verify` 후 Firebase CLI에 로그인하고 `npm run deploy`를 실행합니다. Hosting만 교체하며 DB와 보안 규칙은 배포하지 않습니다.

GitHub Actions는 push/PR 시 검사만 실행합니다. 수동 Run workflow 시 기존 `FIREBASE_SERVICE_ACCOUNT` 시크릿을 사용해 Hosting만 배포합니다. 해당 시크릿의 Hosting 권한은 별도 확인이 필요합니다. 저장소에 키 파일을 추가하지 마세요.

이전 앱은 Git 이력에 보존됩니다. 공휴일 DB 자동 수정 workflow는 제거했습니다. 수정할 화면 코드와 가상 데이터는 public/ 안에 있습니다.
