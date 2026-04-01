export const metadata = {
  title: "설정 | 평택 부동산 인사이트",
};

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900">설정</h2>
      <p className="text-gray-500 mt-1">API 키 관리 및 알림 설정</p>

      <div className="mt-8 space-y-4">
        {[
          { label: "카카오 REST API 키", placeholder: "KakaoAK xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", hint: "developers.kakao.com에서 발급" },
          { label: "공공데이터 서비스 키", placeholder: "인코딩된 서비스 키 붙여넣기", hint: "data.go.kr 마이페이지에서 확인" },
          { label: "경기데이터드림 인증키", placeholder: "인증키 붙여넣기", hint: "data.gg.go.kr에서 발급" },
          { label: "GCP 알림 서버 URL", placeholder: "https://your-gcp-server.com/notify", hint: "Cloud Run 또는 App Engine URL" },
        ].map((field) => (
          <div key={field.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-700 mb-1">{field.label}</label>
            <p className="text-xs text-gray-400 mb-2">{field.hint}</p>
            <input
              type="password"
              placeholder={field.placeholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}

        <button className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          저장
        </button>
      </div>
    </div>
  );
}
