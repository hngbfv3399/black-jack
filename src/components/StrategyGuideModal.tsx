import { useState } from "react";
import { X } from "lucide-react";
import { hardStrategyData, softStrategyData, pairStrategyData } from "../utils/basicStrategy";

interface StrategyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StrategyGuideModal({ isOpen, onClose }: StrategyGuideModalProps) {
  const [activeTab, setActiveTab] = useState<"chart" | "rules">("chart");

  if (!isOpen) return null;

  const renderRows = (data: { label: string; cells: string[] }[], typeClass: string) => {
    return data.map((row, idx) => (
      <tr key={idx}>
        <td className={`hand-label ${typeClass}`}>{row.label}</td>
        {row.cells.map((cell, cIdx) => (
          <td key={cIdx} className={`cell-action color-${cell}`}>
            {cell === "P" ? "SP" : cell}
          </td>
        ))}
      </tr>
    ));
  };

  return (
    <div className="strategy-modal-backdrop" onClick={onClose}>
      <div className="strategy-modal glass animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>블랙잭 기본 전략 가이드</h3>
          <button className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        
        <div className="modal-body">
          <div className="modal-tabs" style={{ display: "flex", gap: "10px", marginBottom: "16px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", paddingBottom: "10px" }}>
            <button 
              className={`tab-btn ${activeTab === "chart" ? "active" : ""}`}
              onClick={() => setActiveTab("chart")}
              style={{
                background: activeTab === "chart" ? "rgba(226, 184, 66, 0.15)" : "transparent",
                border: "1px solid",
                borderColor: activeTab === "chart" ? "var(--gold)" : "rgba(255,255,255,0.15)",
                color: activeTab === "chart" ? "var(--gold)" : "var(--text-secondary)",
                padding: "8px 16px",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "13px"
              }}
            >
              기본 전략 차트
            </button>
            <button 
              className={`tab-btn ${activeTab === "rules" ? "active" : ""}`}
              onClick={() => setActiveTab("rules")}
              style={{
                background: activeTab === "rules" ? "rgba(226, 184, 66, 0.15)" : "transparent",
                border: "1px solid",
                borderColor: activeTab === "rules" ? "var(--gold)" : "rgba(255,255,255,0.15)",
                color: activeTab === "rules" ? "var(--gold)" : "var(--text-secondary)",
                padding: "8px 16px",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "13px"
              }}
            >
              특수 룰 & 사이드 배팅 가이드
            </button>
          </div>

          {activeTab === "chart" ? (
            <>
              <p className="strategy-intro" style={{ marginBottom: "12px" }}>
                이 가이드는 플레이어의 카드 합계(왼쪽 열)와 딜러의 오픈 카드(상단 행)를 바탕으로 수학적으로 가장 유리한 선택을 보여줍니다.
              </p>
              
              <div className="legend" style={{ marginBottom: "16px" }}>
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
                    {renderRows(hardStrategyData, "hard")}
                    
                    <tr className="section-row"><td colSpan={11}>소프트 핸드 (에이스 포함)</td></tr>
                    {renderRows(softStrategyData, "soft")}
                    
                    <tr className="section-row"><td colSpan={11}>페어 핸드 (스플릿 가능)</td></tr>
                    {renderRows(pairStrategyData, "pair")}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rules-guide-wrapper" style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "450px", overflowY: "auto", paddingRight: "8px", fontSize: "14px", lineHeight: "1.6", color: "#cbd5e1" }}>
              
              <div className="rule-card" style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px", padding: "14px" }}>
                <h4 style={{ color: "var(--gold)", margin: "0 0 6px 0", fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}>⚡ 스플릿 (Split)</h4>
                <p style={{ margin: 0, fontSize: "13px" }}>
                  처음 받은 2장의 카드 숫자가 같을 때(예: 8-8, A-A), 메인 베팅금만큼 추가 베팅을 내고 카드를 두 개의 독립된 핸드로 쪼개어 플레이합니다. 각각의 핸드로 독립된 플레이가 가능하므로 기회를 두 배로 늘릴 수 있습니다.
                </p>
              </div>

              <div className="rule-card" style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px", padding: "14px" }}>
                <h4 style={{ color: "var(--gold)", margin: "0 0 6px 0", fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}>⚡ 더블 다운 (Double Down)</h4>
                <p style={{ margin: 0, fontSize: "13px" }}>
                  처음 2장의 카드가 아주 유리하다고 판단될 때 베팅금을 2배로 올립니다. 이 행동을 선택하면 **딱 1장의 추가 카드만** 받고 플레이어의 턴이 자동으로 스탠드(종료)됩니다.
                </p>
              </div>

              <div className="rule-card" style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px", padding: "14px" }}>
                <h4 style={{ color: "var(--gold)", margin: "0 0 6px 0", fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}>⚡ 서렌더 (Surrender)</h4>
                <p style={{ margin: 0, fontSize: "13px" }}>
                  처음 2장 카드를 받은 직후(액션을 취하기 전), 딜러의 오픈 카드 대비 승산이 매우 낮다고 판단될 때 게임을 조기에 기권합니다. 기권 시 **베팅 금액의 절반(50%)을 즉시 돌려받고** 라운드를 포기합니다.
                  <br />
                  <span style={{ color: "#f87171", fontSize: "12px", display: "inline-block", marginTop: "4px" }}>
                    ⚠️ 단, 딜러가 블랙잭(21)일 경우 서렌더가 무효화되며 베팅금을 모두 잃습니다.
                  </span>
                </p>
              </div>

              <div className="rule-card" style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px", padding: "14px" }}>
                <h4 style={{ color: "var(--gold)", margin: "0 0 6px 0", fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}>🎲 페어 사이드 베팅 (Any Pair)</h4>
                <p style={{ margin: 0, fontSize: "13px" }}>
                  플레이어가 처음 받는 2장의 카드가 **동일한 숫자(원 페어)**인지 여부에 거는 사이드 배팅입니다.
                  <br />
                  - **배당**: 숫자만 일치하면 무늬가 달라도 베팅금의 **11배 (11:1)**를 즉시 획득합니다. (예: 5♠와 5♦)
                </p>
              </div>

              <div className="rule-card" style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px", padding: "14px" }}>
                <h4 style={{ color: "var(--gold)", margin: "0 0 6px 0", fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}>🎲 21+3 사이드 베팅 (Poker Combined)</h4>
                <p style={{ margin: 0, fontSize: "13px" }}>
                  플레이어의 처음 2장 카드와 **딜러의 오픈 카드 1장** (총 3장)의 조합을 합쳐 포커 족보를 구성하는 사이드 배팅입니다.
                  <br />
                  - **수티드 트립스 (Suited Trips - 100배)**: 3장 모두 문양과 숫자가 완벽히 같은 경우 (예: 3장 모두 K♠)
                  <br />
                  - **스트레이트 플러시 (Straight Flush - 40배)**: 3장 모두 같은 문양이면서 숫자가 이어지는 경우 (예: 4♦, 5♦, 6♦)
                  <br />
                  - **쓰리 오브 어 카인드 (Three of a Kind - 30배)**: 문양 관계없이 3장의 숫자가 같은 경우 (예: J♥, J♠, J♦)
                  <br />
                  - **스트레이트 (Straight - 10배)**: 문양 관계없이 3장의 숫자가 이어지는 경우 (예: 8♥, 9♠, 10♣)
                  <br />
                  - **플러시 (Flush - 5배)**: 숫자 관계없이 3장의 문양이 모두 같은 경우 (예: 3장 모두 Clubs 무늬)
                </p>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
