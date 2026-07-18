import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import Onboarding from "./components/Onboarding";
import Lobby from "./components/Lobby";
import BlackjackTable from "./components/BlackjackTable";
import { RefreshCw, Spade } from "lucide-react";

export default function App() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const user = useQuery(api.users.viewer);

  const [selectedTableId, setSelectedTableId] = useState<any>(null);
  const [authError, setAuthError] = useState("");

  const handleGoogleLogin = async () => {
    setAuthError("");
    try {
      await signIn("google");
    } catch (err: any) {
      setAuthError("구글 로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setSelectedTableId(null);
    } catch (err) {
      console.error("Sign out failed", err);
    }
  };

  // Loading Screen
  if (authLoading || (isAuthenticated && user === undefined)) {
    return (
      <div className="app-loading">
        <RefreshCw className="spinner" size={48} />
        <p>그랜드 카지노 연결 중...</p>
      </div>
    );
  }

  // If authenticated but user document is null (e.g. deleted from DB), sign out to clear stale session
  if (isAuthenticated && user === null) {
    signOut();
    return (
      <div className="app-loading">
        <RefreshCw className="spinner" size={48} />
        <p>세션 초기화 중...</p>
      </div>
    );
  }

  // Unauthenticated Screen
  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="floating-suits">
          <span className="suit animate-suit-1">♠</span>
          <span className="suit animate-suit-2">♥</span>
          <span className="suit animate-suit-3">♦</span>
          <span className="suit animate-suit-4">♣</span>
        </div>

        <div className="login-card glass">
          <div className="login-logo animate-glow">
            <Spade className="logo-icon-large" />
            <h1>안티그래비티 블랙잭</h1>
          </div>
          <p className="login-tagline">
            실시간 멀티플레이어 온라인 블랙잭을 경험해 보세요. 딜러에게 도전하고 테이블 랭킹을 올리세요!
          </p>

          {authError && <div className="error-message">{authError}</div>}

          <button 
            className="btn-secondary google-login-btn" 
            onClick={handleGoogleLogin}
            style={{ 
              width: "100%", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              gap: "8px", 
              fontWeight: "bold",
              cursor: "pointer",
              marginBottom: "12px",
              background: "#ffffff",
              color: "#1e293b",
              border: "none",
              padding: "12px",
              borderRadius: "8px",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: "4px" }}>
              <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.6z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.91-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.95v2.32A9 9 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.97 10.7A5.4 5.4 0 0 1 3.6 9c0-.58.1-1.15.27-1.7V4.98H.95A9 9 0 0 0 0 9c0 1.76.5 3.4 1.39 4.83l2.58-2.13z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.3A9 9 0 0 0 .95 4.98l3.02 2.32C4.68 5.16 6.66 3.58 9 3.58z"/>
            </svg>
            Google 계정으로 로그인
          </button>

          <div className="login-footer">
            Google 계정으로 간편하게 가입하고 로그인할 수 있습니다.
          </div>
        </div>
      </div>
    );
  }

  // Check if registered user has been approved by admin
  if (isAuthenticated && user && !user.isAnonymous && user.signupApproved === false) {
    return (
      <div className="login-container" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)" }}>
        <div className="login-card glass animate-fade-in" style={{ textAlign: "center", padding: "40px", maxWidth: "420px", width: "90%", borderRadius: "16px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15, 23, 42, 0.75)", backdropFilter: "blur(12px)" }}>
          <Spade className="logo-icon-large" style={{ color: "#ef4444", width: "48px", height: "48px", marginBottom: "20px", margin: "0 auto 20px auto" }} />
          <h2 style={{ color: "#ef4444", fontWeight: "bold", fontSize: "20px", marginBottom: "12px", textAlign: "center" }}>가입 승인 대기 중</h2>
          <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: "1.6", marginBottom: "24px", textAlign: "center" }}>
            회원님의 가입 요청이 등록되었습니다.<br />
            보안 및 비공개 게임 운영을 위해 관리자의 승인이 필요합니다.<br />
            승인이 완료될 때까지 잠시만 기다려 주시거나 관리자에게 문의해 주세요.
          </p>
          <button className="btn-secondary" onClick={handleSignOut} style={{ width: "100%", padding: "10px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>
            로그아웃 후 게스트로 로그인
          </button>
        </div>
      </div>
    );
  }

  // User details successfully fetched but not onboarded yet
  if (user && !user.isOnboarded) {
    return <Onboarding onComplete={() => {}} />;
  }

  // Render Blackjack game board screen if table is active, otherwise lobby
  if (selectedTableId) {
    return (
      <BlackjackTable
        tableId={selectedTableId}
        user={user}
        onBackToLobby={() => setSelectedTableId(null)}
      />
    );
  }

  return (
    <Lobby
      user={user}
      onSelectTable={(tableId) => setSelectedTableId(tableId)}
      onSignOut={handleSignOut}
    />
  );
}
