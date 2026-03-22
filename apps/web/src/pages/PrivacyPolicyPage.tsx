export default function PrivacyPolicyPage() {
  return <KoreanPolicy />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="text-gray-700 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function PolicyLayout({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-sm text-gray-500 mb-8">{updated}</p>
      {children}
    </div>
  );
}

function KoreanPolicy() {
  return (
    <PolicyLayout title="찾아줘-Yoonion 개인정보처리방침" updated="최종 수정: 2026년 3월 18일">
      <p className="text-gray-700 text-sm leading-relaxed mb-8">
        주식회사 슈퍼빌런랩스(이하 &ldquo;회사&rdquo;)는 이용자의 개인정보를 중요하게 생각하며, 관련 법령을 준수하고 있습니다.
        본 개인정보처리방침은 회사가 제공하는 모바일 애플리케이션(이하 &ldquo;서비스&rdquo;) 이용 시 수집되는 개인정보와 그 처리 방식에 대해 설명합니다.
      </p>

      <Section title="1. 수집하는 개인정보 항목">
        <p>회사는 서비스 제공을 위해 다음과 같은 개인정보를 수집할 수 있습니다.</p>
        <p className="font-medium mt-2">(1) 회원가입 및 로그인 시</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>카카오톡, 네이버, 텔레그램, 전화번호 로그인 시 제공되는 정보 (예: 사용자 식별자, 전화번호 등)</li>
          <li>이용자가 입력한 이름(닉네임)</li>
        </ul>
        <p className="font-medium mt-2">(2) 선택 입력 정보</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>이메일 주소 (공지사항, 이벤트 안내 목적)</li>
        </ul>
        <p className="font-medium mt-2">(3) 자동 수집 정보</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>디바이스 정보 (기기 모델, OS 버전 등)</li>
          <li>광고 식별자 (GAID 등)</li>
          <li>서비스 이용 기록, 접속 로그</li>
        </ul>
      </Section>

      <Section title="2. 개인정보 수집 및 이용 목적">
        <p>회사는 수집한 개인정보를 다음의 목적을 위해 사용합니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>회원 식별 및 계정 관리</li>
          <li>서비스 제공 및 운영</li>
          <li>공지사항 및 이벤트 안내</li>
          <li>고객 문의 대응</li>
          <li>서비스 개선 및 통계 분석</li>
          <li>맞춤형 광고 제공</li>
        </ul>
      </Section>

      <Section title="3. 개인정보 보유 및 이용 기간">
        <p>
          회사는 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.
          단, 관련 법령에 따라 일정 기간 보관이 필요한 경우에는 해당 기간 동안 보관합니다.
        </p>
      </Section>

      <Section title="4. 개인정보의 제3자 제공">
        <p>회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>이용자가 사전에 동의한 경우</li>
          <li>법령에 의해 요구되는 경우</li>
        </ul>
      </Section>

      <Section title="5. 개인정보 처리 위탁 및 외부 서비스 이용">
        <p>회사는 서비스 제공을 위해 아래와 같은 외부 서비스를 이용할 수 있으며, 이 과정에서 개인정보가 처리될 수 있습니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Firebase (분석, 푸시 알림, 서비스 운영)</li>
          <li>Google Analytics 4 (이용자 행동 분석)</li>
          <li>AdMob (광고 제공)</li>
          <li>AppLovin (광고 제공)</li>
          <li>Meta Platforms (광고 및 마케팅 분석)</li>
        </ul>
        <p className="mt-2">각 서비스 제공자의 개인정보 처리방침은 해당 서비스의 정책을 따릅니다.</p>
      </Section>

      <Section title="6. 이용자의 권리">
        <p>이용자는 언제든지 자신의 개인정보에 대해 다음과 같은 권리를 행사할 수 있습니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>개인정보 열람 요청</li>
          <li>수정 요청</li>
          <li>삭제 요청</li>
          <li>처리 정지 요청</li>
        </ul>
        <p className="mt-2">관련 요청은 아래 문의처를 통해 접수할 수 있습니다.</p>
      </Section>

      <Section title="7. 개인정보 보호를 위한 조치">
        <p>회사는 개인정보 보호를 위해 다음과 같은 조치를 취하고 있습니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>개인정보 접근 제한</li>
          <li>보안 시스템 운영</li>
          <li>내부 관리계획 수립 및 시행</li>
        </ul>
      </Section>

      <Section title="8. 개인정보 보호 책임자 및 문의">
        <ul className="space-y-1">
          <li>회사명: 주식회사 슈퍼빌런랩스</li>
          <li>이메일: cs@supervlabs.io</li>
          <li>국가: 대한민국</li>
        </ul>
        <p className="mt-2">개인정보 관련 문의는 위 이메일로 연락해 주시기 바랍니다.</p>
      </Section>

      <Section title="9. 개인정보처리방침 변경">
        <p>
          본 개인정보처리방침은 법령 또는 서비스 변경에 따라 수정될 수 있으며,
          변경 시 앱 또는 공지사항을 통해 안내드립니다.
        </p>
      </Section>
    </PolicyLayout>
  );
}
