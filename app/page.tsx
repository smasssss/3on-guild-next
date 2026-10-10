'use client';

import {useEffect} from 'react';

export default function Home(){
  useEffect(()=>{window.location.replace(new URL('legacy.html',window.location.href).href)},[]);
  return <main className="mirrorRedirect"><span className="stageMark">STAGING</span><h1>3ON 운영센터</h1><p>Production 화면과 같은 Staging 운영센터를 불러오는 중입니다.</p><a href="./legacy.html">운영센터 열기</a></main>;
}
