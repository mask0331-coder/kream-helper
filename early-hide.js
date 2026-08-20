// Kream Helper - 자동 상세보기 팝업의 깜빡임 방지
// content.js가 "상품 상세" 버튼을 자동으로 눌러 팝업 창 안에서 주문 페이지 -> 상품
// 페이지로 SPA 이동시키는 동안(#kream-helper-auto-detail 표식이 붙은 창), 그 전환
// 과정 자체가 사용자 눈에 안 보이도록 document_start 시점에 최대한 일찍 화면을
// 숨겨둡니다. content.js(document_idle, 실제 자동 클릭+이동 담당)가 이동이 끝나면
// 다시 보여줍니다.
//
// content.js가 어떤 이유로든(에러 등) 다시 보여주는 걸 실패해도 창이 영영 빈 화면으로
// 남지 않도록, 여기서도 최후의 안전장치로 10초 뒤엔 무조건 다시 보여줍니다.
if (location.hash === '#kream-helper-auto-detail') {
  document.documentElement.style.visibility = 'hidden';
  setTimeout(() => {
    document.documentElement.style.visibility = 'visible';
  }, 10000);
}
