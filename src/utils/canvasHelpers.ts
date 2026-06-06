// Vector Suit Drawing Utility
export const drawSuitVector = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  suit: string,
  color: string
) => {
  c.save();
  c.fillStyle = color;
  c.beginPath();
  
  const cx = x + size / 2;
  const cy = y + size / 2;

  if (suit === "D" || suit === "♦" || suit === "Diamonds") {
    c.moveTo(cx, cy - size / 2);
    c.lineTo(cx + size / 2, cy);
    c.lineTo(cx, cy + size / 2);
    c.lineTo(cx - size / 2, cy);
    c.closePath();
    c.fill();
  } else if (suit === "H" || suit === "♥" || suit === "Hearts") {
    c.moveTo(cx, cy - size / 5);
    c.bezierCurveTo(cx - size / 3, cy - size / 2 - size / 10, cx - size / 2, cy - size / 10, cx, cy + size / 2.2);
    c.bezierCurveTo(cx + size / 2, cy - size / 10, cx + size / 3, cy - size / 2 - size / 10, cx, cy - size / 5);
    c.closePath();
    c.fill();
  } else if (suit === "S" || suit === "♠" || suit === "Spades") {
    // Stem
    c.moveTo(cx, cy);
    c.quadraticCurveTo(cx - size / 6, cy + size / 2, cx - size / 4, cy + size / 2);
    c.lineTo(cx + size / 4, cy + size / 2);
    c.quadraticCurveTo(cx + size / 6, cy, cx, cy);
    c.closePath();
    c.fill();
    // Main body (upside down heart)
    c.beginPath();
    c.moveTo(cx, cy - size / 2.2);
    c.bezierCurveTo(cx - size / 2, cy - size / 2.2, cx - size / 2.2, cy, cx, cy + size / 6);
    c.bezierCurveTo(cx + size / 2.2, cy, cx + size / 2, cy - size / 2.2, cx, cy - size / 2.2);
    c.closePath();
    c.fill();
  } else if (suit === "C" || suit === "♣" || suit === "Clubs") {
    // Stem
    c.moveTo(cx, cy);
    c.quadraticCurveTo(cx - size / 6, cy + size / 2, cx - size / 4, cy + size / 2);
    c.lineTo(cx + size / 4, cy + size / 2);
    c.quadraticCurveTo(cx + size / 6, cy, cx, cy);
    c.closePath();
    c.fill();
    // Circles
    const r = size / 4;
    c.beginPath();
    c.arc(cx, cy - size / 6, r, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(cx - size / 5, cy + size / 10, r, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(cx + size / 5, cy + size / 10, r, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
};

// Card shape drawing helper
export const drawCardShape = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  isRed: boolean,
  valueStr: string,
  suitStr: string,
  isFaceDown: boolean
) => {
  c.save();
  // Card Shadow
  c.shadowColor = "rgba(0, 0, 0, 0.45)";
  c.shadowBlur = 8;
  c.shadowOffsetX = 1.5;
  c.shadowOffsetY = 3.5;

  c.beginPath();
  c.moveTo(x + radius, y);
  c.lineTo(x + w - radius, y);
  c.quadraticCurveTo(x + w, y, x + w, y + radius);
  c.lineTo(x + w, y + h - radius);
  c.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  c.lineTo(x + radius, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - radius);
  c.lineTo(x, y + radius);
  c.quadraticCurveTo(x, y, x + radius, y);
  c.closePath();

  if (isFaceDown) {
    // Draw card back radial gradient
    const grad = c.createRadialGradient(x + w/2, y + h/2, 5, x + w/2, y + h/2, w);
    grad.addColorStop(0, "#1e3c72");
    grad.addColorStop(1, "#0a1931");
    c.fillStyle = grad;
    c.fill();
    
    c.shadowBlur = 0; // border
    c.strokeStyle = "#e2b842";
    c.lineWidth = 2;
    c.stroke();

    // Elegant filigree pattern on card back
    c.strokeStyle = "rgba(226, 184, 66, 0.25)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.roundRect(x + 5, y + 5, w - 10, h - 10, radius - 1);
    c.stroke();
    
    c.beginPath();
    c.arc(x + w/2, y + h/2, 16, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(x + w/2, y + h/2, 8, 0, Math.PI * 2);
    c.stroke();

    c.beginPath();
    c.moveTo(x + 5, y + 5); c.lineTo(x + w - 5, y + h - 5);
    c.moveTo(x + w - 5, y + 5); c.lineTo(x + 5, y + h - 5);
    c.stroke();

    drawSuitVector(c, x + w/2 - 6, y + h/2 - 6, 12, "S", "#e2b842");
  } else {
    // Draw card front paper gradient
    const cardGrad = c.createLinearGradient(x, y, x + w, y + h);
    cardGrad.addColorStop(0, "#ffffff");
    cardGrad.addColorStop(0.85, "#fefefa");
    cardGrad.addColorStop(1, "#f4f4ec");
    c.fillStyle = cardGrad;
    c.fill();
    
    c.shadowBlur = 0; // border
    c.strokeStyle = "rgba(15, 23, 42, 0.08)";
    c.lineWidth = 1.2;
    c.stroke();

    const suitColor = isRed ? "#dc2626" : "#0f172a";

    // Value text
    c.fillStyle = suitColor;
    c.font = "bold 15px 'Outfit', sans-serif";
    c.textAlign = "left";
    c.textBaseline = "top";
    c.fillText(valueStr, x + 6, y + 6);
    
    // Small top suit
    drawSuitVector(c, x + 5, y + 23, 11, suitStr, suitColor);

    // Large center suit
    drawSuitVector(c, x + w / 2 - 16, y + h / 2 - 14, 32, suitStr, suitColor);
  }
  c.restore();
};

// Draw single premium 3D casino chip
export const drawSingleChip = (
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  amount: number
) => {
  let primaryColor = "#dc2626"; // Red for default
  let accentColor = "#ffffff";
  if (amount >= 1000) { primaryColor = "#0f172a"; accentColor = "#e2b842"; } // Black/Gold
  else if (amount >= 500) { primaryColor = "#7c3aed"; accentColor = "#ffffff"; } // Purple
  else if (amount >= 100) { primaryColor = "#2563eb"; accentColor = "#ffffff"; } // Blue
  else if (amount >= 25) { primaryColor = "#16a34a"; accentColor = "#ffffff"; } // Green

  c.save();
  // Outer shadow
  c.shadowColor = "rgba(0, 0, 0, 0.4)";
  c.shadowBlur = 3;
  c.shadowOffsetY = 1.5;

  // Base circle
  c.fillStyle = primaryColor;
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();

  // Outer stripes (perimeter ridges)
  c.save();
  c.strokeStyle = accentColor;
  c.lineWidth = 3.5;
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.clip();

  c.beginPath();
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(angle) * (rx + 5), cy + Math.sin(angle) * (ry + 5));
  }
  c.stroke();
  c.restore();

  // Inner color cover
  c.fillStyle = primaryColor;
  c.beginPath();
  c.ellipse(cx, cy, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
  c.fill();

  // Inner white core inlay
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.ellipse(cx, cy, rx * 0.52, ry * 0.52, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "rgba(15, 23, 42, 0.12)";
  c.lineWidth = 0.8;
  c.stroke();

  // Gloss reflection overlay
  const gloss = c.createLinearGradient(cx, cy - ry, cx, cy + ry);
  gloss.addColorStop(0, "rgba(255, 255, 255, 0.28)");
  gloss.addColorStop(0.4, "rgba(255, 255, 255, 0)");
  gloss.addColorStop(1, "rgba(0, 0, 0, 0.15)");
  c.fillStyle = gloss;
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
};

// Draw stacks of betting chips
export const drawChipsStack = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  amount: number
) => {
  c.save();
  
  const chipsCount = Math.min(6, 1 + Math.floor(amount / 50));
  const chipHeight = 4.2;
  const rx = 18;
  const ry = 9;
  
  for (let i = 0; i < chipsCount; i++) {
    const cy = y - i * chipHeight;
    drawSingleChip(c, x, cy, rx, ry, amount);
    
    if (i === chipsCount - 1) {
      c.fillStyle = "#1e293b";
      c.font = "bold 9px 'Outfit', sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(`${amount >= 1000 ? (amount/1000).toFixed(0)+'K' : amount}`, x, cy + 0.5);
    }
  }

  // Bet value display badge
  c.fillStyle = "rgba(15, 23, 42, 0.9)";
  c.strokeStyle = "rgba(226, 184, 66, 0.45)";
  c.lineWidth = 1.2;
  c.beginPath();
  c.roundRect(x - 26, y + 15, 52, 14, 5);
  c.fill();
  c.stroke();
  
  c.fillStyle = "#ffffff";
  c.font = "bold 9px sans-serif";
  c.textAlign = "center";
  c.fillText(`$${amount}`, x, y + 25);

  c.restore();
};
