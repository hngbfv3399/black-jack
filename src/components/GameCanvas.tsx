import { useRef, useEffect, useState, memo } from "react";
import { drawCardShape, drawChipsStack } from "../utils/canvasHelpers";

// Canvas roundRect polyfill for older browsers/headless environments
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    this: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radii: any
  ) {
    if (!radii) radii = 0;
    if (typeof radii === "number") radii = [radii, radii, radii, radii];
    const r = {
      tl: radii[0] || 0,
      tr: radii[1] || 0,
      br: radii[2] || 0,
      bl: radii[3] || 0,
    };
    this.moveTo(x + r.tl, y);
    this.lineTo(x + w - r.tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    this.lineTo(x + w, y + h - r.br);
    this.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
    this.lineTo(x + r.bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r.bl);
    this.lineTo(x, y + r.tl);
    this.quadraticCurveTo(x, y, x + r.tl, y);
    this.closePath();
    return this;
  };
}

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

const getCardCountValue = (card: { value: string }): number => {
  const v = card.value;
  if (["2", "3", "4", "5", "6"].includes(v)) return 1;
  if (["7", "8", "9"].includes(v)) return 0;
  if (["10", "J", "Q", "K", "A"].includes(v)) return -1;
  return 0;
};

interface GameCanvasProps {
  table: any;
  currentUserId: string | null;
  onJoinSeat: (seatIndex: number) => void;
  onSelectSeat?: (seatIndex: number) => void;
  isStrategyHelperEnabled: boolean;
  isBettingHelperEnabled: boolean;
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

const GameCanvas = memo(function GameCanvas({ 
  table, 
  currentUserId, 
  onJoinSeat, 
  onSelectSeat,
  isStrategyHelperEnabled, 
  isBettingHelperEnabled 
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const feltTextureRef = useRef<HTMLCanvasElement | null>(null);
  
  // Animation state stored in refs for the render loop
  const animatedCardsRef = useRef<AnimatedCard[]>([]);
  const lastCardsStateRef = useRef<{
    seats: { [seatIdx: number]: number }; // seatIndex -> card count
    dealer: number; // dealer card count
  }>({ seats: {}, dealer: 0 });
  const lastSplitCardsStateRef = useRef<{ [seatIdx: number]: number }>({});

  const [hoveredSeat, setHoveredSeat] = useState<number | null>(null);
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    return typeof window !== "undefined" && window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
  });

  // Dimensions on a logical canvas
  const WIDTH = isPortrait ? 800 : 1200;
  const HEIGHT = isPortrait ? 1200 : 800;
  const SHOE_X = WIDTH - 190;
  const SHOE_Y = 100;
  const DEALER_X = WIDTH / 2;
  const DEALER_Y = 150;
  const CARD_WIDTH = 65;
  const CARD_HEIGHT = 95;

  // Calculate coordinates for the 12 seats
  const getSeatCoords = (index: number) => {
    if (isPortrait) {
      // 12 seats arranged in a deep U-shape for portrait mode
      const portraitCoords = [
        { x: 140, y: 300 }, // Seat 0
        { x: 140, y: 420 }, // Seat 1
        { x: 150, y: 540 }, // Seat 2
        { x: 170, y: 660 }, // Seat 3
        { x: 220, y: 780 }, // Seat 4
        { x: 320, y: 860 }, // Seat 5
        { x: 480, y: 860 }, // Seat 6
        { x: 580, y: 780 }, // Seat 7
        { x: 630, y: 660 }, // Seat 8
        { x: 650, y: 540 }, // Seat 9
        { x: 660, y: 420 }, // Seat 10
        { x: 660, y: 300 }, // Seat 11
      ];
      return {
        x: portraitCoords[index].x,
        y: portraitCoords[index].y,
        angle: 0,
      };
    }

    // 12 seats arranged from PI * 0.85 to PI * 0.15 (Landscape)
    const startAngle = Math.PI * 0.85;
    const endAngle = Math.PI * 0.15;
    const angleRange = startAngle - endAngle;
    const angle = startAngle - (index / 11) * angleRange;
    
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

  // Get offsets for cards, badges, and chips stacks based on layout/seat
  const getSeatOffsets = (index: number) => {
    if (!isPortrait) {
      return {
        card: { x: -20, y: -40 },
        badge: { x: 0, y: -66 },
        chips: { x: 0, y: -70 }
      };
    }
    // Left-side seats (0, 1, 2, 3, 4)
    if (index <= 4) {
      return {
        card: { x: 55, y: -47 },
        badge: { x: 85, y: -73 },
        chips: { x: 85, y: -5 }
      };
    }
    // Right-side seats (7, 8, 9, 10, 11)
    if (index >= 7) {
      return {
        card: { x: -120, y: -47 },
        badge: { x: -90, y: -73 },
        chips: { x: -90, y: -5 }
      };
    }
    // Bottom seats (5, 6)
    return {
      card: { x: -20, y: -95 },
      badge: { x: 0, y: -121 },
      chips: { x: 0, y: -125 }
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
        lastSplitCardsStateRef.current[seatIdx] = 0;
        return;
      }
      
      const prevCount = lastCardsStateRef.current.seats[seatIdx] || 0;
      const currentCards = seat.cards || [];
      const isSplit = seat.splitCards !== undefined && seat.splitCards.length > 0;

      if (currentCards.length > prevCount) {
        // Add new cards to animation queue
        for (let i = prevCount; i < currentCards.length; i++) {
          const card = currentCards[i];
          const seatCoords = getSeatCoords(seatIdx);
          const offsets = getSeatOffsets(seatIdx);
          
          // Position offset for multiple cards in a hand
          const targetX = isSplit 
            ? seatCoords.x - 65 + i * 16
            : seatCoords.x + offsets.card.x + i * 16;
          const targetY = seatCoords.y + offsets.card.y;

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
          
          delayAccumulator += 900; // stagger next card by 900ms for high tension reveal
        }
      }
      lastCardsStateRef.current.seats[seatIdx] = currentCards.length;

      // 1b. Check Split hand cards
      const prevSplitCount = lastSplitCardsStateRef.current[seatIdx] || 0;
      const currentSplitCards = seat.splitCards || [];

      if (currentSplitCards.length > prevSplitCount) {
        for (let i = prevSplitCount; i < currentSplitCards.length; i++) {
          const card = currentSplitCards[i];
          const seatCoords = getSeatCoords(seatIdx);
          const offsets = getSeatOffsets(seatIdx);
          
          const targetX = seatCoords.x + 15 + i * 16;
          const targetY = seatCoords.y + offsets.card.y;

          newAnimatedCards.push({
            id: `seat-split-${seatIdx}-${i}-${Date.now()}`,
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
          
          delayAccumulator += 900; // stagger split cards by 900ms
        }
      }
      lastSplitCardsStateRef.current[seatIdx] = currentSplitCards.length;
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

        delayAccumulator += 900; // stagger dealer hits by 900ms
      }
      lastCardsStateRef.current.dealer = dealerCards.length;
    }

    // Add these animation tasks to the list
    if (newAnimatedCards.length > 0) {
      animatedCardsRef.current = [...animatedCardsRef.current, ...newAnimatedCards];
    }

  }, [table, isPortrait]);

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
      
      const containerWidth = rect.width;
      const isPortraitMode = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
      
      setIsPortrait(isPortraitMode);

      const activeWidth = isPortraitMode ? 800 : 1200;
      const activeHeight = isPortraitMode ? 1200 : 800;
      
      canvas.width = containerWidth * dpr;
      canvas.height = (containerWidth * (activeHeight / activeWidth)) * dpr;
      canvas.style.width = `${containerWidth}px`;
      canvas.style.height = `${containerWidth * (activeHeight / activeWidth)}px`;

      ctx.scale(dpr * (containerWidth / activeWidth), dpr * (containerWidth / activeWidth));
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

        drawSeat(ctx, seat, coords, isActive, isHovered, isPlayerSeat, index);
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

    // drawSuitVector and drawCardShape extracted to utils/canvasHelpers.ts

    // Offscreen felt texture canvas
    if (!feltTextureRef.current) {
      feltTextureRef.current = document.createElement("canvas");
      feltTextureRef.current.width = 1200;
      feltTextureRef.current.height = 1200;
      const tc = feltTextureRef.current.getContext("2d");
      if (tc) {
        tc.strokeStyle = "rgba(255, 255, 255, 0.018)";
        tc.lineWidth = 0.8;
        for (let i = 0; i < 2000; i++) {
          const rx = Math.random() * 1200;
          const ry = Math.random() * 1200;
          const length = 1.5 + Math.random() * 4.5;
          const angle = Math.random() * Math.PI * 2;
          tc.beginPath();
          tc.moveTo(rx, ry);
          tc.lineTo(rx + Math.cos(angle) * length, ry + Math.sin(angle) * length);
          tc.stroke();
        }
      }
    }

    const drawTableFelt = (c: CanvasRenderingContext2D) => {
      // 1. Radial green felt gradient
      const grad = c.createRadialGradient(WIDTH / 2, HEIGHT / 3, 100, WIDTH / 2, HEIGHT / 2, isPortrait ? 600 : 700);
      grad.addColorStop(0, "#134e4a"); // Light deep green
      grad.addColorStop(0.6, "#0f172a"); // Dark slate slate blue
      grad.addColorStop(1, "#020617"); // Midnight black outer
      c.fillStyle = grad;
      c.fillRect(0, 0, WIDTH, HEIGHT);

      // Draw offscreen felt fabric noise texture overlay
      if (feltTextureRef.current) {
        c.save();
        c.globalCompositeOperation = "screen";
        c.drawImage(feltTextureRef.current, 0, 0, WIDTH, HEIGHT);
        c.restore();
      }

      // Arc constants
      const arcRadius = isPortrait ? 280 : 480;
      const arcCenterY = isPortrait ? HEIGHT * 0.48 : HEIGHT * 0.38;

      // 2a. Mahogany wood bumper rim (thick back rim)
      c.strokeStyle = "#27160c";
      c.lineWidth = 26;
      c.beginPath();
      c.arc(WIDTH / 2, arcCenterY, arcRadius + 13, Math.PI * 0.14, Math.PI * 0.86);
      c.stroke();
      
      c.strokeStyle = "rgba(255, 255, 255, 0.05)";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(WIDTH / 2, arcCenterY, arcRadius + 25, Math.PI * 0.14, Math.PI * 0.86);
      c.stroke();

      // 2b. Curved gold boundary line
      c.strokeStyle = "rgba(226, 184, 66, 0.5)";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(WIDTH / 2, arcCenterY, arcRadius, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();

      // 3. Curved white text guidelines
      c.fillStyle = "rgba(255, 255, 255, 0.12)";
      c.font = "bold 20px 'Outfit', sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      
      c.save();
      // Draw Payout rules arc
      c.fillText("블랙잭 1.5배 지급 (3:2)", WIDTH / 2, arcCenterY - 60);
      c.font = "14px sans-serif";
      c.fillText("딜러는 17 이상 스탠드, 16 이하 드로우", WIDTH / 2, arcCenterY - 20);
      c.restore();
    };

    const drawDealerShoe = (c: CanvasRenderingContext2D) => {
      c.save();
      // 1. Draw Shoe Base / Tray (translucent charcoal plastic)
      c.fillStyle = "rgba(15, 23, 42, 0.85)";
      c.strokeStyle = "rgba(226, 184, 66, 0.7)";
      c.lineWidth = 2;
      
      // Box coordinates in perspective
      const bx = SHOE_X;
      const by = SHOE_Y;
      const bw = 120;
      const bh = 70;
      
      c.beginPath();
      c.roundRect(bx, by, bw, bh, [6, 12, 12, 6]);
      c.fill();
      c.stroke();
      
      // 2. Draw Stack of Cards inside (Red back pattern)
      const maxCards = 312; // 6 decks
      const currentCardsCount = table.deck.length;
      const ratio = Math.max(0, Math.min(1, currentCardsCount / maxCards));
      const stackW = 95 * ratio; // width of card stack shrinks as cards deal
      
      if (stackW > 2) {
        c.save();
        // Red card stack gradient
        const cardStackGrad = c.createLinearGradient(bx + 10, by + 10, bx + 10 + stackW, by + 10);
        cardStackGrad.addColorStop(0, "#991b1b");
        cardStackGrad.addColorStop(0.5, "#dc2626");
        cardStackGrad.addColorStop(1, "#b91c1c");
        c.fillStyle = cardStackGrad;
        
        c.beginPath();
        c.roundRect(bx + 10, by + 10, stackW, bh - 20, 3);
        c.fill();
        
        // Lines on stack to represent individual cards edge
        c.strokeStyle = "rgba(0, 0, 0, 0.25)";
        c.lineWidth = 0.8;
        const lineInterval = Math.max(2, Math.floor(stackW / 24));
        for (let lx = bx + 10 + lineInterval; lx < bx + 10 + stackW; lx += lineInterval) {
          c.beginPath();
          c.moveTo(lx, by + 10);
          c.lineTo(lx, by + bh - 10);
          c.stroke();
        }
        c.restore();
      }

      // 3. Draw heavy roller/pressing block (gold) behind cards
      c.fillStyle = "#e2b842";
      c.beginPath();
      c.roundRect(bx + 10 + stackW, by + 8, 12, bh - 16, 2);
      c.fill();

      // Draw shiny gloss line on pressing block
      c.strokeStyle = "rgba(255, 255, 255, 0.4)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(bx + 12 + stackW, by + 10);
      c.lineTo(bx + 12 + stackW, by + bh - 10);
      c.stroke();

      // 4. Card decks indicator text (6 decks)
      c.fillStyle = "#ffffff";
      c.font = "bold 11px sans-serif";
      c.textAlign = "left";
      c.fillText("카드 슈 (6덱)", bx + 12, by + bh + 15);
      
      c.fillStyle = "rgba(255, 255, 255, 0.6)";
      c.font = "10px sans-serif";
      c.fillText(`${currentCardsCount} / 312`, bx + 12, by + bh + 28);
      
      c.restore();

      // 5. Card Counting Stats Panel (overlay below shoe)
      if (isBettingHelperEnabled) {
        c.save();
        
        // Compute visual running count based on landed cards only (subtraction logic)
        let rc = table.runningCount ?? 0;
        animatedCardsRef.current.forEach(ac => {
          if (ac.hidden) return;
          rc -= getCardCountValue(ac);
        });

        const decksRemaining = Math.max(0.1, currentCardsCount / 52);
        const tc = rc / decksRemaining;

        const rcStr = (rc >= 0 ? "+" : "") + rc;
        const tcStr = (tc >= 0 ? "+" : "") + tc.toFixed(1);

        const px = bx - 10;
        const py = by + bh + 36;
        const pw = 140;
        const ph = 56;

        // Draw counting panel card
        c.fillStyle = "rgba(15, 23, 42, 0.85)";
        c.strokeStyle = "rgba(226, 184, 66, 0.35)";
        c.lineWidth = 1.2;
        c.beginPath();
        c.roundRect(px, py, pw, ph, 8);
        c.fill();
        c.stroke();

        // Title
        c.fillStyle = "rgba(255, 255, 255, 0.6)";
        c.font = "bold 9px sans-serif";
        c.fillText("하이로 카운트 정보", px + 10, py + 14);

        // Stats text layout
        c.fillStyle = "#ffffff";
        c.font = "bold 11px sans-serif";
        c.fillText(`런닝 카운트:`, px + 10, py + 28);
        c.fillText(`트루 카운트:`, px + 10, py + 43);

        c.textAlign = "right";
        c.fillStyle = rc >= 0 ? "#10b981" : "#ef4444";
        c.fillText(rcStr, px + pw - 10, py + 28);
        c.fillStyle = tc >= 0 ? "#10b981" : "#ef4444";
        c.fillText(tcStr, px + pw - 10, py + 43);

        c.restore();
      }
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
        showScore ? `딜러 (${score})` : "딜러",
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
      isPlayerSeat: boolean,
      index: number
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

      const offsets = getSeatOffsets(index);

      // Card placeholder guide
      if (seat.userId !== null) {
        c.save();
        const cardX = coords.x + offsets.card.x;
        const cardY = coords.y + offsets.card.y;
        c.strokeStyle = "rgba(226, 184, 66, 0.12)";
        c.lineWidth = 1.2;
        c.setLineDash([4, 3]);
        c.beginPath();
        c.roundRect(cardX, cardY, CARD_WIDTH, CARD_HEIGHT, 5);
        c.stroke();
        c.restore();
      }

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
          drawChipsStack(c, coords.x + offsets.chips.x, coords.y + offsets.chips.y, seat.bet);
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

        // Draw Side Bets / Insurance status overlay
        if (seat.sideBetPerfectPairs && seat.sideBetPerfectPairs > 0) {
          const ppX = coords.x - 32;
          const ppY = coords.y + 40;
          c.save();
          c.fillStyle = "rgba(15, 23, 42, 0.9)";
          c.strokeStyle = seat.sideBetPerfectPairsStatus === "lost" ? "#ef4444" : 
                          (seat.sideBetPerfectPairsStatus && seat.sideBetPerfectPairsStatus !== "none" ? "#10b981" : "#e2b842");
          c.lineWidth = 1;
          c.beginPath();
          c.roundRect(ppX - 16, ppY - 8, 32, 16, 4);
          c.fill();
          c.stroke();
          
          c.fillStyle = "#ffffff";
          c.font = "bold 8px sans-serif";
          c.fillText("PP", ppX, ppY - 1);
          c.fillStyle = "#e2b842";
          c.fillText(`$${seat.sideBetPerfectPairs}`, ppX, ppY + 6);

          if (seat.sideBetPerfectPairsWinAmount && seat.sideBetPerfectPairsWinAmount > 0) {
            c.fillStyle = "#10b981";
            c.font = "bold 9px sans-serif";
            c.fillText(`+${seat.sideBetPerfectPairsWinAmount}`, ppX, ppY - 12);
          }
          c.restore();
        }

        if (seat.sideBet213 && seat.sideBet213 > 0) {
          const pokerX = coords.x + 32;
          const pokerY = coords.y + 40;
          c.save();
          c.fillStyle = "rgba(15, 23, 42, 0.9)";
          c.strokeStyle = seat.sideBet213Status === "lost" ? "#ef4444" : 
                          (seat.sideBet213Status && seat.sideBet213Status !== "none" ? "#10b981" : "#e2b842");
          c.lineWidth = 1;
          c.beginPath();
          c.roundRect(pokerX - 16, pokerY - 8, 32, 16, 4);
          c.fill();
          c.stroke();
          
          c.fillStyle = "#ffffff";
          c.font = "bold 8px sans-serif";
          c.fillText("21+3", pokerX, pokerY - 1);
          c.fillStyle = "#e2b842";
          c.fillText(`$${seat.sideBet213}`, pokerX, pokerY + 6);

          if (seat.sideBet213WinAmount && seat.sideBet213WinAmount > 0) {
            c.fillStyle = "#10b981";
            c.font = "bold 9px sans-serif";
            c.fillText(`+${seat.sideBet213WinAmount}`, pokerX, pokerY - 12);
          }
          c.restore();
        }

        if (seat.insuranceBet && seat.insuranceBet > 0) {
          const insX = coords.x;
          const insY = coords.y - 48;
          c.save();
          c.fillStyle = "rgba(15, 23, 42, 0.95)";
          c.strokeStyle = seat.insuranceStatus === "lost" ? "#ef4444" : 
                          (seat.insuranceStatus === "won" ? "#10b981" : "#e2b842");
          c.lineWidth = 1.2;
          c.beginPath();
          c.roundRect(insX - 22, insY - 8, 44, 16, 4);
          c.fill();
          c.stroke();
          
          c.fillStyle = "#ffffff";
          c.font = "bold 8px sans-serif";
          c.fillText("보험", insX, insY - 1);
          c.fillStyle = "#e2b842";
          c.fillText(`$${seat.insuranceBet}`, insX, insY + 6);
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
        c.fillText("빈 자리", coords.x, coords.y - 5);
        c.font = "10px sans-serif";
        c.fillText("착석하기", coords.x, coords.y + 10);
      }

      c.restore();
    };

    // drawSingleChip and drawChipsStack extracted to utils/canvasHelpers.ts

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
        const offsets = getSeatOffsets(seatIdx);
        const isSplit = seat.splitCards !== undefined && seat.splitCards.length > 0;

        const hands = [];
        if (isSplit) {
          hands.push({
            cards: seat.cards,
            status: seat.status,
            activeHandIdx: 0,
            cardOffsetX: -65,
            badgeOffsetX: -45,
          });
          hands.push({
            cards: seat.splitCards,
            status: seat.splitStatus || "playing",
            activeHandIdx: 1,
            cardOffsetX: 15,
            badgeOffsetX: 35,
          });
        } else {
          hands.push({
            cards: seat.cards,
            status: seat.status,
            activeHandIdx: -1,
            cardOffsetX: offsets.card.x,
            badgeOffsetX: offsets.badge.x,
          });
        }

        hands.forEach((hand) => {
          const cards = hand.cards || [];
          
          cards.forEach((card: any, cardIdx: number) => {
            const animId = hand.activeHandIdx === 1 
              ? `seat-split-${seatIdx}-${cardIdx}-`
              : `seat-${seatIdx}-${cardIdx}-`;
            const isAnimating = animatedCardsRef.current.some(ac => ac.id.startsWith(animId));
            if (isAnimating) return; // let animation draw it

            const x = seatCoords.x + hand.cardOffsetX + cardIdx * 16;
            const y = seatCoords.y + offsets.card.y;
            const isRed = ["H", "D"].includes(card.suit);

            drawCardShape(c, x, y, CARD_WIDTH, CARD_HEIGHT, 5, isRed, card.value, card.suit, !!card.hidden);
          });

          // Render score value above this card hand
          if (cards.length > 0) {
            const val = getHandValue(cards);
            
            c.save();
            // Highlight active hand in gold, otherwise standard border
            const isHandActive = table.activeSeatIndex === seatIdx && 
                                 table.status === "playing" &&
                                 (hand.activeHandIdx === -1 || table.seats[seatIdx].activeHandIndex === hand.activeHandIdx);
            
            c.fillStyle = "rgba(15, 23, 42, 0.85)";
            c.strokeStyle = isHandActive ? "#f59e0b" : "#e2b842";
            c.lineWidth = isHandActive ? 2.5 : 1.5;
            
            const badgeX = seatCoords.x + hand.badgeOffsetX;
            const badgeY = seatCoords.y + offsets.badge.y;
            
            c.beginPath();
            c.arc(badgeX, badgeY, 18, 0, Math.PI * 2);
            c.fill();
            c.stroke();
            
            // Pulsing highlight around the active score badge
            if (isHandActive) {
              const pulse = 18 + Math.sin(Date.now() * 0.007) * 3.5;
              c.strokeStyle = "rgba(245, 158, 11, 0.5)";
              c.lineWidth = 2;
              c.beginPath();
              c.arc(badgeX, badgeY, pulse, 0, Math.PI * 2);
              c.stroke();
            }

            // Draw a gold recommendation indicator dot if helper is enabled
            if (isStrategyHelperEnabled && isHandActive) {
              c.fillStyle = "#e2b842";
              c.beginPath();
              c.arc(badgeX + 11, badgeY - 11, 4, 0, Math.PI * 2);
              c.fill();
            }

            c.fillStyle = "#ffffff";
            c.font = "bold 14px sans-serif";
            c.textAlign = "center";
            c.textBaseline = "middle";

            let displayVal = `${val}`;
            if (hand.status === "blackjack") displayVal = "BJ";
            if (hand.status === "busted") displayVal = "BT";

            c.fillText(displayVal, badgeX, badgeY);
            c.restore();
          }
        });
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

      const logW = isPortrait ? 720 : 340;
      const logH = 120;
      const logX = isPortrait ? 40 : 20;
      const logY = HEIGHT - logH - 20;

      c.beginPath();
      c.roundRect(logX, logY, logW, logH, 8);
      c.fill();
      c.stroke();

      // Heading
      c.fillStyle = "#e2b842";
      c.font = "bold 10px sans-serif";
      c.fillText("테이블 로그", logX + 12, logY + 18);

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
            table.status === "betting" ? "배팅 시간" : (table.status === "round_over" ? "다음 라운드 대기" : "남은 시간"),
            isPortrait ? WIDTH - 180 : WIDTH - 150,
            HEIGHT - 45
          );

          // Bar outer
          c.strokeStyle = "rgba(255,255,255,0.2)";
          c.lineWidth = 1;
          c.beginPath();
          c.roundRect(isPortrait ? WIDTH - 180 : WIDTH - 150, HEIGHT - 35, isPortrait ? 140 : 130, 8, 4);
          c.stroke();

          // Bar inner (progress color transitions from green to red)
          const barColor = ratio > 0.4 ? "#10b981" : (ratio > 0.2 ? "#f59e0b" : "#ef4444");
          c.fillStyle = barColor;
          c.beginPath();
          c.roundRect(isPortrait ? WIDTH - 180 : WIDTH - 150, HEIGHT - 35, (isPortrait ? 140 : 130) * ratio, 8, 4);
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
  }, [table, hoveredSeat, currentUserId, isPortrait]);

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

    // Check if player clicked any seat circle (12 seats)
    for (let i = 0; i < 12; i++) {
      const coords = getSeatCoords(i);
      // Distance calculation
      const dx = clickX - coords.x;
      const dy = clickY - coords.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= 45) { // seat radius is 45
        // Clicked!
        if (table.seats[i].userId === null) {
          onJoinSeat(i);
        } else if (table.seats[i].userId === currentUserId) {
          onSelectSeat?.(i);
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
    for (let i = 0; i < 12; i++) {
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
});

export default GameCanvas;
