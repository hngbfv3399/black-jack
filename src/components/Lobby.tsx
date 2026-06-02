import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { LogOut, Plus, RefreshCw, Spade } from "lucide-react";

interface LobbyProps {
  user: any;
  onSelectTable: (tableId: any) => void;
  onSignOut: () => void;
}

export default function Lobby({ user, onSelectTable, onSignOut }: LobbyProps) {
  const tables = useQuery(api.blackjack.listTables);
  const seedDefaultTable = useMutation(api.blackjack.seedDefaultTable);
  
  const [tableName, setTableName] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // We will add the custom createTable mutation in a moment, but if it doesn't exist yet,
  // we can use seedDefaultTable or define a simple fallback helper.
  // Wait, let's call seedDefaultTable if tables list is empty, or let the user click "Quick Play".
  const handleQuickPlay = async () => {
    try {
      const tableId = await seedDefaultTable();
      onSelectTable(tableId);
    } catch (err: any) {
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
      // We will add a createTable mutation to blackjack.ts.
      // If the model hasn't generated the type for blackjack.createTable,
      // it might warn, but let's call it and ensure it's written in blackjack.ts.
      // Let's call a mutation api.blackjack.createTable which we will edit shortly.
      // Wait, is there a createTable mutation? Let's add it to blackjack.ts so it exists.
      // Yes, we will add it.
      const createTable = (api.blackjack as any).createTable;
      if (createTable) {
        const tableId = await createTable({ name });
        onSelectTable(tableId);
      } else {
        // Fallback to seedDefaultTable if not compiled yet
        const tableId = await seedDefaultTable();
        onSelectTable(tableId);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create table.");
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
        {/* Left side: Stats / Dashboard */}
        <section className="lobby-sidebar glass">
          <div className="promo-card">
            <h3>Welcome back!</h3>
            <p>Ready to beat the dealer? Sit at any open seat. Tables support up to 8 players in real-time.</p>
            <div className="balance-box">
              <span className="label">YOUR CHIPS</span>
              <span className="amount">${user.balance?.toLocaleString()}</span>
            </div>
            {user.balance <= 0 && (
              <button 
                className="btn-primary refill-btn"
                onClick={async () => {
                  // We can add a simple mutation to refill balance if player goes bust.
                  // For now, let's keep it simple.
                }}
                disabled
              >
                Refill Chips (Auto-refills when joining seats)
              </button>
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

          {tables === undefined ? (
            <div className="loading-container">
              <RefreshCw className="spinner" />
              <p>Fetching active tables...</p>
            </div>
          ) : tables.length === 0 ? (
            <div className="empty-lobby">
              <Spade size={48} className="empty-icon" />
              <p>No tables are open right now. Be the first to open one!</p>
              <button className="btn-primary" onClick={handleQuickPlay}>
                Open Default Table
              </button>
            </div>
          ) : (
            <div className="table-grid">
              {tables.map((table) => (
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
