# Chromex

[![CI](https://github.com/GENEXIS-AI/chromex/actions/workflows/ci.yml/badge.svg)](https://github.com/GENEXIS-AI/chromex/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/GENEXIS-AI/chromex?style=social)](https://github.com/GENEXIS-AI/chromex/stargazers)
[![English](https://img.shields.io/badge/readme-English-111827.svg)](../README.md)
[![한국어](https://img.shields.io/badge/readme-한국어-2563eb.svg)](./README.ko.md)
[![日本語](https://img.shields.io/badge/readme-日本語-dc2626.svg)](./README.ja.md)
[![简体中文](https://img.shields.io/badge/readme-简体中文-16a34a.svg)](./README.zh-CN.md)

Chromex는 Chrome과 Codex를 로컬 네이티브 브리지로 연결하는 Chrome MV3 사이드 패널 어시스턴트입니다. 현재 페이지, 선택한 탭, 업로드 파일, 음성 입력, 이미지, 브라우저 작업을 처리하면서 인증 정보는 확장 프로그램 저장소 밖에 두도록 설계했습니다.

배포 주체: **GenexisAI CHOI**.

![Chromex 브라우저 사이드 패널 어시스턴트](../assets/chromex-hero.png)


## 주요 기능

- 현재 웹페이지, 선택한 열린 탭, 스크린샷, 업로드 파일, PDF, Office 파일, 이미지, 브라우저 기록을 사용자가 요청할 때만 바탕으로 대화합니다.
- 페이지, 유튜브 영상, 뉴스 기사, 리서치 페이지, PDF, arXiv 논문을 요약하고 비교합니다.
- Codex 이미지 워크플로우를 통해 이미지를 편집하거나 생성하고 결과물을 로컬에서 관리합니다.
- 음성 전사, 플랜 모드, 페이지별 추천 질문, 사용자 프로필, 선택형 Codex 스킬을 지원합니다.
- 통역/라이브 모드에서 실시간 전사, 선택형 실시간 통역, 전사 내용 기반 후속 질문을 사용할 수 있습니다.
- Chrome content script 경계를 통해 브라우저 제어 워크플로우를 실행하고 페이지 안에 작업 상태를 표시합니다.

## Chrome Web Store 설치

Chrome Web Store에서 설치한 사용자는 Chromex 소스를 빌드할 필요가 없습니다.

한국어, 영어, 일본어, 중국어 간체로 제공되는 복사 버튼 포함 설치 안내는 공개 설정 페이지에서 확인할 수 있습니다: <https://genexis-ai.github.io/chromex/install/>

1. 공식 Codex CLI를 설치하고 동작을 확인합니다. 공식 설치 옵션은 <https://github.com/openai/codex>에서 확인할 수 있습니다.

```bash
npm install -g @openai/codex
codex --version
```

   Chromex는 `@openai/codex` **0.130.0 이상**이 필요합니다. 그 이전 버전(예: 0.124.x, 0.125.x)은 일부 부트스트랩 기능 플래그를 거부해서 `codex login` 성공 직후에도 `codex app-server exited with code 1` 오류가 반복 발생합니다.

2. 최신 [GitHub Release](https://github.com/GENEXIS-AI/chromex/releases/latest)에서 `chromex-local-bridge.zip`을 내려받아 압축을 풀고 실행합니다.

```bash
node scripts/install-native-host.mjs --browser=chrome
```

3. 모든 Chrome 창을 완전히 닫고 다시 연 뒤 Chromex에서 **연결 확인**을 누릅니다.

Chrome 확장 프로그램은 보안상 로컬 브리지를 자동 설치할 수 없습니다. 이 한 번의 브리지 등록이 Chrome과 로컬 Codex app-server를 안전하게 연결합니다.

## 소스에서 설치

소스 checkout 또는 [`chromex-public-source.zip`](https://github.com/GENEXIS-AI/chromex/releases/latest/download/chromex-public-source.zip)을 사용하세요.

```bash
git clone https://github.com/GENEXIS-AI/chromex.git
cd chromex
npm install
npm run build
node scripts/install-native-host.mjs
```

그다음 모든 Chrome 창을 닫고 다시 연 뒤 `chrome://extensions`에서 **개발자 모드**를 켜고 **압축해제된 확장 프로그램을 로드합니다**로 다음 폴더를 선택합니다.

```text
packages/extension/dist
```

중요: `npm install`, `npm run build`, `install-native-host.mjs`는 반드시 `package.json`이 있는 `chromex` 소스 폴더에서 실행하세요. Windows에서 `ENOENT Could not read package.json`이 나오면 잘못된 폴더에 있는 것입니다.

### Windows 로컬 브리지 설치

Windows에서는 Node.js 20 LTS 이상을 설치한 뒤 Codex CLI를 먼저 설치하고 확인하세요.

```powershell
npm install -g @openai/codex
codex --version
```

`winget install Codex -s msstore`가 실패해도 위 npm 설치 경로를 사용하세요. `0x8a15005e: The server certificate did not match any of the expected values`는 Chromex 문제가 아니라 Windows Store / TLS 인증서 체인 문제입니다.

그다음 `chromex` 소스 폴더에서 **PowerShell**로 실행하세요.

```powershell
npm install
npm run build
node scripts/install-native-host.mjs --browser=chrome
```

그다음 `chrome://extensions`에서 Chromex의 **업데이트/새로고침** 버튼을 누르고, Chromex 사이드 패널에서 **연결 확인**을 누르세요.

그래도 로컬 브리지 대기 상태가 계속되면:

1. Chromex가 `packages/extension/dist`에서 로드됐는지 확인합니다.
2. `chrome://extensions`의 Chromex 카드에 표시된 확장 프로그램 ID를 복사합니다.
3. 해당 ID로 설치 명령을 다시 실행합니다.

```powershell
node scripts/install-native-host.mjs <extension-id> --browser=chrome
```

공개 릴리즈의 예상 ID는 `menmlhahmendmkiicbjihgjhppkgaeom`입니다. Chrome에 다른 ID가 보이면 Chrome에 표시된 ID를 사용하세요.

로그인할 때 `Failed to start codex app-server`가 나오면 Chromex가 로컬 브리지에는 연결됐지만 Codex CLI를 실행하지 못한 상태입니다. `codex --version`을 다시 확인하세요. Windows에서 Codex를 찾지 못하면 선택 Codex binary 경로를 `%APPDATA%\npm\codex.cmd`로 지정하거나 폴더를 `%APPDATA%\npm`으로 지정하세요. 작업 폴더와 Codex 실행 파일 경로는 다른 설정이므로, Codex binary 입력란에 프로젝트 폴더를 넣지 마세요.

Windows에서 실행 파일 감지를 강제로 확인하려면:

```powershell
npm install -g @openai/codex
where codex
codex --version
```

`where codex`가 `C:\Users\<you>\AppData\Roaming\npm\codex.cmd`를 출력하면 Chromex 설정에서 선택 Codex binary 경로를 `%APPDATA%\npm\codex.cmd`로 지정하고 저장한 뒤 모든 Chrome 창을 닫고 다시 열고 **연결 확인**을 누르세요.

## 런타임 경계

Chromex는 다음 경계로 동작합니다.

```text
Chrome Extension -> Native Messaging Host -> Local Bridge -> codex app-server
```

소스 구조는 다음과 같습니다.

- `packages/extension`: Chrome MV3 사이드 패널 확장 프로그램
- `packages/bridge`: Codex app-server와 멀티모달 워크플로우를 처리하는 로컬 브리지
- `packages/native-host`: Chrome Native Messaging 릴레이
- `packages/shared`: 공유 타입, 정책, 프로필, 헬퍼

## 언어 지원

Chromex는 기본적으로 브라우저 언어를 자동으로 따릅니다. 사용자는 **설정 > 일반 > 앱 UI 언어**에서 언어를 직접 선택할 수 있습니다.

확장 프로그램은 영어, 한국어, 일본어, 중국어, 아랍어, 프랑스어, 독일어, 스페인어, 포르투갈어, 힌디어, 베트남어, 태국어, 터키어, 우크라이나어 등 Chrome 호환 로케일을 `_locales`로 제공합니다. 모델 응답은 사용자가 다른 언어를 요청하지 않는 한 선택된 UI 언어를 따르도록 지시됩니다.

## 보안 및 개인정보 기본값

- 확장 프로그램은 원본 OpenAI API 키, OAuth 토큰, ChatGPT 세션 토큰을 Chrome extension storage에 저장하지 않습니다.
- Codex OAuth / ChatGPT 로그인은 로컬 Codex app-server 흐름을 통해 처리합니다.
- API 키 로그인은 선택형 로컬 fallback이며, 사용자 확인 없이 자동 전환하지 않습니다.
- 실시간 통역은 별도 확인된 OpenAI API 키 경로를 사용하며 설정에서 연결을 해제할 수 있습니다.
- 페이지 내용, 탭 데이터, 스크린샷, 브라우저 기록, 마이크 입력, 브라우저 조작은 사용자가 요청한 워크플로우에서만 사용합니다.
- `history`, `tabs`, 화면 캡처, 마이크, 사이트 접근 권한은 필요한 기능을 사용할 때만 요청합니다.
- 대화 기록은 기본적으로 세션 전용입니다. 로컬 기기 저장은 사용자가 직접 켜야 합니다.
- Native host 자식 프로세스와 워크스페이스 훅은 축소된 환경 변수 allowlist로 실행됩니다.
- 생성 이미지 원본, 임시 업로드, 진단 로그는 로컬 브리지가 처리합니다.

수정 빌드를 배포하기 전 [SECURITY.md](../SECURITY.md)와 [PRIVACY.md](../PRIVACY.md)를 확인하세요.

## 기능

- 채팅 중심의 MV3 사이드 패널
- 페이지, 파일, 이미지, 기록, 음성, 브라우저 제어 요청 자동 라우팅
- 여러 열린 탭을 선택할 수 있는 `@` 피커
- 프로필 선택을 위한 `/` 피커
- 애매한 요청을 실행 전 명시적인 계획으로 정리하는 플랜 모드
- 이미지, 텍스트, PDF, DOCX, CSV, TSV, XLSX, XLSM 첨부
- DOM, vision, hybrid, site adapter 기반 읽기 전략
- 선택 텍스트 문맥 주입, 팩트체크 추천, 우클릭 AI 질문 흐름
- 화면에 보이는 명령어와 실제 전송 프롬프트를 분리할 수 있는 사이트별 추천 명령어
- 실시간 전사 기록, 선택형 실시간 통역 재생, 전사 기반 후속 채팅을 제공하는 통역/라이브 모드
- 유튜브, 뉴스, 리서치, 메일, 협업 도구, 노트, 업무 관리, 쇼핑, 여행, 한국 업무 서비스에 맞춘 추천 질문
- 현재 재생 시간 컨텍스트와 이동 액션을 지원하는 YouTube adapter
- 업로드 이미지, 페이지 이미지, 현재 화면 캡처 기반 비파괴 이미지 편집
- 코드블록, 테이블, 링크, 복사 컨트롤을 포함한 Markdown 렌더링
- 사용자가 활성화한 경우에만 로드되는 로컬 `.codex/skills/*/SKILL.md` 기반 선택형 Codex 스킬

## 개발

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run release:audit
```

선택형 브라우저 smoke test:

```bash
npm run smoke
```

호환 브라우저가 없으면 Playwright Chromium 런타임을 설치합니다.

```bash
npm run smoke:install-browser
```

빌드 결과는 다음 폴더에 생성됩니다.

```text
packages/extension/dist
```

## 릴리즈 관리

Chromex는 `0.1.1`부터 일반 오픈소스 릴리즈 이력을 사용합니다. 버전 정책, pull request 흐름, 릴리즈 체크리스트는 [RELEASE.md](../RELEASE.md)에 정리되어 있습니다.

## 문제 해결

- **Native host missing or forbidden**: `npm run build` 후 `node scripts/install-native-host.mjs --browser=chrome`를 실행하고 `chrome://extensions`에서 확장 프로그램을 다시 로드한 뒤 Chromex 온보딩/시스템 상태를 확인하세요. Chrome에 다른 확장 프로그램 ID가 보이면 `node scripts/install-native-host.mjs <extension-id> --browser=chrome`로 다시 설치하세요.
- **Codex 실행 파일이 감지되지 않음**: `npm install -g @openai/codex`, `where codex`, `codex --version`을 실행하세요. 필요하면 Chromex의 선택 Codex binary 경로를 `%APPDATA%\npm\codex.cmd`로 지정하고 저장한 뒤 Chrome을 완전히 다시 시작하고 **연결 확인**을 누르세요.
- **모델 목록이 로드되지 않음**: native bridge 연결을 먼저 확인한 뒤 app-server 기반 로그인 흐름으로 로그인하세요.
- **페이지 컨텍스트를 사용할 수 없음**: 대상 탭에서 Chromex를 열거나 워크플로우가 요청하는 Chrome 사이트 권한을 승인하세요.
- **Chrome에 이전 UI가 계속 보임**: `npm run build`를 실행하고 확장 프로그램 카드를 다시 로드한 뒤 Chrome이 `packages/extension/dist`를 로드하는지 확인하세요.
- **브라우저 smoke test가 브라우저 없음으로 실패함**: `npm run smoke:install-browser` 후 `npm run smoke`를 실행하세요.

## 라이선스

MIT. [LICENSE](../LICENSE)를 참고하세요.

## Star History

<a href="https://www.star-history.com/#GENEXIS-AI/chromex&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date" />
  </picture>
</a>
