import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import GameCanvas from "./GameCanvas";
import TableHeader from "./TableHeader";
import StrategyGuideModal from "./StrategyGuideModal";
import { getBasicStrategyRecommendation } from "../utils/basicStrategy";
import { Check, Coins, RefreshCw } from "lucide-react";

// Extracted strategy recommendations and helper render logic to utils/basicStrategy.tsx and components/StrategyGuideModal.tsx

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
  const setInsuranceChoice = useMutation(api.blackjack.setInsuranceChoice);

  const table = dbTable;

  // Betting states
  const [currentBet, setCurrentBet] = useState<number>(0);
  const [sideBetPP, setSideBetPP] = useState<number>(0);
  const [sideBet213, setSideBet213] = useState<number>(0);
  const [betTarget, setBetTarget] = useState<"main" | "pp" | "213">("main");
  const [selectedBettingSeatIndex, setSelectedBettingSeatIndex] = useState<number | null>(null);

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
  const [lastBetExists, setLastBetExists] = useState<boolean>(() => {
    return !!localStorage.getItem(`last_bet_${user._id}`);
  });

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

  const handleInsuranceChoice = async (seatIdx: number, buy: boolean) => {
    setIsSubmitting(true);
    try {
      await setInsuranceChoice({ tableId, seatIndex: seatIdx, buy });
    } catch (err: any) {
      alert(err.message || "보험 선택에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Find player seats (up to 3)
  const playerSeatIndices = table
    ? table.seats
        .map((s: any, idx: number) => ({ s, idx }))
        .filter((item: any) => item.s.userId === user._id)
        .map((item: any) => item.idx)
    : [];
  const isSeated = playerSeatIndices.length > 0;

  // Auto-focus selected betting seat
  useEffect(() => {
    if (table && table.status === "betting") {
      const mySeats = table.seats
        .map((s: any, idx: number) => ({ s, idx }))
        .filter((item: any) => item.s.userId === user._id);
      
      const unbetSeat = mySeats.find((item: any) => item.s.bet === 0);
      if (unbetSeat) {
        setSelectedBettingSeatIndex(unbetSeat.idx);
      } else if (mySeats.length > 0 && selectedBettingSeatIndex === null) {
        setSelectedBettingSeatIndex(mySeats[0].idx);
      }
    } else {
      setSelectedBettingSeatIndex(null);
    }
  }, [table?.status, table?.seats, user._id]);

  // Handle turn selection or betting selection
  const isMyTurn = table && table.status === "playing" && playerSeatIndices.includes(table.activeSeatIndex) && isSeated;
  const playerSeatIndex = isMyTurn 
    ? table.activeSeatIndex 
    : (selectedBettingSeatIndex !== null && playerSeatIndices.includes(selectedBettingSeatIndex)
        ? selectedBettingSeatIndex 
        : (playerSeatIndices[0] ?? -1));
  const playerSeat = playerSeatIndex !== -1 && table ? table.seats[playerSeatIndex] : null;

  // Filter seats where player has insurance decision pending
  const myInsurancePendingSeats = table
    ? table.seats
        .map((s: any, idx: number) => ({ s, idx }))
        .filter((item: any) => item.s.userId === user._id && item.s.bet > 0 && (!item.s.insuranceStatus || item.s.insuranceStatus === "none"))
    : [];

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

  // Clear bet if table status shifts or player stands up
  useEffect(() => {
    if (table && table.status !== "betting") {
      setCurrentBet(0);
      setSideBetPP(0);
      setSideBet213(0);
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

  // Calculate dynamic chip values rack
  let chipMultiplier = 1;
  const playerBal = playerSeat ? playerSeat.balance : (user.balance ?? 3000);
  if (playerBal >= 125000) {
    chipMultiplier = 125;
  } else if (playerBal >= 25000) {
    chipMultiplier = 25;
  } else if (playerBal >= 5000) {
    chipMultiplier = 5;
  }
  const baseChipsList = [10, 50, 100, 500, 1000];
  const activeChipsList = baseChipsList.map(c => c * chipMultiplier);

  // Betting Actions
  const handleAddChip = (val: number) => {
    const seatObj = playerSeat;
    if (!seatObj) return;

    const totalWager = currentBet + sideBetPP + sideBet213;
    if (totalWager + val > seatObj.balance) {
      setBetError("베팅할 칩이 부족합니다.");
      return;
    }
    setBetError("");

    if (betTarget === "main") {
      setCurrentBet(prev => prev + val);
    } else if (betTarget === "pp") {
      setSideBetPP(prev => prev + val);
    } else {
      setSideBet213(prev => prev + val);
    }
  };

  const handleClearBet = () => {
    setCurrentBet(0);
    setSideBetPP(0);
    setSideBet213(0);
    setBetError("");
  };

  const handleAllIn = () => {
    const seatObj = playerSeat;
    if (!seatObj) return;
    const remainingBalance = seatObj.balance;
    if (remainingBalance <= 0) {
      setBetError("베팅할 칩이 부족합니다.");
      return;
    }
    setBetError("");
    if (betTarget === "main") {
      setCurrentBet(remainingBalance - sideBetPP - sideBet213);
    } else if (betTarget === "pp") {
      setSideBetPP(remainingBalance - currentBet - sideBet213);
    } else {
      setSideBet213(remainingBalance - currentBet - sideBetPP);
    }
  };

  const handleConfirmBet = async () => {
    const seatObj = playerSeat;
    if (!seatObj || playerSeatIndex === -1) return;
    if (currentBet <= 0) {
      setBetError("메인 베팅 금액이 필요합니다.");
      return;
    }
    setIsSubmitting(true);
    
    try {
      await placeBet({
        tableId,
        seatIndex: playerSeatIndex,
        amount: currentBet,
        sideBetPerfectPairs: sideBetPP,
        sideBet213: sideBet213,
      });

      // Store the bet as previous bet before clearing!
      localStorage.setItem(`last_bet_${user._id}`, JSON.stringify({
        amount: currentBet,
        sideBetPerfectPairs: sideBetPP,
        sideBet213: sideBet213
      }));
      setLastBetExists(true);

      setCurrentBet(0);
      setSideBetPP(0);
      setSideBet213(0);
      setBetError("");
    } catch (err: any) {
      setBetError(err.message || "베팅 확정에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRebet = () => {
    const seatObj = playerSeat;
    if (!seatObj) return;

    try {
      const stored = localStorage.getItem(`last_bet_${user._id}`);
      if (!stored) return;

      const lastBet = JSON.parse(stored);
      const totalWager = (lastBet.amount ?? 0) + (lastBet.sideBetPerfectPairs ?? 0) + (lastBet.sideBet213 ?? 0);

      if (totalWager > seatObj.balance) {
        setBetError("베팅 재현을 위한 칩이 부족합니다.");
        return;
      }

      setBetError("");
      setCurrentBet(lastBet.amount ?? 0);
      setSideBetPP(lastBet.sideBetPerfectPairs ?? 0);
      setSideBet213(lastBet.sideBet213 ?? 0);
    } catch (e) {
      setBetError("이전 베팅 정보를 불러오는 데 실패했습니다.");
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
        <TableHeader
          tableName={table.name}
          roundNumber={table.roundNumber}
          isSeated={isSeated}
          user={user}
          playerSeat={playerSeat}
          isRefilling={isRefilling}
          onLeaveSeat={handleLeaveSeat}
          onRefill={handleRefill}
          onBackToLobby={handleBackToLobby}
          isStrategyHelperEnabled={isStrategyHelperEnabled}
          setIsStrategyHelperEnabled={setIsStrategyHelperEnabled}
          isBettingHelperEnabled={isBettingHelperEnabled}
          setIsBettingHelperEnabled={setIsBettingHelperEnabled}
          onOpenStrategyGuide={() => setIsStrategyOpen(true)}
        />
        <div className="gameplay-area">
          <GameCanvas 
            table={table} 
            currentUserId={user._id} 
            onJoinSeat={handleJoinSeat} 
            onSelectSeat={(seatIdx) => {
              if (table && table.status === "betting" && table.seats[seatIdx].userId === user._id) {
                setSelectedBettingSeatIndex(seatIdx);
              }
            }}
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
                <p>{playerSeatIndex + 1}번 자리 베팅액 <strong>${playerSeat.bet}</strong>이 확정되었습니다. 카드가 딜링되기를 기다리는 중...</p>
              </div>
            ) : (
              <div className="betting-hud animate-slide-up" style={{ width: "100%" }}>
                {/* Seat selector header */}
                {playerSeatIndices.length > 1 && (
                  <div className="seat-tabs" style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                    {playerSeatIndices.map((idx) => {
                      const seatObj = table.seats[idx];
                      const hasBet = seatObj.bet > 0;
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedBettingSeatIndex(idx);
                            setBetError("");
                          }}
                          style={{
                            flex: 1,
                            padding: "6px 12px",
                            fontSize: "12px",
                            borderRadius: "6px",
                            border: "1px solid",
                            background: selectedBettingSeatIndex === idx ? "rgba(226, 184, 66, 0.2)" : "rgba(255,255,255,0.04)",
                            borderColor: selectedBettingSeatIndex === idx ? "var(--gold)" : "rgba(255,255,255,0.1)",
                            color: selectedBettingSeatIndex === idx ? "var(--gold)" : "white",
                            cursor: "pointer",
                            fontWeight: "bold",
                          }}
                        >
                          {idx + 1}번 자리 {hasBet ? `($${seatObj.bet})` : "(베팅 대기)"}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="hud-label" style={{ marginTop: "4px" }}>
                  <span>{playerSeatIndex + 1}번 자리 베팅을 진행해주세요</span>
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
                
                {/* Bet Target tab selector */}
                <div className="bet-target-selector" style={{ display: "flex", gap: "8px", margin: "8px 0" }}>
                  <button
                    onClick={() => setBetTarget("main")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      fontSize: "12px",
                      borderRadius: "6px",
                      border: "1px solid",
                      background: betTarget === "main" ? "rgba(59, 130, 246, 0.2)" : "rgba(255,255,255,0.03)",
                      borderColor: betTarget === "main" ? "#3b82f6" : "rgba(255,255,255,0.1)",
                      color: betTarget === "main" ? "#60a5fa" : "white",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    메인 베팅 (${currentBet})
                  </button>
                  <button
                    onClick={() => setBetTarget("pp")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      fontSize: "12px",
                      borderRadius: "6px",
                      border: "1px solid",
                      background: betTarget === "pp" ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.03)",
                      borderColor: betTarget === "pp" ? "#10b981" : "rgba(255,255,255,0.1)",
                      color: betTarget === "pp" ? "#34d399" : "white",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    퍼펙트 페어 (${sideBetPP})
                  </button>
                  <button
                    onClick={() => setBetTarget("213")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      fontSize: "12px",
                      borderRadius: "6px",
                      border: "1px solid",
                      background: betTarget === "213" ? "rgba(245, 158, 11, 0.2)" : "rgba(255,255,255,0.03)",
                      borderColor: betTarget === "213" ? "#f59e0b" : "rgba(255,255,255,0.1)",
                      color: betTarget === "213" ? "#fbbf24" : "white",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    21+3 포커 (${sideBet213})
                  </button>
                </div>
                
                {/* Tactile Chip selectors (scaled dynamically) */}
                <div className="chip-rack" style={{ flexWrap: "wrap", gap: "8px" }}>
                  {activeChipsList.map((val, idx) => {
                    const chipColors = ["gray", "green", "blue", "purple", "black"];
                    return (
                      <button
                        key={val}
                        className={`chip-btn color-${chipColors[idx]}`}
                        onClick={() => handleAddChip(val)}
                        disabled={isSubmitting || (playerSeat ? val > playerSeat.balance : false)}
                        style={{
                          width: "50px",
                          height: "50px",
                          fontSize: "12px",
                        }}
                      >
                        ${val >= 1000 ? (val/1000).toFixed(0) + 'K' : val}
                      </button>
                    );
                  })}
                </div>

                {/* Bet values & Confirmations */}
                <div className="bet-actions" style={{ marginTop: "4px" }}>
                  <div className="bet-display" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      총 베팅금: <strong style={{ color: "var(--gold)" }}>${currentBet + sideBetPP + sideBet213}</strong>
                    </div>
                    <div style={{ fontSize: "12px", color: "white" }}>
                      메인: <strong style={{ color: "#60a5fa" }}>${currentBet}</strong> / 
                      PP: <strong style={{ color: "#34d399" }}>${sideBetPP}</strong> / 
                      21+3: <strong style={{ color: "#fbbf24" }}>${sideBet213}</strong>
                    </div>
                  </div>

                  <div className="buttons">
                    <button
                      className="btn-danger-outline"
                      onClick={handleClearBet}
                      disabled={(currentBet === 0 && sideBetPP === 0 && sideBet213 === 0) || isSubmitting}
                      style={{ padding: "8px 12px", fontSize: "13px" }}
                    >
                      초기화
                    </button>
                    {lastBetExists && (
                      <button
                        className="btn-secondary"
                        onClick={handleRebet}
                        disabled={isSubmitting || (playerSeat ? playerSeat.balance <= 0 : true)}
                        style={{ padding: "8px 12px", fontSize: "13px", color: "#60a5fa", borderColor: "rgba(96, 165, 250, 0.4)", background: "transparent" }}
                      >
                        이전 배팅
                      </button>
                    )}
                    <button
                      className="btn-secondary"
                      onClick={handleAllIn}
                      disabled={isSubmitting || (playerSeat ? playerSeat.balance <= 0 : true)}
                      style={{ padding: "8px 12px", fontSize: "13px", color: "var(--gold)", borderColor: "var(--gold)", background: "transparent" }}
                    >
                      올인
                    </button>
                    <button
                      className="btn-primary confirm-bet-btn"
                      onClick={handleConfirmBet}
                      disabled={currentBet === 0 || isSubmitting}
                      style={{ padding: "8px 16px", fontSize: "13px" }}
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
                      {playerSeatIndex + 1}번 자리 차례입니다! {playerSeat?.splitCards && `(핸드 ${activeHandIndex + 1})`}
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
          ) : table.status === "insurance" ? (
            // Insurance Phase HUD
            myInsurancePendingSeats.length > 0 ? (
              <div className="insurance-hud animate-slide-up" style={{ width: "100%", maxWidth: "600px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <h4 style={{ color: "var(--gold)", fontWeight: "bold", margin: 0, fontSize: "14px", textAlign: "center" }}>
                    딜러의 오픈 카드가 에이스(Ace)입니다.
                  </h4>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, textAlign: "center" }}>
                    보험은 메인 베팅금의 1/2을 지불하며, 딜러가 블랙잭일 경우 2:1로 보상받습니다 (원금 보존).
                  </p>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {myInsurancePendingSeats.map((item) => {
                    const insCost = Math.floor(item.s.bet / 2);
                    return (
                      <div key={item.idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <span style={{ fontSize: "12px", fontWeight: "bold" }}>{item.idx + 1}번 자리 (보험료: ${insCost})</span>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            className="btn-danger-outline"
                            style={{ padding: "4px 12px", fontSize: "12px", borderRadius: "4px", cursor: "pointer" }}
                            onClick={() => handleInsuranceChoice(item.idx, false)}
                            disabled={isSubmitting}
                          >
                            보험 거절
                          </button>
                          <button
                            className="btn-primary"
                            style={{ padding: "4px 12px", fontSize: "12px", borderRadius: "4px", cursor: "pointer" }}
                            onClick={() => handleInsuranceChoice(item.idx, true)}
                            disabled={isSubmitting || item.s.balance < insCost}
                          >
                            보험 구매 (${insCost})
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="footer-message">
                <p>다른 플레이어들의 인셔런스 선택을 기다리는 중...</p>
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

      <StrategyGuideModal isOpen={isStrategyOpen} onClose={() => setIsStrategyOpen(false)} />
    </div>
  );
}
