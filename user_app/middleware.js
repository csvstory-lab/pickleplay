export const config = {
  // 사이트의 모든 경로(/*)에 대해 비밀번호를 묻도록 설정합니다.
  matcher: '/(.*)',
};

export default function middleware(request) {
  const basicAuth = request.headers.get('authorization');

  // 💡 설정할 아이디와 비밀번호
  // 현재 아이디: admin / 비밀번호: 1234
  // ('admin:1234'를 Base64로 인코딩한 값이 'YWRtaW46MTIzNA==' 입니다.)
  const expectedAuth = 'Basic YWRtaW46MTIzNA==';

  // 사용자가 올바른 아이디/비밀번호를 입력한 경우
  if (basicAuth === expectedAuth) {
    return; // 무사히 통과시켜 화면을 보여줍니다.
  }

  // 비밀번호를 입력하지 않았거나 틀린 경우 -> 브라우저 기본 로그인 팝업 띄우기
  return new Response('접근 권한이 없습니다 (Auth required)', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="P!CKLE Admin Area"',
    },
  });
}