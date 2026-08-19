# Kream Helper

kream.co.kr 이용 방식을 커스터마이징하는 개인용 확장 프로그램.
Windows + Chrome, macOS + Safari 양쪽에서 동일한 소스로 사용하는 것을 목표로 합니다.

## 현재 기능
- 설정에서 지정한 URL 패턴과 일치하는 링크를 클릭하면, 페이지 이동 대신 **팝업 창**으로 엽니다. (kream.co.kr 전용)
  - 기본 패턴: `/products/` (상품 상세 링크)
  - 팝업으로 열리는 링크는 텍스트에 " (팝업)"이 자동으로 붙습니다.
  - 팝업 창은 하나만 재사용됩니다 (새 링크 클릭 시 기존 창의 내용만 바뀜).
- **어떤 사이트에서든** 텍스트를 드래그 선택하고 단축키(기본 `Ctrl+Q`)를 누르면, 새 탭에서
  `kream.co.kr/search?keyword=<선택한 텍스트>` 로 이동합니다.
- 상품 상세 페이지(`/products/*`)에서는 화면 우측 하단에 **제품명 복사 / 품번 복사 / 링크 복사** 버튼이 뜹니다.

## 설치 (개발자 모드)
1. `chrome://extensions` 접속
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** 클릭 → 이 폴더(`kream-helper`) 선택
4. kream.co.kr 접속 후 상품 링크 클릭해서 팝업으로 뜨는지 확인

## 설정 변경
확장 프로그램 아이콘 우클릭 → **옵션** (또는 `chrome://extensions` → Kream Helper → 세부정보 → 확장 프로그램 옵션)
- 팝업으로 열 링크 패턴 (줄바꿈으로 여러 개 추가, `/정규식/` 형식 지원)
- 팝업 창 크기

## 검색 단축키 변경
기본 단축키는 `Ctrl+Q`입니다. 다른 확장 프로그램과 겹치거나 원하는 조합으로 바꾸려면:
`chrome://extensions/shortcuts` 접속 → Kream Helper 항목에서 직접 재지정

## 코드 수정 후 반영
`chrome://extensions`에서 Kream Helper 카드의 새로고침(⟳) 버튼 클릭 → kream.co.kr 페이지도 새로고침

## Safari(Mac)에서 사용하기
이 저장소를 Mac에 clone한 뒤:

```bash
xcrun safari-web-extension-converter /path/to/kream-helper
```

으로 Xcode 프로젝트를 생성하고, Xcode에서 빌드/실행 → Safari 환경설정 → 확장 프로그램에서 활성화합니다.
Xcode가 생성하는 프로젝트 파일은 `.gitignore`로 제외되어 있으니, 코드(`content.js`, `options.*`, `manifest.json`)를
수정할 때마다 이 저장소에만 커밋하고 Mac에서는 `git pull` 후 변환 명령을 다시 돌리면 됩니다.

## 다음에 추가하면 좋을 것들
- 특정 요소 숨기기 / 레이아웃 커스터마이징 (content.css 활용)
- 링크 패턴별로 팝업 크기를 다르게 지정
- 검색 단축키를 Safari에서도 쓸 수 있게 별도 구현 (Safari의 commands API 지원은 Chrome과 달라 추가 작업 필요)
