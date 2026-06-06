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
      setError(err.message || "칩 충전에 실패했습니다.");
    } finally {
      setIsRefilling(false);
    }
  };

  const handleQuickPlay = async () => {
    try {
      const tableId = await seedDefaultTable();
      onSelectTable(tableId);
    } catch {
      setError("빠른 참가 테이블을 시작하지 못했습니다.");
    }
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const name = tableName.trim();
    if (name.length < 2) {
      setError("테이블 이름은 최소 2글자 이상이어야 합니다.");
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
      setError(errMsg || "테이블 생성에 실패했습니다.");
    } finally {
      setIsCreating(false);
      setTableName("");
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "waiting": return "대기중";
      case "betting": return "배팅중";
      case "playing": return "게임중";
      case "dealer_turn": return "딜러 차례";
      case "round_over": return "종료";
      default: return status.toUpperCase();
    }
  };

  return (
    <div className="lobby-container">
      {/* Header bar */}
      <header className="lobby-header glass">
        <div className="logo animate-glow">
          <Spade className="logo-icon" />
          <span>안티그래비티 블랙잭</span>
        </div>
        <div className="user-profile">
          <div className="profile-info">
            <span className="profile-name">{user.nickname}</span>
            <span className="profile-balance">${user.balance?.toLocaleString()}</span>
          </div>
          <button className="btn-logout" onClick={onSignOut} title="로그아웃">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main content grid */}
      <main className="lobby-content">
        {/* Left side: Stats / Leaderboard */}
        <section className="lobby-sidebar glass">
          <div className="promo-card">
            <h3>다시 오신 것을 환영합니다!</h3>
            <p>딜러를 이길 준비가 되셨나요? 빈 자리에 앉아주세요. 테이블은 실시간으로 최대 8명의 플레이어를 지원합니다.</p>
            <div className="balance-box">
              <span className="label">보유 칩</span>
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
                {isRefilling ? "충전 중..." : "무료 칩 충전 ($3,000)"}
              </button>
            )}
          </div>


          {/* Real-time Leaderboard Ranking */}
          <div className="leaderboard-card glass">
            <div className="leaderboard-header">
              <Trophy size={18} className="trophy-icon" />
              <h4>글로벌 랭킹</h4>
            </div>
            
            {leaderboard === undefined ? (
              <div className="leaderboard-loading">
                <RefreshCw className="spinner animate-spin" size={16} />
                <span>랭킹 불러오는 중...</span>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="leaderboard-empty">아직 랭킹에 등록된 플레이어가 없습니다.</div>
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
            <h4>테이블 규칙</h4>
            <ul>
              <li>3덱 슈 사용 (카드가 약 20장 남으면 셔플)</li>
              <li>딜러는 17 이상에서 스탠드</li>
              <li>블랙잭 달성 시 1.5배 지급 (3:2)</li>
              <li>첫 2장 카드로 더블 다운 가능</li>
              <li>턴 제한 시간 15초</li>
            </ul>
          </div>
        </section>

        {/* Right side: Table list */}
        <section className="lobby-main glass">
          <div className="section-title-bar">
            <h2>진행 중인 테이블</h2>
            <button className="btn-secondary quick-play-btn" onClick={handleQuickPlay}>
              빠른 참가
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}

          {dbTables === undefined ? (
            <div className="loading-container">
              <RefreshCw className="spinner" />
              <p>테이블 목록을 불러오는 중...</p>
            </div>
          ) : dbTables.length === 0 ? (
            <div className="empty-lobby">
              <Spade size={48} className="empty-icon" />
              <p>현재 열려있는 테이블이 없습니다. 첫 번째 테이블을 개설해 보세요!</p>
              <button className="btn-primary" onClick={handleQuickPlay}>
                기본 테이블 만들기
              </button>
            </div>
          ) : (
            <div className="table-grid">
              {dbTables.map((table) => (
                <div key={table._id} className="table-card glass-hover">
                  <div className="table-card-header">
                    <h3>{table.name}</h3>
                    <span className={`status-badge ${table.status}`}>
                      {getStatusText(table.status)}
                    </span>
                  </div>
                  <div className="table-card-body">
                    <div className="stat">
                      <span className="label">참여 인원</span>
                      <span className="value">{table.playerCount} / 8</span>
                    </div>
                  </div>
                  <div className="table-card-footer">
                    <button 
                      className="btn-primary table-join-btn"
                      onClick={() => onSelectTable(table._id)}
                      disabled={table.playerCount >= 8}
                    >
                      {table.playerCount >= 8 ? "가득 참" : "참가하기"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create Table Form */}
          <div className="create-table-section glass">
            <h3>새 테이블 만들기</h3>
            <form onSubmit={handleCreateTable} className="create-table-form">
              <input
                type="text"
                placeholder="테이블 이름을 입력하세요 (예: VIP 테이블)..."
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                disabled={isCreating}
                maxLength={25}
                required
              />
              <button type="submit" className="btn-primary" disabled={isCreating || !tableName.trim()}>
                <Plus size={18} />
                만들기 & 참가
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
