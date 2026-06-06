
export function getCardValueNum(cardValue: string): number {
  if (["J", "Q", "K"].includes(cardValue)) return 10;
  if (cardValue === "A") return 11;
  return parseInt(cardValue, 10);
}

export function getBasicStrategyRecommendation(playerCards: any[], dealerUpcard: any): "H" | "S" | "D" | "P" {
  if (!playerCards || playerCards.length < 2 || !dealerUpcard) return "H";

  const dealerVal = getCardValueNum(dealerUpcard.value);
  const isPair = playerCards.length === 2 && playerCards[0].value === playerCards[1].value;
  
  // Calculate if soft hand
  const hasAce = playerCards.some(c => c.value === "A");
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

export const hardStrategyData = [
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

export const softStrategyData = [
  { label: "A,9", cells: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"] },
  { label: "A,8", cells: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"] },
  { label: "A,7", cells: ["D", "D", "D", "D", "D", "S", "S", "H", "H", "H"] },
  { label: "A,6", cells: ["H", "D", "D", "D", "D", "H", "H", "H", "H", "H"] },
  { label: "A,5", cells: ["H", "H", "D", "D", "D", "H", "H", "H", "H", "H"] },
  { label: "A,4", cells: ["H", "H", "D", "D", "D", "H", "H", "H", "H", "H"] },
  { label: "A,3", cells: ["H", "H", "H", "D", "D", "H", "H", "H", "H", "H"] },
  { label: "A,2", cells: ["H", "H", "H", "D", "D", "H", "H", "H", "H", "H"] },
];

export const pairStrategyData = [
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
