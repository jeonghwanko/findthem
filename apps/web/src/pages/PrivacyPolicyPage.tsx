import { useTranslation } from 'react-i18next';

export default function PrivacyPolicyPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  if (lang === 'en') return <EnglishPolicy />;
  if (lang === 'ja') return <JapanesePolicy />;
  if (lang === 'zh-TW') return <ChinesePolicy />;
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

function EnglishPolicy() {
  return (
    <PolicyLayout title="Privacy Policy" updated="Last updated: March 17, 2026">
      <Section title="1. Information We Collect">
        <p>FindThem collects the following information to provide missing person/pet search services:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Registration: Phone number, name (or social login profile info)</li>
          <li>Report submission: Photos, last seen location, description, contact info</li>
          <li>Sighting submission: Photos, sighting location, description</li>
          <li>Advertising: Google Advertising ID (GAID) via Google AdMob</li>
        </ul>
      </Section>

      <Section title="2. How We Use Your Information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Missing report registration and sighting matching</li>
          <li>AI image analysis for automatic matching (Anthropic Claude, Google Gemini, OpenAI GPT)</li>
          <li>Automatic SNS promotion (Twitter, KakaoTalk Channel)</li>
          <li>Notification delivery to reporters</li>
          <li>Reward ad serving (Google AdMob)</li>
        </ul>
      </Section>

      <Section title="3. Third-Party Sharing">
        <p>Collected information may be transmitted to the following services:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Anthropic, Google, OpenAI: AI image analysis and text generation</li>
          <li>Google AdMob: Reward ad serving</li>
          <li>Twitter API, KakaoTalk Channel: SNS promotion</li>
        </ul>
      </Section>

      <Section title="4. Data Retention and Deletion">
        <p>Photos and personal information are deleted within 90 days after a report is closed (FOUND/EXPIRED). Data is deleted immediately upon account deletion.</p>
      </Section>

      <Section title="5. Your Rights">
        <p>You can request access, modification, or deletion of your personal data at any time. Contact: contact@supervlabs.io</p>
      </Section>

      <Section title="6. Operator Information">
        <p>Supervlabs Inc.</p>
        <p>Business Registration: 856-87-02886</p>
        <p>Email: contact@supervlabs.io</p>
      </Section>
    </PolicyLayout>
  );
}

function JapanesePolicy() {
  return (
    <PolicyLayout title="プライバシーポリシー" updated="最終更新: 2026年3月17日">
      <Section title="1. 収集する個人情報">
        <p>FindThemは行方不明者・ペット捜索サービスのため、以下の情報を収集します：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>会員登録: 電話番号、氏名（またはソーシャルログインのプロフィール情報）</li>
          <li>届出登録: 写真、失踪場所、特徴説明、連絡先</li>
          <li>目撃情報: 写真、目撃場所、説明</li>
          <li>広告: Google AdMobによる広告識別子（GAID）</li>
        </ul>
      </Section>

      <Section title="2. 個人情報の利用目的">
        <ul className="list-disc pl-5 space-y-1">
          <li>行方不明届出の登録と目撃情報のマッチング</li>
          <li>AI画像分析による自動マッチング（Anthropic Claude、Google Gemini、OpenAI GPT）</li>
          <li>SNS自動広報（Twitter、KakaoTalkチャンネル）</li>
          <li>届出者への通知送信</li>
          <li>リワード広告の提供（Google AdMob）</li>
        </ul>
      </Section>

      <Section title="3. 第三者への提供">
        <p>収集した情報は以下のサービスに送信される場合があります：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Anthropic、Google、OpenAI: AI画像分析およびテキスト生成</li>
          <li>Google AdMob: リワード広告提供</li>
          <li>Twitter API、KakaoTalkチャンネル: SNS広報</li>
        </ul>
      </Section>

      <Section title="4. 個人情報の保有と破棄">
        <p>届出終了（発見/期限切れ）後90日以内に関連写真および個人情報を破棄します。退会時は即座に破棄します。</p>
      </Section>

      <Section title="5. ユーザーの権利">
        <p>ユーザーはいつでも個人情報の閲覧、修正、削除を要求できます。お問い合わせ: contact@supervlabs.io</p>
      </Section>

      <Section title="6. 運営者情報">
        <p>株式会社スーパーVラボ (Supervlabs Inc.)</p>
        <p>事業者登録番号: 856-87-02886</p>
        <p>メール: contact@supervlabs.io</p>
      </Section>
    </PolicyLayout>
  );
}

function ChinesePolicy() {
  return (
    <PolicyLayout title="隱私權政策" updated="最後更新：2026年3月17日">
      <Section title="1. 我們收集的資訊">
        <p>FindThem為提供失蹤人員/寵物搜尋服務，收集以下資訊：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>會員註冊：手機號碼、姓名（或社交登入個人資料）</li>
          <li>報案登記：照片、失蹤地點、特徵描述、聯絡方式</li>
          <li>目擊報告：照片、目擊地點、描述</li>
          <li>廣告：透過Google AdMob收集廣告識別碼（GAID）</li>
        </ul>
      </Section>

      <Section title="2. 資訊使用目的">
        <ul className="list-disc pl-5 space-y-1">
          <li>失蹤報案登記及目擊資訊配對</li>
          <li>AI圖像分析自動配對（Anthropic Claude、Google Gemini、OpenAI GPT）</li>
          <li>SNS自動推廣（Twitter、KakaoTalk頻道）</li>
          <li>向報案者發送通知</li>
          <li>獎勵廣告提供（Google AdMob）</li>
        </ul>
      </Section>

      <Section title="3. 第三方分享">
        <p>收集的資訊可能會傳送至以下服務：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Anthropic、Google、OpenAI：AI圖像分析及文字生成</li>
          <li>Google AdMob：獎勵廣告提供</li>
          <li>Twitter API、KakaoTalk頻道：SNS推廣</li>
        </ul>
      </Section>

      <Section title="4. 資料保留與刪除">
        <p>報案結束（找到/過期）後90天內刪除相關照片及個人資訊。帳號刪除時立即銷毀。</p>
      </Section>

      <Section title="5. 用戶權利">
        <p>用戶可隨時要求查閱、修改或刪除個人資料。聯絡方式：contact@supervlabs.io</p>
      </Section>

      <Section title="6. 營運者資訊">
        <p>Supervlabs Inc.</p>
        <p>營業登記號：856-87-02886</p>
        <p>電子郵件：contact@supervlabs.io</p>
      </Section>
    </PolicyLayout>
  );
}
