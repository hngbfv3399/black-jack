import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import GameCanvas from "./GameCanvas";
import { ArrowLeft, LogOut, Check, Coins, RefreshCw, BookOpen, X, Settings } from "lucide-react";

function getCardValueNum(cardValue: string): number {
  if (["J", "Q", "K"].includes(cardValue)) return 10;
  if (cardValue === "A") return 11;
  return parseInt(cardValue, 10);
}

function getBasicStrategyRecommendation(playerCards: any[], dealerUpcard: any): "H" | "S" | "D" | "P" {
  if (!playerCards || playerCards.length < 2 || !dealerUpcard) return "H";

  const dealerVal = getCardValueNum(dealerUpcard.value);
  const isPair = playerCards.length === 2 && playerCards[0].value === playerCards[1].value;
  
  // Calculate if soft hand
  let hasAce = playerCards.some(c => c.value === "A");
  let softValue = 0;
  let hardValue = 0;
  playerCards.forEach(c => {
    if (c.value === "A") {
      softValue += 11;
      hardValue += 1;
    } else if (["J", "Q", "K"].includes(c.value)) {
      softValue += 10;
      hardValue += 10;
    } else {
      const v = parseInt(c.value, 10);
      softValue += v;
      hardValue += v;
    }
  });

  const isSoft = hasAce && softValue <= 21;
  const activeValue = isSoft ? softValue : hardValue;

  // 1. Pairs splitting strategy
  if (isPair) {
    const pairCardVal = playerCards[0].value;
    if (pairCardVal === "A" || pairCardVal === "8") return "P"; // Always split Aces & 8s
    if (pairCardVal === "9") {
      return (dealerVal >= 2 && dealerVal <= 9 && dealerVal !== 7) ? "P" : "S";
    }
    if (pairCardVal === "7" || pairCardVal === "3" || pairCardVal === "2") {
      return (dealerVal >= 2 && dealerVal <= 7) ? "P" : "H";
    }
    if (pairCardVal === "6") {
      return (dealerVal >= 2 && dealerVal <= 6) ? "P" : "H";
    }
    if (pairCardVal === "5") {
      return (dealerVal >= 2 && dealerVal <= 9) ? "D" : "H"; // Double 5s
    }
    if (pairCardVal === "4") {
      return (dealerVal === 5 || dealerVal === 6) ? "P" : "H";
    }
    // 10s, J, Q, K
    return "S"; // Never split 10s
  }

  // 2. Soft hands strategy
  if (isSoft) {
    const otherVal = activeValue - 11;
    if (otherVal >= 8) return "S";
    if (otherVal === 7) {
      if (dealerVal >= 2 && dealerVal <= 6) return "D";
      if (dealerVal === 7 || dealerVal === 8) return "S";
      return "H";
    }
    if (otherVal === 6) {
      return (dealerVal >= 3 && dealerVal <= 6) ? "D" : "H";
    }
    if (otherVal === 5 || otherVal === 4) {
      return (dealerVal >= 4 && dealerVal <= 6) ? "D" : "H";
    }
    if (otherVal === 3 || otherVal === 2) {
      return (dealerVal === 5 || dealerVal === 6) ? "D" : "H";
    }
  }

  // 3. Hard hands strategy
  if (activeValue >= 17) return "S";
  if (activeValue === 16 || activeValue === 15 || activeValue === 14 || activeValue === 13) {
    return (dealerVal >= 2 && dealerVal <= 6) ? "S" : "H";
  }
  if (activeValue === 12) {
    return (dealerVal >= 4 && dealerVal <= 6) ? "S" : "H";
  }
  if (activeValue === 11) return "D";
  if (activeValue === 10) {
    return (dealerVal >= 2 && dealerVal <= 9) ? "D" : "H";
  }
  if (activeValue === 9) {
    return (dealerVal >= 3 && dealerVal <= 6) ? "D" : "H";
  }
  return "H"; // 8 and under
}

