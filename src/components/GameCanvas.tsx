import React, { useRef, useEffect, useState } from "react";

// Local helper to calculate hands score values
const getHandValue = (cards: any[]): number => {
  let value = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.hidden) continue;
    if (card.value === "A") {
      value += 11;
      aces += 1;
    } else if (["J", "Q", "K"].includes(card.value)) {
      value += 10;
    } else {
      value += parseInt(card.value, 10);
    }
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces -= 1;
  }
  return value;
};

interface GameCanvasProps {
  table: any;
  currentUserId: string | null;
  onJoinSeat: (seatIndex: number) => void;
}

// Animation item type
interface AnimatedCard {
  id: string;
  suit: string;
  value: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number; // 0 to 1
  speed: number;
  delay: number; // ms to wait before starting
  hidden?: boolean;
}

export default function GameCanvas({ table, currentUserId, onJoinSeat }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Animation state stored in refs for the render loop
  const animatedCardsRef = useRef<AnimatedCard[]>([]);
  const lastCardsStateRef = useRef<{
    seats: { [seatIdx: number]: number }; // seatIndex -> card count
    dealer: number; // dealer card count
  }>({ seats: {}, dealer: 0 });

  const [hoveredSeat, setHoveredSeat] = useState<number | null>(null);

  // Constants for dimensions on a logical 1200x800 canvas
  const WIDTH = 1200;
  const HEIGHT = 800;
  const SHOE_X = WIDTH - 120;
  const SHOE_Y = 120;
  const DEALER_X = WIDTH / 2;
  const DEALER_Y = 150;
  const CARD_WIDTH = 65;
  const CARD_HEIGHT = 95;

  // Calculate coordinates for the 8 seats in a semi-circle
  const getSeatCoords = (index: number) => {
    // 8 seats arranged from PI * 0.15 to PI * 0.85
    const startAngle = Math.PI * 0.85;
    const endAngle = Math.PI * 0.15;
    const angleRange = startAngle - endAngle;
    const angle = startAngle - (index / 7) * angleRange;
    
    const radiusX = 400;
    const radiusY = 220;
    const centerX = WIDTH / 2;
    const centerY = HEIGHT * 0.38;

    return {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY + 80,
      angle: angle,
    };
  };

  // Stagger animation trigger when database state updates
  useEffect(() => {
    if (!table) return;

    const newAnimatedCards: AnimatedCard[] = [];
    let delayAccumulator = 0;
    const animationSpeed = 0.06; // Increment per frame

    // 1. Check Player seats for new cards
    table.seats.forEach((seat: any, seatIdx: number) => {
      if (seat.userId === null) {
        lastCardsStateRef.current.seats[seatIdx] = 0;
        return;
      }
      
      const prevCount = lastCardsStateRef.current.seats[seatIdx] || 0;
      const currentCards = seat.cards || [];

      if (currentCards.length > prevCount) {
        // Add new cards to animation queue
        for (let i = prevCount; i < currentCards.length; i++) {
          const card = currentCards[i];
          const seatCoords = getSeatCoords(seatIdx);
          
          // Position offset for multiple cards in a hand
          const targetX = seatCoords.x - 20 + i * 16;
          const targetY = seatCoords.y - 40;

          newAnimatedCards.push({
            id: `seat-${seatIdx}-${i}-${Date.now()}`,
            suit: card.suit,
            value: card.value,
            fromX: SHOE_X,
            fromY: SHOE_Y,
            toX: targetX,
            toY: targetY,
            progress: 0,
            speed: animationSpeed,
            delay: delayAccumulator,
            hidden: card.hidden,
          });
          
          delayAccumulator += 180; // stagger next card by 180ms
        }
      }
      lastCardsStateRef.current.seats[seatIdx] = currentCards.length;
    });

    // 2. Check Dealer hand for new cards
    const prevDealerCount = lastCardsStateRef.current.dealer || 0;
    const dealerCards = table.dealer?.cards || [];

    if (dealerCards.length > prevDealerCount) {
      for (let i = prevDealerCount; i < dealerCards.length; i++) {
        const card = dealerCards[i];
        const targetX = DEALER_X - 35 + i * 20;
        const targetY = DEALER_Y;

        newAnimatedCards.push({
          id: `dealer-${i}-${Date.now()}`,
          suit: card.suit,
          value: card.value,
          fromX: SHOE_X,
          fromY: SHOE_Y,
          toX: targetX,
          toY: targetY,
          progress: 0,
          speed: animationSpeed,
          delay: delayAccumulator,
          hidden: card.hidden,
        });

        delayAccumulator += 180;
      }
      lastCardsStateRef.current.dealer = dealerCards.length;
    }

    // Add these animation tasks to the list
    if (newAnimatedCards.length > 0) {
      animatedCardsRef.current = [...animatedCardsRef.current, ...newAnimatedCards];
    }

  }, [table]);

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    // Responsive sizing handler
    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      
      // Ensure canvas doesn't shrink too small on mobile screen widths (minimum logical width 900px)
      const baseWidth = window.innerWidth <= 768 ? Math.max(rect.width, 900) : rect.width;
      
      canvas.width = baseWidth * dpr;
      canvas.height = (baseWidth * (HEIGHT / WIDTH)) * dpr;
      canvas.style.width = `${baseWidth}px`;
      canvas.style.height = `${baseWidth * (HEIGHT / WIDTH)}px`;

      ctx.scale(dpr * (baseWidth / WIDTH), dpr * (baseWidth / WIDTH));
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Main Draw Tick
    const render = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      // 1. Draw Table felt
      drawTableFelt(ctx);

      if (!table) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // 2. Draw static table elements
      drawDealerShoe(ctx);
      drawDealerZone(ctx);

      // 3. Draw player seats
      table.seats.forEach((seat: any, index: number) => {
        const coords = getSeatCoords(index);
        const isHovered = hoveredSeat === index;
        const isActive = table.activeSeatIndex === index;
        const isPlayerSeat = seat.userId === currentUserId && currentUserId !== null;

        drawSeat(ctx, seat, coords, isActive, isHovered, isPlayerSeat);
      });

      // 4. Draw static card hands (already dealt)
      drawDealerCards(ctx);
      drawPlayerCards(ctx);

      // 5. Draw active animating cards
      drawAnimatingCards(ctx, dt);

      // 6. Draw game status overlay logs
      drawHistoryOverlay(ctx);

      animationFrameId = requestAnimationFrame(render);
    };

    // Card drawing utility
    const drawCardShape = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, isRed: boolean, valueStr: string, suitStr: string, isFaceDown: boolean) => {
      c.save();
      // Card Shadow
      c.shadowColor = "rgba(0, 0, 0, 0.4)";
      c.shadowBlur = 8;
      c.shadowOffsetX = 2;
      c.shadowOffsetY = 4;

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
        // Draw card back
        const grad = c.createRadialGradient(x + w/2, y + h/2, 5, x + w/2, y + h/2, w);
        grad.addColorStop(0, "#1e3c72");
        grad.addColorStop(1, "#0a1931");
        c.fillStyle = grad;
        c.fill();
        
        c.shadowBlur = 0; // Turn off shadow for grid
        c.strokeStyle = "#e2b842";
        c.lineWidth = 2.5;
        c.stroke();

        // Elegant geometric pattern inside
        c.strokeStyle = "rgba(226, 184, 66, 0.2)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x + 10, y + 10);
        c.lineTo(x + w - 10, y + h - 10);
        c.moveTo(x + w - 10, y + 10);
        c.lineTo(x + 10, y + h - 10);
        c.stroke();
        
        // Center spade icon
        c.fillStyle = "#e2b842";
        c.font = "bold 20px sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("♠", x + w/2, y + h/2);
      } else {
        // Draw card front
        c.fillStyle = "#ffffff";
        c.fill();
        c.shadowBlur = 0; // border
        c.strokeStyle = "#e2e8f0";
        c.lineWidth = 1;
        c.stroke();

        // Content
        c.fillStyle = isRed ? "#e53e3e" : "#1a202c";
        c.font = "bold 16px sans-serif";
        c.textAlign = "left";
        c.textBaseline = "top";
        c.fillText(valueStr, x + 6, y + 6);
        
        // Suit icon
        let suitGlyph = "♠";
        if (suitStr === "H") suitGlyph = "♥";
        if (suitStr === "D") suitGlyph = "♦";
        if (suitStr === "C") suitGlyph = "♣";
        
        c.font = "20px sans-serif";
        c.fillText(suitGlyph, x + 6, y + 24);

        // Center large suit glyph
        c.font = "32px sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(suitGlyph, x + w / 2, y + h / 2 + 5);
      }
      c.restore();
    };

    const drawTableFelt = (c: CanvasRenderingContext2D) => {
      // 1. Radial green felt gradient
      const grad = c.createRadialGradient(WIDTH / 2, HEIGHT / 3, 100, WIDTH / 2, HEIGHT / 2, 700);
      grad.addColorStop(0, "#134e4a"); // Light deep green
      grad.addColorStop(0.6, "#0f172a"); // Dark slate slate blue
      grad.addColorStop(1, "#020617"); // Midnight black outer
      c.fillStyle = grad;
      c.fillRect(0, 0, WIDTH, HEIGHT);

      // 2. Curved gold boundary line
      c.strokeStyle = "rgba(226, 184, 66, 0.4)";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(WIDTH / 2, HEIGHT * 0.38, 480, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();

      // 3. Curved white text guidelines
      c.fillStyle = "rgba(255, 255, 255, 0.15)";
      c.font = "bold 20px 'Outfit', sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      
      c.save();
      // Draw Payout rules arc
      c.fillText("BLACKJACK PAYS 3 TO 2", WIDTH / 2, HEIGHT * 0.32);
      c.font = "14px sans-serif";
      c.fillText("Dealer must stand on 17 and draw to 16", WIDTH / 2, HEIGHT * 0.36);
      c.restore();
    };

    const drawDealerShoe = (c: CanvasRenderingContext2D) => {
      c.save();
      // Draw card box (Shoe)
      c.fillStyle = "#1e293b";
      c.strokeStyle = "#e2b842";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(SHOE_X, SHOE_Y);
      c.lineTo(SHOE_X + 80, SHOE_Y - 30);
      c.lineTo(SHOE_X + 110, SHOE_Y + 20);
      c.lineTo(SHOE_X + 30, SHOE_Y + 50);
      c.closePath();
      c.fill();
      c.stroke();

      // Card decks indicator
      c.fillStyle = "#e2b842";
      c.font = "bold 12px sans-serif";
      c.fillText("SHOE (6D)", SHOE_X + 25, SHOE_Y + 15);
      c.restore();
    };

    const drawDealerZone = (c: CanvasRenderingContext2D) => {
      // Draw Dealer Banner label
      c.fillStyle = "rgba(15, 23, 42, 0.6)";
      c.strokeStyle = "rgba(226, 184, 66, 0.5)";
      c.lineWidth = 2;
      
      const badgeW = 160;
      const badgeH = 34;
      const badgeX = DEALER_X - badgeW / 2;
      const badgeY = DEALER_Y - 70;
      
      // Curved banner
      c.beginPath();
      c.roundRect(badgeX, badgeY, badgeW, badgeH, 17);
      c.fill();
      c.stroke();

      c.fillStyle = "#e2b842";
      c.font = "bold 15px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      
      // Calculate score
      const cards = table.dealer?.cards || [];
      const showScore = table.status !== "waiting" && cards.length > 0;
      const score = getHandValue(cards);
      
      c.fillText(
        showScore ? `DEALER (${score})` : "DEALER",
        DEALER_X,
        badgeY + badgeH / 2
      );
    };

    const drawSeat = (
      c: CanvasRenderingContext2D,
      seat: any,
      coords: { x: number; y: number },
      isActive: boolean,
      isHovered: boolean,
      isPlayerSeat: boolean
    ) => {
      c.save();

      // Pulsing outer ring if it's this seat's turn
      if (isActive) {
        const pulse = 10 + Math.sin(Date.now() * 0.007) * 4;
        c.shadowColor = "#f59e0b";
        c.shadowBlur = pulse;
        c.strokeStyle = "#f59e0b";
        c.lineWidth = 3;
      } else if (isPlayerSeat) {
        c.strokeStyle = "rgba(59, 130, 246, 0.6)"; // Blue outline for user seat
        c.lineWidth = 2.5;
      } else {
        c.strokeStyle = isHovered ? "rgba(255, 255, 255, 0.8)" : "rgba(226, 184, 66, 0.3)";
        c.lineWidth = 2;
      }

      // 1. Draw Betting Circle / Seat Slot
      c.beginPath();
      c.arc(coords.x, coords.y, 45, 0, Math.PI * 2);
      
      // Seat background colors
      if (seat.userId !== null) {
        c.fillStyle = isActive ? "rgba(245, 158, 11, 0.15)" : "rgba(15, 23, 42, 0.75)";
      } else {
        c.fillStyle = isHovered ? "rgba(255, 255, 255, 0.1)" : "rgba(15, 23, 42, 0.35)";
      }
      c.fill();
      c.stroke();
      
      // Clear shadow
      c.shadowBlur = 0;

      // 2. Draw Seat Content
      if (seat.userId !== null) {
        // Seated Player Details
        c.textAlign = "center";
        
        // Nickname
        c.fillStyle = isPlayerSeat ? "#3b82f6" : "#ffffff";
        c.font = "bold 15px sans-serif";
        c.fillText(seat.nickname, coords.x, coords.y - 12);

        // Chips Balance
        c.fillStyle = "#e2b842";
        c.font = "13px sans-serif";
        c.fillText(`$${seat.balance.toLocaleString()}`, coords.x, coords.y + 4);

        // Active Bet Chips stack (if placed)
        if (seat.bet > 0) {
          drawChipsStack(c, coords.x, coords.y - 70, seat.bet);
        }

        // Status Badge / Hand value
        const val = getHandValue(seat.cards);
        if (seat.cards.length > 0 && seat.status !== "idle") {
          let scoreText = `${val}`;
          if (seat.status === "blackjack") scoreText = "BJ 21";
          if (seat.status === "busted") scoreText = "BUST";

          c.save();
          c.fillStyle = seat.status === "won" ? "#10b981" : 
                        (seat.status === "lost" || seat.status === "busted" ? "#ef4444" : 
                        (seat.status === "push" ? "#94a3b8" : "rgba(15, 23, 42, 0.9)"));
          c.beginPath();
          c.roundRect(coords.x - 30, coords.y + 16, 60, 16, 8);
          c.fill();

          c.fillStyle = "#ffffff";
          c.font = "bold 12px sans-serif";
          c.fillText(scoreText, coords.x, coords.y + 27);
          c.restore();
        }

        // Display Last Action tag (e.g. hit, stand)
        if (seat.lastAction) {
          c.fillStyle = "rgba(255, 255, 255, 0.6)";
          c.font = "italic 10px sans-serif";
          c.fillText(seat.lastAction.toUpperCase(), coords.x, coords.y - 28);
        }

      } else {
        // Empty Seat prompt
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = isHovered ? "#ffffff" : "rgba(226, 184, 66, 0.5)";
        c.font = "12px sans-serif";
        c.fillText("EMPTY", coords.x, coords.y - 5);
        c.font = "10px sans-serif";
        c.fillText("SIT DOWN", coords.x, coords.y + 10);
      }

      c.restore();
    };

    // Draw stacks of betting chips
    const drawChipsStack = (c: CanvasRenderingContext2D, x: number, y: number, amount: number) => {
      c.save();
      
      // Stack sizes based on amount
      const chipsCount = Math.min(6, 1 + Math.floor(amount / 50));
      const chipHeight = 4;
      
      // Determine chip primary color
      let chipColor = "#ef4444"; // Red for $5 - $99
      if (amount >= 500) chipColor = "#1e293b"; // Black for $500+
      else if (amount >= 100) chipColor = "#3b82f6"; // Blue for $100+
      else if (amount >= 25) chipColor = "#10b981"; // Green for $25+
      
      for (let i = 0; i < chipsCount; i++) {
        const cy = y - i * (chipHeight + 1);
        
        // Chip oval
        c.fillStyle = chipColor;
        c.strokeStyle = "#ffffff";
        c.lineWidth = 1;
        c.beginPath();
        c.ellipse(x, cy, 20, 10, 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();

        // Inner ring stripes
        c.strokeStyle = "rgba(255,255,255,0.4)";
        c.setLineDash([2, 2]);
        c.beginPath();
        c.ellipse(x, cy, 14, 7, 0, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }

      // Bet Value Box
      c.fillStyle = "rgba(15, 23, 42, 0.9)";
      c.beginPath();
      c.roundRect(x - 30, y + 16, 60, 15, 6);
      c.fill();
      
      c.fillStyle = "#ffffff";
      c.font = "bold 11px sans-serif";
      c.textAlign = "center";
      c.fillText(`$${amount}`, x, y + 26);

      c.restore();
    };

    const drawDealerCards = (c: CanvasRenderingContext2D) => {
      const cards = table.dealer?.cards || [];
      
      // We only draw cards that are NOT in the active animation list
      cards.forEach((card: any, idx: number) => {
        const isAnimating = animatedCardsRef.current.some(ac => ac.id.startsWith(`dealer-${idx}-`));
        if (isAnimating) return; // let animation draw it

        const x = DEALER_X - 35 + idx * 20;
        const y = DEALER_Y;
        const isRed = ["H", "D"].includes(card.suit);

        drawCardShape(c, x, y, CARD_WIDTH, CARD_HEIGHT, 5, isRed, card.value, card.suit, !!card.hidden);
      });
    };

    const drawPlayerCards = (c: CanvasRenderingContext2D) => {
      table.seats.forEach((seat: any, seatIdx: number) => {
        if (seat.userId === null || seat.status === "idle") return;

        const seatCoords = getSeatCoords(seatIdx);
        const cards = seat.cards || [];

        cards.forEach((card: any, cardIdx: number) => {
          const isAnimating = animatedCardsRef.current.some(ac => ac.id.startsWith(`seat-${seatIdx}-${cardIdx}-`));
          if (isAnimating) return; // let animation draw it

          const x = seatCoords.x - 20 + cardIdx * 16;
          const y = seatCoords.y - 40;
          const isRed = ["H", "D"].includes(card.suit);

          drawCardShape(c, x, y, CARD_WIDTH, CARD_HEIGHT, 5, isRed, card.value, card.suit, !!card.hidden);
        });

        // Render current score value above the cards stack
        if (cards.length > 0) {
          const val = getHandValue(cards);
          
          c.save();
          c.fillStyle = "rgba(15, 23, 42, 0.85)";
          c.strokeStyle = "#e2b842";
          c.lineWidth = 1.5;
          
          const badgeX = seatCoords.x;
          const badgeY = seatCoords.y - 66;
          
          c.beginPath();
          c.arc(badgeX, badgeY, 18, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          
          c.fillStyle = "#ffffff";
          c.font = "bold 14px sans-serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText(`${val}`, badgeX, badgeY);
          c.restore();
        }
      });
    };

    const drawAnimatingCards = (c: CanvasRenderingContext2D, dt: number) => {
      const currentList = [...animatedCardsRef.current];
      const remaining: AnimatedCard[] = [];

      currentList.forEach((ac) => {
        if (ac.delay > 0) {
          ac.delay -= dt;
          remaining.push(ac);
          return;
        }

        // Interpolation
        ac.progress += ac.speed;
        if (ac.progress >= 1) {
          // Finished animating! Will render as static cards next frames
          return;
        }

        // Draw card at current interpolated position
        const cx = ac.fromX + (ac.toX - ac.fromX) * ac.progress;
        const cy = ac.fromY + (ac.toY - ac.fromY) * ac.progress;
        const isRed = ["H", "D"].includes(ac.suit);

        drawCardShape(c, cx, cy, CARD_WIDTH, CARD_HEIGHT, 5, isRed, ac.value, ac.suit, !!ac.hidden);
        remaining.push(ac);
      });

      animatedCardsRef.current = remaining;
    };

    const drawHistoryOverlay = (c: CanvasRenderingContext2D) => {
      const logs = table.history || [];
      if (logs.length === 0) return;

      c.save();
      // Draw a neat bottom-left corner HUD log box
      c.fillStyle = "rgba(15, 23, 42, 0.65)";
      c.strokeStyle = "rgba(226, 184, 66, 0.25)";
      c.lineWidth = 1;

      const logW = 340;
      const logH = 120;
      const logX = 20;
      const logY = HEIGHT - logH - 20;

      c.beginPath();
      c.roundRect(logX, logY, logW, logH, 8);
      c.fill();
      c.stroke();

      // Heading
      c.fillStyle = "#e2b842";
      c.font = "bold 10px sans-serif";
      c.fillText("TABLE LOGS", logX + 12, logY + 18);

      // Lines
      c.fillStyle = "#cbd5e1";
      c.font = "10px sans-serif";
      c.textAlign = "left";
      
      const visibleLogs = logs.slice(-5); // show last 5 lines
      visibleLogs.forEach((log: string, index: number) => {
        c.fillText(log, logX + 12, logY + 36 + index * 16);
      });

      // Turn countdown timer progress bar (if timer set)
      if (table.timer) {
        const timeRemaining = table.timer - Date.now();
        // Betting: 15s, Playing turns: 15s, Review/Round over: 3s
        let duration = 15000;
        if (table.status === "round_over") duration = 3000;

        const ratio = Math.max(0, Math.min(1, timeRemaining / duration));

        if (ratio > 0) {
          // Label
          c.fillStyle = "#e2b842";
          c.font = "bold 11px sans-serif";
          c.fillText(
            table.status === "betting" ? "BETTING TIME" : (table.status === "round_over" ? "NEXT ROUND IN" : "TURN TIME"),
            WIDTH - 150,
            HEIGHT - 45
          );

          // Bar outer
          c.strokeStyle = "rgba(255,255,255,0.2)";
          c.lineWidth = 1;
          c.beginPath();
          c.roundRect(WIDTH - 150, HEIGHT - 35, 130, 8, 4);
          c.stroke();

          // Bar inner (progress color transitions from green to red)
          const barColor = ratio > 0.4 ? "#10b981" : (ratio > 0.2 ? "#f59e0b" : "#ef4444");
          c.fillStyle = barColor;
          c.beginPath();
          c.roundRect(WIDTH - 150, HEIGHT - 35, 130 * ratio, 8, 4);
          c.fill();
        }
      }

      c.restore();
    };

    // Run frame loop
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [table, hoveredSeat, currentUserId]);

  // Click Handler for Seating
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !table) return;

    // Get scaled coordinates
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Check if player clicked any seat circle
    for (let i = 0; i < 8; i++) {
      const coords = getSeatCoords(i);
      // Distance calculation
      const dx = clickX - coords.x;
      const dy = clickY - coords.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= 45) { // seat radius is 45
        // Clicked!
        if (table.seats[i].userId === null) {
          onJoinSeat(i);
        }
        break;
      }
    }
  };

  // Hover Handler for Seating
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !table) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    let foundSeat: number | null = null;
    for (let i = 0; i < 8; i++) {
      const coords = getSeatCoords(i);
      const dx = mouseX - coords.x;
      const dy = mouseY - coords.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= 45) {
        foundSeat = i;
        break;
      }
    }

    setHoveredSeat(foundSeat);
  };

  return (
    <div className="canvas-wrapper" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={() => setHoveredSeat(null)}
        style={{
          cursor: hoveredSeat !== null && table?.seats[hoveredSeat]?.userId === null ? "pointer" : "default",
          display: "block",
        }}
      />
    </div>
  );
}
