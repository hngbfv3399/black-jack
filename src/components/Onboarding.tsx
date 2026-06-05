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
      setError("Nickname must be at least 2 characters.");
      return;
    }
    if (trimmed.length > 15) {
      setError("Nickname cannot exceed 15 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9가-힣\s-_]+$/.test(trimmed)) {
      setError("Nickname can only contain letters, numbers, spaces, -, and _.");
      return;
    }

    setIsLoading(true);
    try {
      await completeOnboarding({ nickname: trimmed });
      onComplete();
    } catch (err: any) {
      setError(err.message || "Failed to set nickname. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card glass">
        <div className="brand-header animate-glow">
          <span className="brand-icon">♠</span>
          <h1>Blackjack Online</h1>
        </div>
        <p className="onboarding-subtitle">
          Welcome to the high-stakes table! Set your nickname to claim your starting balance of <strong>$3,000</strong>.
        </p>

        <form onSubmit={handleSubmit} className="onboarding-form">
          <div className="input-group">
            <label htmlFor="nickname">Choose Nickname</label>
            <input
              type="text"
              id="nickname"
              placeholder="Enter your nickname..."
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
            {isLoading ? "Setting Profile..." : "Claim $3,000 & Play"}
          </button>
        </form>
      </div>
    </div>
  );
}
