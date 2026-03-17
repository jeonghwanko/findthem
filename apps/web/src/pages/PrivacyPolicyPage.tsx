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
    <PolicyLayout title="개인정보처리방침" updated="최종 수정: 2026년 3월 17일">
      <Section title="1. 수집하는 개인정보">
        <p>FindThem은 실종자/반려동물 찾기 서비스 제공을 위해 다음 정보를 수집합니다:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>회원가입: 휴대폰 번호, 이름 (또는 소셜 로그인 프로필 정보)</li>
          <li>신고 등록: 사진, 실종 장소, 특징 설명, 연락처</li>
          <li>목격 제보: 사진, 목격 장소, 설명</li>
          <li>광고: Google AdMob을 통한 광고 식별자 (GAID)</li>
        </ul>
      </Section>

      <Section title="2. 개인정보의 이용 목적">
        <ul className="list-disc pl-5 space-y-1">
          <li>실종 신고 등록 및 목격 제보 매칭</li>
          <li>AI 이미지 분석을 통한 자동 매칭 (Anthropic Claude, Google Gemini, OpenAI GPT)</li>
          <li>SNS 자동 홍보 (Twitter, KakaoTalk Channel)</li>
          <li>신고자 알림 발송</li>
          <li>리워드 광고 제공 (Google AdMob)</li>
        </ul>
      </Section>

      <Section title="3. 개인정보의 제3자 제공">
        <p>수집된 정보는 다음 서비스에 전송될 수 있습니다:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Anthropic, Google, OpenAI: AI 이미지 분석 및 텍스트 생성</li>
          <li>Google AdMob: 리워드 광고 제공</li>
          <li>Twitter API, KakaoTalk Channel: SNS 자동 홍보</li>
        </ul>
      </Section>

      <Section title="4. 개인정보의 보유 및 파기">
        <p>신고가 종료(FOUND/EXPIRED)된 후 90일 이내에 관련 사진 및 개인정보를 파기합니다. 회원 탈퇴 시 즉시 파기합니다.</p>
      </Section>

      <Section title="5. 이용자의 권리">
        <p>이용자는 언제든지 본인의 개인정보 열람, 수정, 삭제를 요청할 수 있습니다. 문의: contact@supervlabs.io</p>
      </Section>

      <Section title="6. 운영자 정보">
        <p>주식회사 슈퍼빌랩스 (Supervlabs Inc.)</p>
        <p>사업자등록번호: 856-87-02886</p>
        <p>이메일: contact@supervlabs.io</p>
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
