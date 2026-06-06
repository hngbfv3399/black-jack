import { X } from "lucide-react";
import { hardStrategyData, softStrategyData, pairStrategyData } from "../utils/basicStrategy";

interface StrategyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StrategyGuideModal({ isOpen, onClose }: StrategyGuideModalProps) {
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
                {renderRows(hardStrategyData, "hard")}
                
                <tr className="section-row"><td colSpan={11}>소프트 핸드 (에이스 포함)</td></tr>
                {renderRows(softStrategyData, "soft")}
                
                <tr className="section-row"><td colSpan={11}>페어 핸드 (스플릿 가능)</td></tr>
                {renderRows(pairStrategyData, "pair")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
