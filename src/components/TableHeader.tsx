import { useState } from "react";
import { ArrowLeft, LogOut, Coins, Settings, BookOpen, X } from "lucide-react";

interface TableHeaderProps {
  tableName: string;
  roundNumber: number;
  isSeated: boolean;
  user: any;
  playerSeat: any;
  isRefilling: boolean;
  onLeaveSeat: () => void;
  onRefill: () => void;
  onBackToLobby: () => void;
  isStrategyHelperEnabled: boolean;
  setIsStrategyHelperEnabled: (val: boolean) => void;
  isBettingHelperEnabled: boolean;
  setIsBettingHelperEnabled: (val: boolean) => void;
  onOpenStrategyGuide: () => void;
}

export default function TableHeader({
  tableName,
  roundNumber,
  isSeated,
  user,
  playerSeat,
  isRefilling,
  onLeaveSeat,
  onRefill,
  onBackToLobby,
  isStrategyHelperEnabled,
  setIsStrategyHelperEnabled,
  isBettingHelperEnabled,
  setIsBettingHelperEnabled,
  onOpenStrategyGuide,
}: TableHeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <header className="table-header glass">
      <div className="left-controls">
        <button className="btn-secondary back-btn" onClick={onBackToLobby}>
          <ArrowLeft size={16} />
          <span className="btn-text">로비</span>
        </button>
        <div className="table-info">
          <span className="name">{tableName}</span>
          <span className="round">라운드 {roundNumber}</span>
        </div>
      </div>

      <div className="right-controls">
        {isSeated && (
          <button className="btn-danger stand-up-btn" onClick={onLeaveSeat}>
            <LogOut size={14} />
            <span className="btn-text">일어나기</span>
          </button>
        )}
        {!isSeated && (user.balance ?? 0) < 1000 && (
          <button 
            className="btn-primary refill-btn animate-pulse" 
            onClick={onRefill}
            disabled={isRefilling}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
              boxShadow: "0 2px 6px rgba(245, 158, 11, 0.4)",
              border: "none",
              color: "#fff",
              fontWeight: "bold",
              borderRadius: "4px",
              cursor: "pointer",
              marginRight: "8px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            <Coins size={12} />
            {isRefilling ? "충전 중..." : "무료 충전"}
          </button>
        )}
        
        {/* Settings Cog Popover Dropdown */}
        <div style={{ position: "relative" }}>
          <button 
            className={`btn-secondary strategy-btn ${isSettingsOpen ? "active" : ""}`}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              fontSize: "12px",
              cursor: "pointer",
              background: isSettingsOpen ? "rgba(226, 184, 66, 0.15)" : "rgba(255, 255, 255, 0.05)",
              borderColor: isSettingsOpen ? "var(--gold)" : "rgba(255, 255, 255, 0.1)"
            }}
          >
            <Settings size={14} className={isSettingsOpen ? "gold" : ""} />
            <span className="btn-text">게임 설정</span>
          </button>
          
          {isSettingsOpen && (
            <div className="glass settings-dropdown" style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              width: "220px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              zIndex: 100,
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(226, 184, 66, 0.3)",
              boxShadow: "0 10px 25px rgba(0,0,0,0.6)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: "bold", color: "var(--gold)" }}>추천 시스템 설정</span>
                <button onClick={() => setIsSettingsOpen(false)} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>
              </div>
              
              {/* Strategy recommendation toggle */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px" }}>기본 전략 추천</span>
                <button
                  onClick={() => {
                    const nextVal = !isStrategyHelperEnabled;
                    setIsStrategyHelperEnabled(nextVal);
                    localStorage.setItem("blackjack_strategy_helper", String(nextVal));
                  }}
                  style={{
                    padding: "4px 10px",
                    fontSize: "11px",
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor: isStrategyHelperEnabled ? "var(--gold)" : "rgba(255,255,255,0.15)",
                    color: isStrategyHelperEnabled ? "var(--gold)" : "var(--text-secondary)",
                    background: isStrategyHelperEnabled ? "rgba(226, 184, 66, 0.15)" : "transparent",
                    fontWeight: "bold",
                    borderRadius: "4px"
                  }}
                >
                  {isStrategyHelperEnabled ? "켜짐" : "꺼짐"}
                </button>
              </div>

              {/* Betting recommendation toggle */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px" }}>카운팅 베팅 추천</span>
                <button
                  onClick={() => {
                    const nextVal = !isBettingHelperEnabled;
                    setIsBettingHelperEnabled(nextVal);
                    localStorage.setItem("blackjack_betting_helper", String(nextVal));
                  }}
                  style={{
                    padding: "4px 10px",
                    fontSize: "11px",
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor: isBettingHelperEnabled ? "var(--gold)" : "rgba(255,255,255,0.15)",
                    color: isBettingHelperEnabled ? "var(--gold)" : "var(--text-secondary)",
                    background: isBettingHelperEnabled ? "rgba(226, 184, 66, 0.15)" : "transparent",
                    fontWeight: "bold",
                    borderRadius: "4px"
                  }}
                >
                  {isBettingHelperEnabled ? "켜짐" : "꺼짐"}
                </button>
              </div>
            </div>
          )}
        </div>

        <button 
          className="btn-secondary strategy-btn" 
          onClick={onOpenStrategyGuide}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 12px",
            fontSize: "12px",
            cursor: "pointer",
            background: "rgba(226, 184, 66, 0.1)",
            borderColor: "rgba(226, 184, 66, 0.2)"
          }}
        >
          <BookOpen size={14} className="gold" />
          <span className="btn-text">기본 전략 가이드</span>
        </button>
        <div className="player-badge">
          <Coins size={14} className="gold" />
          <span>
            <span className="player-badge-name">{user.nickname}: </span>
            <strong>${playerSeat ? playerSeat.balance.toLocaleString() : user.balance.toLocaleString()}</strong>
          </span>
        </div>
      </div>
    </header>
  );
}
