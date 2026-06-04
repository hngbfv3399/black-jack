import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import GameCanvas from "./GameCanvas";
import { ArrowLeft, LogOut, Check, Coins, RefreshCw } from "lucide-react";

interface BlackjackTableProps {
  tableId: any;
  user: any;
  onBackToLobby: () => void;
}

export default function BlackjackTable({ tableId, user, onBackToLobby }: BlackjackTableProps) {
  const table = useQuery(api.blackjack.getTable, { tableId });
  const joinSeat = useMutation(api.blackjack.joinSeat);
  const leaveSeat = useMutation(api.blackjack.leaveSeat);
  const leaveTable = useMutation(api.blackjack.leaveTable);
  const placeBet = useMutation(api.blackjack.placeBet);
  const playAction = useMutation(api.blackjack.playAction);

  // Betting states
  const [currentBet, setCurrentBet] = useState<number>(0);
  const [betError, setBetError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Find player's current seat (if any)
  const playerSeatIndex = table
    ? table.seats.findIndex((s) => s.userId === user._id)
    : -1;
  const isSeated = playerSeatIndex !== -1;
  const playerSeat = isSeated && table ? table.seats[playerSeatIndex] : null;

  // Track if it's the user's turn
  const isMyTurn = table && table.status === "playing" && table.activeSeatIndex === playerSeatIndex && isSeated;

  // Clear bet if table status shifts or player stands up
  useEffect(() => {
    if (table && table.status !== "betting") {
      setCurrentBet(0);
      setBetError("");
    }
  }, [table?.status]);

  // Redirect to lobby if the table is deleted/no longer exists
  useEffect(() => {
    if (table === null) {
      alert("The host has closed the room, or this table is no longer available.");
      onBackToLobby();
    }
  }, [table, onBackToLobby]);

  if (table === undefined) {
    return (
      <div className="table-loading">
        <RefreshCw className="spinner" size={40} />
        <p>Loading table state...</p>
      </div>
    );
  }

  if (table === null) {
    return null;
  }

  // Seating mutator
  const handleJoinSeat = async (seatIdx: number) => {
    try {
      await joinSeat({ tableId, seatIndex: seatIdx });
    } catch (err: any) {
      alert(err.message || "Failed to sit down.");
    }
  };

  const handleLeaveSeat = async () => {
    if (playerSeatIndex === -1) return;
    if (confirm("Are you sure you want to stand up? If a round is active, you will forfeit your bet.")) {
      try {
        await leaveSeat({ tableId, seatIndex: playerSeatIndex });
      } catch (err: any) {
        alert(err.message || "Failed to leave seat.");
      }
    }
  };

  const handleBackToLobby = async () => {
    try {
      await leaveTable({ tableId });
    } catch (err: any) {
      console.error("Failed to leave table:", err);
    }
    onBackToLobby();
  };

  // Betting Actions
  const handleAddChip = (val: number) => {
    if (!playerSeat) return;
    const nextBet = currentBet + val;
    if (nextBet > playerSeat.balance) {
      setBetError("Not enough chips for this bet.");
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
    if (currentBet <= 0 || !playerSeat) return;
    setIsSubmitting(true);
    try {
      await placeBet({ tableId, seatIndex: playerSeatIndex, amount: currentBet });
    } catch (err: any) {
      setBetError(err.message || "Failed to place bet.");
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
      alert(err.message || `Failed to ${actionType}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="table-container">
      {/* HUD Header */}
      <header className="table-header glass">
        <div className="left-controls">
          <button className="btn-secondary back-btn" onClick={handleBackToLobby}>
            <ArrowLeft size={16} />
            <span className="btn-text">Lobby</span>
          </button>
          <div className="table-info">
            <span className="name">{table.name}</span>
            <span className="round">Round {table.roundNumber}</span>
          </div>
        </div>

        <div className="right-controls">
          {isSeated && (
            <button className="btn-danger stand-up-btn" onClick={handleLeaveSeat}>
              <LogOut size={14} />
              <span className="btn-text">Stand Up</span>
            </button>
          )}
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
        />
        
        {/* Seat empty prompt (for spectators) */}
        {!isSeated && table.status === "waiting" && (
          <div className="spectator-prompt glass animate-fade-in">
            <p>Click on any empty seat circle on the table felt to sit down and play!</p>
          </div>
        )}
      </div>

      {/* Action panel HUD footer */}
      <footer className="table-footer glass">
        {!isSeated ? (
          <div className="footer-message">
            <p>You are spectating. Click an empty seat circle on the table felt above to sit down.</p>
          </div>
        ) : table.status === "waiting" ? (
          <div className="footer-message">
            <p>Waiting for other players to join... The round will start as soon as someone sits down.</p>
          </div>
        ) : table.status === "betting" ? (
          // Betting Phase HUD
          playerSeat && playerSeat.bet > 0 ? (
            <div className="bet-confirmed glass-green">
              <Check size={20} className="check-icon" />
              <p>Bet of <strong>${playerSeat.bet}</strong> confirmed. Waiting for cards to deal...</p>
            </div>
          ) : (
            <div className="betting-hud animate-slide-up">
              <div className="hud-label">
                <span>PLACE YOUR BET</span>
                <span className="balance-hint">Wallet: ${playerSeat?.balance.toLocaleString()}</span>
              </div>
              
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
                  <span className="label">Current Bet:</span>
                  <span className="val">${currentBet}</span>
                </div>

                <div className="buttons">
                  <button
                    className="btn-danger-outline"
                    onClick={handleClearBet}
                    disabled={currentBet === 0 || isSubmitting}
                  >
                    Clear
                  </button>
                  <button
                    className="btn-primary confirm-bet-btn"
                    onClick={handleConfirmBet}
                    disabled={currentBet === 0 || isSubmitting}
                  >
                    Confirm Bet
                  </button>
                </div>
              </div>
              {betError && <div className="bet-error-msg">{betError}</div>}
            </div>
          )
        ) : table.status === "playing" ? (
          // Active Gameplay Action HUD
          isMyTurn ? (
            <div className="action-hud animate-slide-up">
              <div className="turn-indicator">Your Turn!</div>
              <div className="action-buttons">
                <button
                  className="btn-primary hit-btn"
                  onClick={() => handleAction("hit")}
                  disabled={isSubmitting}
                >
                  Hit
                </button>
                <button
                  className="btn-secondary stand-btn"
                  onClick={() => handleAction("stand")}
                  disabled={isSubmitting}
                >
                  Stand
                </button>
                {playerSeat && playerSeat.cards.length === 2 && playerSeat.balance >= playerSeat.bet && (
                  <button
                    className="btn-accent double-btn"
                    onClick={() => handleAction("double")}
                    disabled={isSubmitting}
                  >
                    Double Down
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="footer-message">
              <p>
                {table.activeSeatIndex !== -1 && table.seats[table.activeSeatIndex]
                  ? `Waiting for ${table.seats[table.activeSeatIndex].nickname}'s action...`
                  : "Dealing cards..."}
              </p>
            </div>
          )
        ) : (
          // Dealer Turn / Settle Phase HUD
          <div className="footer-message">
            <p>
              {table.status === "dealer_turn" ? "Dealer's turn to play..." : "Round finished! Settling bets..."}
            </p>
          </div>
        )}
      </footer>
    </div>
  );
}
