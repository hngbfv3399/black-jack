import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface OnboardingProps {
  onComplete: (nickname?: string) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    const trimmed = nickname.trim();
    if (trimmed.length < 2) {
      setError("닉네임은 최소 2글자 이상이어야 합니다.");
      return;
    }
    if (trimmed.length > 15) {
      setError("닉네임은 15글자를 초과할 수 없습니다.");
      return;
    }
    if (!/^[a-zA-Z0-9가-힣\s-_]+$/.test(trimmed)) {
      setError("닉네임은 한글, 영문, 숫자, 공백, -, _만 포함할 수 있습니다.");
      return;
    }

    setIsLoading(true);
    try {
      await completeOnboarding({ nickname: trimmed });
      onComplete();
    } catch (err: any) {
      setError(err.message || "닉네임 설정에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card glass">
        <div className="brand-header animate-glow">
          <span className="brand-icon">♠</span>
          <h1>온라인 블랙잭</h1>
        </div>
        <p className="onboarding-subtitle">
          테이블에 오신 것을 환영합니다! 닉네임을 설정하고 초기 자금 <strong>$3,000</strong>를 받으세요.
        </p>

        <form onSubmit={handleSubmit} className="onboarding-form">
          <div className="input-group">
            <label htmlFor="nickname">닉네임 설정</label>
            <input
              type="text"
              id="nickname"
              placeholder="닉네임을 입력하세요..."
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={isLoading}
              maxLength={15}
              autoFocus
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn-primary onboarding-btn"
            disabled={isLoading || !nickname.trim()}
          >
            {isLoading ? "프로필 설정 중..." : "$3,000 받고 시작하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