const renderHardRows = () => {
  const data = [
    { label: "17+", cells: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"] },
    { label: "16", cells: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"] },
    { label: "15", cells: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"] },
    { label: "14", cells: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"] },
    { label: "13", cells: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"] },
    { label: "12", cells: ["H", "H", "S", "S", "S", "H", "H", "H", "H", "H"] },
    { label: "11", cells: ["D", "D", "D", "D", "D", "D", "D", "D", "D", "H"] },
    { label: "10", cells: ["D", "D", "D", "D", "D", "D", "D", "D", "H", "H"] },
    { label: "9", cells: ["H", "D", "D", "D", "D", "H", "H", "H", "H", "H"] },
    { label: "5-8", cells: ["H", "H", "H", "H", "H", "H", "H", "H", "H", "H"] },
  ];
  return data.map((row, idx) => (
    <tr key={idx}>
      <td className="hand-label hard">{row.label}</td>
      {row.cells.map((cell, cIdx) => (
        <td key={cIdx} className={`cell-action color-${cell}`}>{cell}</td>
      ))}
    </tr>
  ));
};

const renderSoftRows = () => {
  const data = [
    { label: "A,9", cells: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"] },
    { label: "A,8", cells: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"] },
    { label: "A,7", cells: ["D", "D", "D", "D", "D", "S", "S", "H", "H", "H"] },
    { label: "A,6", cells: ["H", "D", "D", "D", "D", "H", "H", "H", "H", "H"] },
    { label: "A,5", cells: ["H", "H", "D", "D", "D", "H", "H", "H", "H", "H"] },
    { label: "A,4", cells: ["H", "H", "D", "D", "D", "H", "H", "H", "H", "H"] },
    { label: "A,3", cells: ["H", "H", "H", "D", "D", "H", "H", "H", "H", "H"] },
    { label: "A,2", cells: ["H", "H", "H", "D", "D", "H", "H", "H", "H", "H"] },
  ];
  return data.map((row, idx) => (
    <tr key={idx}>
      <td className="hand-label soft">{row.label}</td>
      {row.cells.map((cell, cIdx) => (
        <td key={cIdx} className={`cell-action color-${cell}`}>{cell}</td>
      ))}
    </tr>
  ));
};

const renderPairRows = () => {
  const data = [
    { label: "A,A", cells: ["P", "P", "P", "P", "P", "P", "P", "P", "P", "P"] },
    { label: "10,10", cells: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"] },
    { label: "9,9", cells: ["P", "P", "P", "P", "P", "S", "P", "P", "S", "S"] },
    { label: "8,8", cells: ["P", "P", "P", "P", "P", "P", "P", "P", "P", "P"] },
    { label: "7,7", cells: ["P", "P", "P", "P", "P", "P", "H", "H", "H", "H"] },
    { label: "6,6", cells: ["P", "P", "P", "P", "P", "H", "H", "H", "H", "H"] },
    { label: "5,5", cells: ["D", "D", "D", "D", "D", "D", "D", "D", "H", "H"] },
    { label: "4,4", cells: ["H", "H", "H", "P", "P", "H", "H", "H", "H", "H"] },
    { label: "3,3", cells: ["P", "P", "P", "P", "P", "P", "H", "H", "H", "H"] },
    { label: "2,2", cells: ["P", "P", "P", "P", "P", "P", "H", "H", "H", "H"] },
  ];
  return data.map((row, idx) => (
    <tr key={idx}>
      <td className="hand-label pair">{row.label}</td>
      {row.cells.map((cell, cIdx) => (
        <td key={cIdx} className={`cell-action color-${cell}`}>{cell === "P" ? "SP" : cell}</td>
      ))}
    </tr>
  ));
};

interface BlackjackTableProps {
  tableId: any;
  user: any;
  onBackToLobby: () => void;
}

export default function BlackjackTable({ tableId, user, onBackToLobby }: BlackjackTableProps) {
  // DB Hooks (called unconditionally at the top of the component)
  const dbTable = useQuery(api.blackjack.getTable, { tableId });
  const joinSeat = useMutation(api.blackjack.joinSeat);
  const leaveSeat = useMutation(api.blackjack.leaveSeat);
  const leaveTable = useMutation(api.blackjack.leaveTable);
  const placeBet = useMutation(api.blackjack.placeBet);
  const playAction = useMutation(api.blackjack.playAction);
  const refillBalance = useMutation(api.users.refillBalance);

  const table = dbTable;

  // Betting states
  const [currentBet, setCurrentBet] = useState<number>(0);
  const [betError, setBetError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isRefilling, setIsRefilling] = useState<boolean>(false);
  const [isStrategyOpen, setIsStrategyOpen] = useState<boolean>(false);
  const [isStrategyHelperEnabled, setIsStrategyHelperEnabled] = useState<boolean>(() => {
    return localStorage.getItem("blackjack_strategy_helper") !== "false";
  });
  const [isBettingHelperEnabled, setIsBettingHelperEnabled] = useState<boolean>(() => {
    return localStorage.getItem("blackjack_betting_helper") !== "false";
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const handleRefill = async () => {
    setIsRefilling(true);
    try {
      await refillBalance();
    } catch (err: any) {
      alert(err.message || "칩 충전에 실패했습니다.");
    } finally {
      setIsRefilling(false);
    }
  };


  // Find player seat
  const playerSeatIndex = table
    ? table.seats.findIndex((s: any) => s.userId === user._id)
    : -1;
  const isSeated = playerSeatIndex !== -1;
  const playerSeat = isSeated && table ? table.seats[playerSeatIndex] : null;

  // Calculate Card Counting metrics for betting recommendation
  let trueCount = 0;
  let adviceBet = 25;
  let adviceStatus = "";
  let adviceMessage = "";
  let adviceStatusColor = "";

  if (table && isBettingHelperEnabled) {
    const runningCount = table.runningCount ?? 0;
    const currentCardsCount = table.deck.length;
    const decksRemaining = Math.max(0.1, currentCardsCount / 52);
    trueCount = runningCount / decksRemaining;

    if (trueCount <= -1) {
      adviceBet = 10;
      adviceStatus = "딜러 유리 (카운트 낮음)";
      adviceMessage = "낮은 카드들이 많이 빠져 딜러에게 유리합니다. 손실 최소화를 위해 최소 베팅($10)을 추천합니다.";
      adviceStatusColor = "#ef4444"; // red
    } else if (trueCount > 1) {
      const multiplier = Math.round(trueCount);
      adviceBet = 25 * multiplier;
      adviceStatus = "플레이어 유리 (카운트 높음)";
      adviceMessage = `높은 카드들이 많이 남아 플레이어에게 유리합니다. 적극적인 비례 배팅($${adviceBet})을 추천합니다.`;
      adviceStatusColor = "#10b981"; // green
    } else {
      adviceBet = 25;
      adviceStatus = "중립 (카운트 평탄)";
      adviceMessage = "카드가 골고루 섞여 있어 중립 상태입니다. 기본 베팅($25)을 추천합니다.";
      adviceStatusColor = "var(--gold)"; // gold
    }

    if (playerSeat && adviceBet > playerSeat.balance) {
      adviceBet = playerSeat.balance;
    }
  }

  // Turn check
  const isMyTurn = table && table.status === "playing" && table.activeSeatIndex === playerSeatIndex && isSeated;

  // Clear bet if table status shifts or player stands up
  useEffect(() => {
    if (table && table.status !== "betting") {
      setCurrentBet(0);
      setBetError("");
    }
  }, [table?.status]);

  // Redirect to lobby if no table
  useEffect(() => {
    if (table === null) {
      alert("방장이 방을 닫았거나 이 테이블을 사용할 수 없습니다.");
      onBackToLobby();
    }
  }, [table, onBackToLobby]);

  // Return loading state if table doesn't exist yet
  if (table === undefined) {
    return (
      <div className="table-loading">
        <RefreshCw className="spinner animate-spin" size={40} />
        <p>테이블 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (table === null) {
    return null;
  }

  // Seating mutators
  const handleJoinSeat = async (seatIdx: number) => {
    try {
      await joinSeat({ tableId, seatIndex: seatIdx });
    } catch (err: any) {
      alert(err.message || "착석에 실패했습니다.");
    }
  };

  const handleLeaveSeat = async () => {
    if (playerSeatIndex === -1) return;
    
    if (confirm("자리에서 일어나시겠습니까? 게임이 진행 중일 때 일어나면 베팅 금액을 잃게 됩니다.")) {
      try {
        await leaveSeat({ tableId, seatIndex: playerSeatIndex });
      } catch (err: any) {
        alert(err.message || "자리에서 일어나는 데 실패했습니다.");
      }
    }
  };

  const handleBackToLobby = async () => {
    try {
      await leaveTable({ tableId });
    } catch (err: any) {
      console.error("테이블 퇴장에 실패했습니다:", err);
    }
    onBackToLobby();
  };

  // Betting Actions
  const handleAddChip = (val: number) => {
    const seatObj = playerSeat;
    if (!seatObj) return;
    const nextBet = currentBet + val;
    if (nextBet > seatObj.balance) {
      setBetError("베팅할 칩이 부족합니다.");
      return;
    }
    setBetError("");
    setCurrentBet(nextBet);
  };

  const handleClearBet = () => {
    setCurrentBet(0);
    setBetError("");
  };

  const handleConfirmBet = async () => {
    const seatObj = playerSeat;
    if (currentBet <= 0 || !seatObj) return;
    setIsSubmitting(true);
    
    try {
      await placeBet({ tableId, seatIndex: playerSeatIndex, amount: currentBet });
    } catch (err: any) {
      setBetError(err.message || "베팅 확정에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Gameplay Actions
  const handleAction = async (actionType: string) => {
    if (!isMyTurn) return;
    setIsSubmitting(true);
    try {
      await playAction({ tableId, seatIndex: playerSeatIndex, action: actionType });
    } catch (err: any) {
      alert(err.message || `${actionType} 수행에 실패했습니다.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="table-container" style={{ display: "flex", flexDirection: "row", width: "100%", overflow: "hidden" }}>
      {/* Table Side */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", position: "relative" }}>
        {/* HUD Header */}
        <header className="table-header glass">
          <div className="left-controls">
            <button className="btn-secondary back-btn" onClick={handleBackToLobby}>
              <ArrowLeft size={16} />
              <span className="btn-text">로비</span>
            </button>
            <div className="table-info">
              <span className="name">{table.name}</span>
              <span className="round">라운드 {table.roundNumber}</span>
            </div>
          </div>

          <div className="right-controls">
            {isSeated && (
              <button className="btn-danger stand-up-btn" onClick={handleLeaveSeat}>
                <LogOut size={14} />
                <span className="btn-text">일어나기</span>
              </button>
            )}
            {!isSeated && (user.balance ?? 0) < 1000 && (
              <button 
                className="btn-primary refill-btn animate-pulse" 
                onClick={handleRefill}
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
              onClick={() => setIsStrategyOpen(true)}
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

        {/* Primary Canvas Area */}
        <div className="gameplay-area">
          <GameCanvas 
            table={table} 
            currentUserId={user._id} 
            onJoinSeat={handleJoinSeat} 
            isStrategyHelperEnabled={isStrategyHelperEnabled}
            isBettingHelperEnabled={isBettingHelperEnabled}
          />
          
          {/* Seat empty prompt (for spectators) */}
          {!isSeated && table.status === "waiting" && (
            <div className="spectator-prompt glass animate-fade-in">
              <p>테이블 위 빈 자리를 클릭하여 앉아서 게임에 참여하세요!</p>
            </div>
          )}
        </div>

        {/* Action panel HUD footer */}
        <footer className="table-footer glass">
          {!isSeated ? (
            <div className="footer-message" style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
              <p>관전 중입니다. 테이블 위 빈 자리를 클릭하여 착석하세요.</p>
              {(user.balance ?? 0) < 1000 && (
                <button 
                  className="btn-primary refill-btn animate-pulse" 
                  onClick={handleRefill}
                  disabled={isRefilling}
                  style={{
                    padding: "6px 16px",
                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                    boxShadow: "0 4px 12px rgba(245, 158, 11, 0.4)",
                    border: "none",
                    color: "#fff",
                    fontWeight: "bold",
                    borderRadius: "4px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginTop: "4px"
                  }}
                >
                  <Coins size={14} />
                  {isRefilling ? "충전 중..." : "무료 칩 충전 ($3,000)"}
                </button>
              )}
            </div>
          ) : table.status === "waiting" ? (
            <div className="footer-message">
              <p>다른 플레이어의 참가를 기다리는 중... 누군가 자리에 앉으면 라운드가 시작됩니다.</p>
            </div>
          ) : table.status === "betting" ? (
            // Betting Phase HUD
            playerSeat && playerSeat.bet > 0 ? (
              <div className="bet-confirmed glass-green">
                <Check size={20} className="check-icon" />
                <p>베팅액 <strong>${playerSeat.bet}</strong>이 확정되었습니다. 카드가 딜링되기를 기다리는 중...</p>
              </div>
            ) : (
              <div className="betting-hud animate-slide-up">
                <div className="hud-label">
                  <span>베팅을 진행해주세요</span>
                  <span className="balance-hint">보유 칩: ${playerSeat?.balance.toLocaleString()}</span>
                </div>

                {isBettingHelperEnabled && (
                  <div className="betting-recommendation-banner glass animate-fade-in">
                    <div className="rec-header">
                      <div className="rec-title-group">
                        <Coins size={14} style={{ color: adviceStatusColor }} />
                        <span className="rec-label">추천 베팅:</span>
                        <span className="rec-status" style={{ color: adviceStatusColor }}>{adviceStatus}</span>
                      </div>
                      <div className="rec-action-group">
                        <span className="rec-tc">
                          (TC: {trueCount >= 0 ? "+" : ""}{trueCount.toFixed(1)})
                        </span>
                        <button
                          onClick={() => {
                            if (playerSeat) {
                              setCurrentBet(adviceBet);
                              setBetError("");
                            }
                          }}
                          className="btn-apply-bet"
                          disabled={isSubmitting}
                        >
                          적용 (${adviceBet})
                        </button>
                      </div>
                    </div>
                    <div className="rec-message">
                      {adviceMessage}
                    </div>
                  </div>
                )}
                
                {/* Tactile Chip selectors */}
                <div className="chip-rack">
                  {[10, 25, 100, 500, 1000].map((val) => (
                    <button
                      key={val}
                      className={`chip-btn color-${val}`}
                      onClick={() => handleAddChip(val)}
                      disabled={isSubmitting || (playerSeat ? val > playerSeat.balance : false)}
                    >
                      ${val}
                    </button>
                  ))}
                </div>

                {/* Bet values & Confirmations */}
                <div className="bet-actions">
                  <div className="bet-display">
                    <span className="label">현재 베팅금:</span>
                    <span className="val">${currentBet}</span>
                  </div>

                  <div className="buttons">
                    <button
                      className="btn-danger-outline"
                      onClick={handleClearBet}
                      disabled={currentBet === 0 || isSubmitting}
                    >
                      초기화
                    </button>
                    <button
                      className="btn-primary confirm-bet-btn"
                      onClick={handleConfirmBet}
                      disabled={currentBet === 0 || isSubmitting}
                    >
                      베팅 확정
                    </button>
                  </div>
                </div>
                {betError && <div className="bet-error-msg">{betError}</div>}
              </div>
            )
          ) : table.status === "playing" ? (
            // Active Gameplay Action HUD
            isMyTurn ? (() => {
              const activeHandIndex = playerSeat ? (playerSeat.activeHandIndex ?? 0) : 0;
              const activeCards = playerSeat ? (playerSeat.splitCards && activeHandIndex === 1 ? playerSeat.splitCards : playerSeat.cards) : [];
              const dealerUpcard = table.dealer?.cards?.[0];
              const advice = (activeCards.length >= 2 && dealerUpcard) ? getBasicStrategyRecommendation(activeCards, dealerUpcard) : null;
              
              const canDouble = activeCards.length === 2 && playerSeat && playerSeat.balance >= (activeHandIndex === 1 ? playerSeat.splitBet! : playerSeat.bet);
              const canSplit = playerSeat && !playerSeat.splitCards && playerSeat.cards.length === 2 && 
                                playerSeat.cards[0].value === playerSeat.cards[1].value && 
                                playerSeat.balance >= playerSeat.bet;

              const isHitRecommended = advice === "H" && isStrategyHelperEnabled;
              const isStandRecommended = advice === "S" && isStrategyHelperEnabled;
              const isDoubleRecommended = advice === "D" && isStrategyHelperEnabled;
              const isSplitRecommended = advice === "P" && isStrategyHelperEnabled;

              return (
                <div className="action-hud animate-slide-up">
                  <div className="hud-status-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "12px" }}>
                    <div className="turn-indicator">
                      당신의 차례입니다! {playerSeat?.splitCards && `(핸드 ${activeHandIndex + 1})`}
                    </div>
                    {isStrategyHelperEnabled && advice && (
                      <div className="strategy-advisor animate-fade-in" style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255, 255, 255, 0.05)", padding: "4px 10px", borderRadius: "6px", border: "1px solid rgba(226, 184, 66, 0.15)" }}>
                        <span className="advisor-tag" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>추천:</span>
                        <strong className={`advice-badge color-${advice}`} style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }}>
                          {advice === "H" ? "히트" : advice === "S" ? "스탠드" : advice === "D" ? "더블 다운" : "스플릿"}
                        </strong>
                      </div>
                    )}
                  </div>

                  <div className="action-buttons">
                    <button
                      className={`btn-primary hit-btn ${isHitRecommended ? "recommended-action-btn" : ""}`}
                      onClick={() => handleAction("hit")}
                      disabled={isSubmitting}
                    >
                      {isHitRecommended ? "히트 (추천)" : "히트"}
                    </button>
                    <button
                      className={`btn-secondary stand-btn ${isStandRecommended ? "recommended-action-btn" : ""}`}
                      onClick={() => handleAction("stand")}
                      disabled={isSubmitting}
                    >
                      {isStandRecommended ? "스탠드 (추천)" : "스탠드"}
                    </button>
                    {canDouble && (
                      <button
                        className={`btn-accent double-btn ${isDoubleRecommended ? "recommended-action-btn" : ""}`}
                        onClick={() => handleAction("double")}
                        disabled={isSubmitting}
                      >
                        {isDoubleRecommended ? "더블 다운 (추천)" : "더블 다운"}
                      </button>
                    )}
                    {canSplit && (
                      <button
                        className={`btn-accent split-btn ${isSplitRecommended ? "recommended-action-btn" : ""}`}
                        onClick={() => handleAction("split")}
                        disabled={isSubmitting}
                        style={{
                          background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                          boxShadow: "0 4px 15px rgba(245, 158, 11, 0.3)"
                        }}
                      >
                        {isSplitRecommended ? "스플릿 (추천)" : "스플릿"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div className="footer-message">
                <p>
                  {table.activeSeatIndex !== -1 && table.seats[table.activeSeatIndex]
                    ? `${table.seats[table.activeSeatIndex].nickname}님의 행동을 기다리는 중...`
                    : "카드를 나누는 중..."}
                </p>
              </div>
            )
          ) : (
            // Dealer Turn / Settle Phase HUD
            <div className="footer-message">
              <p>
                {table.status === "dealer_turn" ? "딜러가 차례를 플레이 중입니다..." : "라운드가 종료되었습니다! 베팅을 정산하는 중..."}
              </p>
            </div>
          )}
        </footer>
      </div>

      {isStrategyOpen && (
        <div className="strategy-modal-backdrop" onClick={() => setIsStrategyOpen(false)}>
          <div className="strategy-modal glass animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>블랙잭 기본 전략 가이드</h3>
              <button className="btn-close" onClick={() => setIsStrategyOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="modal-body">
              <p className="strategy-intro">
                이 가이드는 플레이어의 카드 합계(왼쪽 열)와 딜러의 오픈 카드(상단 행)를 바탕으로 수학적으로 가장 유리한 선택을 보여줍니다.
              </p>
              
              <div className="legend">
                <span className="legend-item"><span className="legend-color color-H">H</span> 히트</span>
                <span className="legend-item"><span className="legend-color color-S">S</span> 스탠드</span>
                <span className="legend-item"><span className="legend-color color-D">D</span> 더블 다운</span>
                <span className="legend-item"><span className="legend-color color-P">SP</span> 스플릿</span>
              </div>

              <div className="strategy-chart-wrapper">
                <table className="strategy-chart-table">
                  <thead>
                    <tr>
                      <th className="sticky-corner">플레이어 핸드</th>
                      {["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"].map(val => (
                        <th key={val}>{val}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="section-row"><td colSpan={11}>하드 핸드 (에이스 미포함)</td></tr>
                    {renderHardRows()}
                    
                    <tr className="section-row"><td colSpan={11}>소프트 핸드 (에이스 포함)</td></tr>
                    {renderSoftRows()}
                    
                    <tr className="section-row"><td colSpan={11}>페어 핸드 (스플릿 가능)</td></tr>
                    {renderPairRows()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
