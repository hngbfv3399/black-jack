import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { LogOut, Plus, RefreshCw, Spade, Trophy, Coins } from "lucide-react";

interface LobbyProps {
  user: any;
  onSelectTable: (tableId: any) => void;
  onSignOut: () => void;
}

export default function Lobby({ user, onSelectTable, onSignOut }: LobbyProps) {
  const dbTables = useQuery(api.blackjack.listTables);
  const leaderboard = useQuery(api.users.getLeaderboard);
  const seedDefaultTable = useMutation(api.blackjack.seedDefaultTable);
  const refillBalance = useMutation(api.users.refillBalance);
  
  const [tableName, setTableName] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isRefilling, setIsRefilling] = useState(false);

  const handleRefill = async () => {
    setIsRefilling(true);
    setError("");
    try {
      await refillBalance();
    } catch (err: any) {
      setError(err.message || "Failed to refill balance.");
    } finally {
      setIsRefilling(false);
    }
  };

  const handleQuickPlay = async () => {
    try {
      const tableId = await seedDefaultTable();
      onSelectTable(tableId);
    } catch {
      setError("Failed to start quick play table.");
    }
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const name = tableName.trim();
    if (name.length < 2) {
      setError("Table name must be at least 2 characters.");
      return;
    }
    
    setIsCreating(true);
    try {
      const createTable = (api.blackjack as any).createTable;
      if (createTable) {
        const tableId = await createTable({ name });
        onSelectTable(tableId);
      } else {
        const tableId = await seedDefaultTable();
        onSelectTable(tableId);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || "Failed to create table.");
    } finally {
      setIsCreating(false);
      setTableName("");
    }
  };

  return (
    <div className="lobby-container">
      {/* Header bar */}
      <header className="lobby-header glass">
        <div className="logo animate-glow">
          <Spade className="logo-icon" />
          <span>Antigravity Blackjack</span>
        </div>
        <div className="user-profile">
          <div className="profile-info">
            <span className="profile-name">{user.nickname}</span>
            <span className="profile-balance">${user.balance?.toLocaleString()}</span>
          </div>
          <button className="btn-logout" onClick={onSignOut} title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main content grid */}
      <main className="lobby-content">
        {/* Left side: Stats / Leaderboard */}
        <section className="lobby-sidebar glass">
          <div className="promo-card">
            <h3>Welcome back!</h3>
            <p>Ready to beat the dealer? Sit at any open seat. Tables support up to 8 players in real-time.</p>
            <div className="balance-box">
              <span className="label">YOUR CHIPS</span>
              <span className="amount">${user.balance?.toLocaleString()}</span>
            </div>
            {(user.balance ?? 0) < 1000 && (
              <button 
                className="btn-primary refill-btn animate-pulse" 
                onClick={handleRefill}
                disabled={isRefilling}
                style={{ 
                  marginTop: '12px', 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                <Coins size={16} />
                {isRefilling ? "Refilling..." : "Refill Free Chips ($3,000)"}
              </button>
            )}
          </div>


          {/* Real-time Leaderboard Ranking */}
          <div className="leaderboard-card glass">
            <div className="leaderboard-header">
              <Trophy size={18} className="trophy-icon" />
              <h4>Global Leaderboard</h4>
            </div>
            
            {leaderboard === undefined ? (
              <div className="leaderboard-loading">
                <RefreshCw className="spinner animate-spin" size={16} />
                <span>Loading rankings...</span>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="leaderboard-empty">No ranked players yet.</div>
            ) : (
              <div className="leaderboard-list">
                {leaderboard.map((player, idx) => {
                  const isCurrentUser = player._id === user._id;
                  const rank = idx + 1;
                  return (
                    <div 
                      key={player._id} 
                      className={`leaderboard-item ${isCurrentUser ? "current-user" : ""}`}
                    >
                      <div className="leaderboard-rank">
                        {rank === 1 ? (
                          <span className="rank-badge rank-1">🥇</span>
                        ) : rank === 2 ? (
                          <span className="rank-badge rank-2">🥈</span>
                        ) : rank === 3 ? (
                          <span className="rank-badge rank-3">🥉</span>
                        ) : (
                          <span className="rank-badge rank-other">{rank}</span>
                        )}
                      </div>
                      <div className="leaderboard-name" title={player.nickname}>
                        {player.nickname}
                      </div>
                      <div className="leaderboard-balance">
                        ${player.balance.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rules-preview">
            <h4>Table Rules</h4>
            <ul>
              <li>6-deck shoe shuffles at 20% left</li>
              <li>Dealer stands on soft/hard 17s</li>
              <li>Natural Blackjack pays 3:2</li>
              <li>Double Down on initial 2 cards</li>
              <li>15-second turn timers</li>
            </ul>
          </div>
        </section>

        {/* Right side: Table list */}
        <section className="lobby-main glass">
          <div className="section-title-bar">
            <h2>Active Game Tables</h2>
            <button className="btn-secondary quick-play-btn" onClick={handleQuickPlay}>
              Quick Join
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}

          {dbTables === undefined ? (
            <div className="loading-container">
              <RefreshCw className="spinner" />
              <p>Fetching active tables...</p>
            </div>
          ) : dbTables.length === 0 ? (
            <div className="empty-lobby">
              <Spade size={48} className="empty-icon" />
              <p>No tables are open right now. Be the first to open one!</p>
              <button className="btn-primary" onClick={handleQuickPlay}>
                Open Default Table
              </button>
            </div>
          ) : (
            <div className="table-grid">
              {dbTables.map((table) => (
                <div key={table._id} className="table-card glass-hover">
                  <div className="table-card-header">
                    <h3>{table.name}</h3>
                    <span className={`status-badge ${table.status}`}>
                      {table.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="table-card-body">
                    <div className="stat">
                      <span className="label">Players</span>
                      <span className="value">{table.playerCount} / 8</span>
                    </div>
                  </div>
                  <div className="table-card-footer">
                    <button 
                      className="btn-primary table-join-btn"
                      onClick={() => onSelectTable(table._id)}
                      disabled={table.playerCount >= 8}
                    >
                      {table.playerCount >= 8 ? "Table Full" : "Sit In"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create Table Form */}
          <div className="create-table-section glass">
            <h3>Create a New Table</h3>
            <form onSubmit={handleCreateTable} className="create-table-form">
              <input
                type="text"
                placeholder="Enter room/table name (e.g., High Rollers)..."
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                disabled={isCreating}
                maxLength={25}
                required
              />
              <button type="submit" className="btn-primary" disabled={isCreating || !tableName.trim()}>
                <Plus size={18} />
                Create & Join
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
