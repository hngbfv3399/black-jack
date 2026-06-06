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
      // Direct OAuth login to Google
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

          <button className="btn-primary login-btn" onClick={handleGoogleLogin}>
            {/* Simple Google SVG Icon */}
            <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
              <path
                fill="#currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Google 계정으로 로그인
          </button>

          <div className="login-footer">
            Google OAuth를 통해 안전하게 인증됩니다.
          </div>
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
