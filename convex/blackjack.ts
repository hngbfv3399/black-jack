import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Define TypeScript structures matching schema
export type Card = {
  suit: string;
  value: string;
  hidden?: boolean;
};

export type Seat = {
  userId: string | null;
  nickname: string | null;
  balance: number;
  bet: number;
  cards: Card[];
  status: string;
  lastAction?: string;
};

// Card utility functions
export function createDeck(): Card[] {
  const suits = ["H", "D", "C", "S"];
  const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const deck: Card[] = [];
  
  // Use 3 decks as requested
  for (let i = 0; i < 3; i++) {
    for (const suit of suits) {
      for (const value of values) {
        deck.push({ suit, value });
      }
    }
  }

  // Shuffle (Fisher-Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }
  
  return deck;
}

export function getHandValue(cards: Card[]): number {
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
}

export function getCardCountValue(card: Card): number {
  const v = card.value;
  if (["2", "3", "4", "5", "6"].includes(v)) return 1;
  if (["7", "8", "9"].includes(v)) return 0;
  if (["10", "J", "Q", "K", "A"].includes(v)) return -1;
  return 0;
}

// Queries

// List recently active Blackjack tables (limited to 50 to optimize performance)
export const listTables = query({
  args: {},
  handler: async (ctx) => {
    let tables = await ctx.db
      .query("tables")
      .withIndex("by_lastUpdated")
      .order("desc")
      .take(50);
    
    // Auto-create a default table if none exist so players can join instantly
    if (tables.length === 0) {
      return [];
    }
    
    return tables.map(t => ({
      _id: t._id,
      name: t.name,
      status: t.status,
      playerCount: t.seats.filter(s => s.userId !== null).length,
    }));
  },
});

// Seed a default table if none exists (called by client if lobby empty)
export const seedDefaultTable = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("tables")
      .withIndex("by_lastUpdated")
      .first();
    if (existing) return existing._id;

    const seats = Array.from({ length: 8 }, () => ({
      userId: null,
      nickname: null,
      balance: 0,
      bet: 0,
      cards: [],
      status: "idle",
      lastAction: "",
    }));

    const tableId = await ctx.db.insert("tables", {
      name: "Grand Casino Classic",
      status: "waiting",
      seats,
      dealer: { cards: [], status: "playing" },
      deck: createDeck(),
      activeSeatIndex: -1,
      roundNumber: 1,
      history: ["테이블이 생성되었습니다. 블랙잭에 오신 것을 환영합니다!"],
      lastUpdated: Date.now(),
      runningCount: 0,
    });

    return tableId;
  },
});

// Create custom Blackjack table lobby
export const createTable = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("로그인이 필요합니다.");

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 25) {
      throw new Error("테이블 이름은 2자에서 25자 사이여야 합니다.");
    }

    const seats = Array.from({ length: 8 }, () => ({
      userId: null,
      nickname: null,
      balance: 0,
      bet: 0,
      cards: [],
      status: "idle",
      lastAction: "",
    }));

    const tableId = await ctx.db.insert("tables", {
      name: trimmed,
      status: "waiting",
      seats,
      dealer: { cards: [], status: "playing" },
      deck: createDeck(),
      activeSeatIndex: -1,
      roundNumber: 1,
      history: [`플레이어가 테이블 "${trimmed}"을(를) 생성했습니다.`],
      lastUpdated: Date.now(),
      hostId: userId,
      runningCount: 0,
    });

    return tableId;
  },
});

// Get detailed game table state by ID
export const getTable = query({
  args: { tableId: v.id("tables") },
  handler: async (ctx, { tableId }) => {
    return await ctx.db.get(tableId);
  },
});

// Mutations

// User sits down at a seat
export const joinSeat = mutation({
  args: { tableId: v.id("tables"), seatIndex: v.number() },
  handler: async (ctx, { tableId, seatIndex }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("로그인이 필요합니다.");

    const user = await ctx.db.get(userId);
    if (!user || !user.isOnboarded) throw new Error("프로필 설정을 완료해주세요.");

    const table = await ctx.db.get(tableId);
    if (!table) throw new Error("테이블을 찾을 수 없습니다.");

    if (seatIndex < 0 || seatIndex >= 8) throw new Error("유효하지 않은 자리 선택입니다.");
    if (table.seats[seatIndex].userId !== null) throw new Error("이미 다른 플레이어가 앉아있는 자리입니다.");

    // Check if player is already seated at another seat
    const alreadySeated = table.seats.some(s => s.userId === userId);
    if (alreadySeated) throw new Error("이미 이 테이블의 자리에 앉아 있습니다.");

    // Copy player info to seat
    const updatedSeats = [...table.seats];
    updatedSeats[seatIndex] = {
      userId,
      nickname: user.nickname ?? "Anonymous Player",
      balance: user.balance ?? 3000,
      bet: 0,
      cards: [],
      status: "idle",
      lastAction: "착석",
    };

    const newHistory = [...table.history, `${user.nickname}님이 ${seatIndex + 1}번 자리에 앉았습니다.`].slice(-15);

    let newStatus = table.status;
    let newTimer = table.timer;

    // If table was waiting (empty) and we now have a player, transition to betting phase (no timer)
    if (table.status === "waiting") {
      newStatus = "betting";
      newTimer = undefined;
    }

    await ctx.db.patch(tableId, {
      seats: updatedSeats,
      status: newStatus,
      timer: newTimer,
      history: newHistory,
      lastUpdated: Date.now(),
    });
  },
});

// User leaves their seat
export const leaveSeat = mutation({
  args: { tableId: v.id("tables"), seatIndex: v.number() },
  handler: async (ctx, { tableId, seatIndex }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("로그인이 필요합니다.");

    const table = await ctx.db.get(tableId);
    if (!table) throw new Error("테이블을 찾을 수 없습니다.");

    const seat = table.seats[seatIndex];
    if (seat.userId !== userId) throw new Error("이 자리에 앉아 있지 않습니다.");

    // Refund bet if in betting phase, otherwise they forfeit the active bet
    const updatedSeats = [...table.seats];
    updatedSeats[seatIndex] = {
      userId: null,
      nickname: null,
      balance: 0,
      bet: 0,
      cards: [],
      status: "idle",
      lastAction: "퇴장",
    };

    // Return any remaining balance to the user's permanent record
    const user = await ctx.db.get(userId);
    if (user && seat.balance !== user.balance) {
      await ctx.db.patch(userId, { balance: seat.balance });
    }

    const newHistory = [...table.history, `${seat.nickname}님이 ${seatIndex + 1}번 자리에서 일어났습니다.`].slice(-15);

    // Check if table is empty now
    const activePlayers = updatedSeats.filter(s => s.userId !== null);
    
    if (activePlayers.length === 0) {
      await ctx.db.delete(tableId);
      return;
    }

    let newStatus = table.status;
    let newActiveSeat = table.activeSeatIndex;
    let newTimer = table.timer;

    if (activePlayers.length === 0) {
      newStatus = "waiting";
      newActiveSeat = -1;
      newTimer = undefined;
    } else if (table.status === "playing" && table.activeSeatIndex === seatIndex) {
      // If the player left during their turn, advance turn
      // We will perform this in a deferred function call to maintain transactional safety
    }

    await ctx.db.patch(tableId, {
      seats: updatedSeats,
      status: newStatus,
      activeSeatIndex: newActiveSeat,
      timer: newTimer,
      history: newHistory,
      lastUpdated: Date.now(),
    });

    // If player left during their active turn, we advance the turn asynchronously
    if (table.status === "playing" && table.activeSeatIndex === seatIndex) {
      await ctx.scheduler.runAfter(0, internal.blackjack.advanceTurnAsync, {
        tableId,
        roundNumber: table.roundNumber,
      });
    }
  },
});

// User leaves the table entirely (goes back to lobby or leaves screen)
// If they are seated, they stand up first. If they are the host, the table is deleted.
export const leaveTable = mutation({
  args: { tableId: v.id("tables") },
  handler: async (ctx, { tableId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { deleted: false };

    const table = await ctx.db.get(tableId);
    if (!table) return { deleted: false };

    const seatIndex = table.seats.findIndex(s => s.userId === userId);
    let updatedSeats = [...table.seats];

    // If seated, handle leaving the seat (refunding/forfeiting bet, syncing balance)
    if (seatIndex !== -1) {
      const seat = table.seats[seatIndex];
      updatedSeats[seatIndex] = {
        userId: null,
        nickname: null,
        balance: 0,
        bet: 0,
        cards: [],
        status: "idle",
        lastAction: "퇴장",
      };

      const user = await ctx.db.get(userId);
      if (user && seat.balance !== user.balance) {
        await ctx.db.patch(userId, { balance: seat.balance });
      }

      // If they left during their active turn, advance the turn asynchronously
      if (table.status === "playing" && table.activeSeatIndex === seatIndex) {
        await ctx.scheduler.runAfter(0, internal.blackjack.advanceTurnAsync, {
          tableId,
          roundNumber: table.roundNumber,
        });
      }
    }

    // If host, delete the entire table room!
    if (table.hostId === userId) {
      await ctx.db.delete(tableId);
      return { deleted: true };
    }

    // Otherwise, patch the table with updated seats if we modified them
    if (seatIndex !== -1) {
      const activePlayers = updatedSeats.filter(s => s.userId !== null);
      
      if (activePlayers.length === 0) {
        await ctx.db.delete(tableId);
        return { deleted: true };
      }

      let newStatus = table.status;
      let newActiveSeat = table.activeSeatIndex;
      let newTimer = table.timer;

      if (activePlayers.length === 0) {
        newStatus = "waiting";
        newActiveSeat = -1;
        newTimer = undefined;
      }

      const nickname = table.seats[seatIndex]?.nickname ?? "Player";
      const newHistory = [...(table.history ?? []), `${nickname}님이 테이블을 퇴장했습니다.`].slice(-15);

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        status: newStatus,
        activeSeatIndex: newActiveSeat,
        timer: newTimer,
        history: newHistory,
        lastUpdated: Date.now(),
      });
    }

    return { deleted: false };
  },
});

// Player places a bet during betting phase
export const placeBet = mutation({
  args: { tableId: v.id("tables"), seatIndex: v.number(), amount: v.number() },
  handler: async (ctx, { tableId, seatIndex, amount }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("로그인이 필요합니다.");

    const table = await ctx.db.get(tableId);
    if (!table) throw new Error("테이블을 찾을 수 없습니다.");

    if (table.status !== "betting") throw new Error("베팅은 배팅 단계에서만 가능합니다.");
    
    const seat = table.seats[seatIndex];
    if (seat.userId !== userId) throw new Error("이 자리에 앉아 있지 않습니다.");
    if (amount <= 0) throw new Error("베팅 금액은 0보다 커야 합니다.");
    if (amount > seat.balance) throw new Error("잔액이 부족합니다.");

    const updatedSeats = [...table.seats];
    const newSeatBalance = seat.balance - amount;
    
    updatedSeats[seatIndex] = {
      ...seat,
      bet: amount,
      balance: newSeatBalance,
      status: "betting",
      lastAction: `배팅 $${amount}`,
    };

    // Sync balance immediately to user record
    await ctx.db.patch(userId, { balance: newSeatBalance });

    const newHistory = [...table.history, `${seat.nickname}님이 $${amount}를 배팅했습니다.`].slice(-15);

    // If all seated players have placed their bets, start the round immediately!
    const seatedPlayers = updatedSeats.filter(s => s.userId !== null);
    const allPlacedBets = seatedPlayers.every(s => s.bet > 0);

    await ctx.db.patch(tableId, {
      seats: updatedSeats,
      history: newHistory,
      lastUpdated: Date.now(),
    });

    if (allPlacedBets) {
      // Transition immediately
      await ctx.scheduler.runAfter(0, internal.blackjack.dealCards, {
        tableId,
        roundNumber: table.roundNumber,
      });
    }
  },
});

// Hit / Stand / Double Down player action
export const playAction = mutation({
  args: { tableId: v.id("tables"), seatIndex: v.number(), action: v.string() },
  handler: async (ctx, { tableId, seatIndex, action }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("로그인이 필요합니다.");

    const table = await ctx.db.get(tableId);
    if (!table) throw new Error("테이블을 찾을 수 없습니다.");

    if (table.status !== "playing") throw new Error("게임이 진행 중인 단계가 아닙니다.");
    if (table.activeSeatIndex !== seatIndex) throw new Error("당신의 차례가 아닙니다.");

    const seat = table.seats[seatIndex];
    if (seat.userId !== userId) throw new Error("이 자리에 앉아 있지 않습니다.");

    const updatedSeats = [...table.seats];
    let updatedDeck = [...table.deck];
    const newHistory = [...table.history];
    let runningCount = table.runningCount ?? 0;

    // Ensure we have enough cards in shoe (reshuffle if running low, safe for 3-deck shoe)
    if (updatedDeck.length < 20) {
      updatedDeck = createDeck();
      newHistory.push("카드 슈에 카드가 부족하여 새로 셔플했습니다!");
      runningCount = 0;
    }

    const isSplit = seat.splitCards !== undefined;
    const isSplitHandActive = isSplit && seat.activeHandIndex === 1;

    if (action === "hit") {
      const currentCards = isSplitHandActive ? seat.splitCards! : seat.cards;
      const drawnCard = updatedDeck.pop()!;
      runningCount += getCardCountValue(drawnCard);

      const newCards = [...currentCards, drawnCard];
      const newScore = getHandValue(newCards);
      
      let newHandStatus = "playing";
      let logMsg = `${seat.nickname}님이 히트했습니다 (${isSplitHandActive ? '스플릿 핸드' : '메인 핸드'}). 카드 획득: ${drawnCard.value}${drawnCard.suit}`;

      if (newScore > 21) {
        newHandStatus = "busted";
        logMsg += " (버스트!)";
      } else if (newScore === 21) {
        newHandStatus = "stood";
        logMsg += " (21!)";
      }

      const updatedSeat = { ...seat };
      if (isSplitHandActive) {
        updatedSeat.splitCards = newCards;
        updatedSeat.splitStatus = newHandStatus;
        updatedSeat.lastAction = "히트";
      } else {
        updatedSeat.cards = newCards;
        updatedSeat.status = newHandStatus;
        updatedSeat.lastAction = "히트";
      }
      updatedSeats[seatIndex] = updatedSeat;
      newHistory.push(logMsg);

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        deck: updatedDeck,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
        runningCount,
      });

      const handEnded = newHandStatus !== "playing";
      if (handEnded) {
        if (isSplit && seat.activeHandIndex === 0) {
          // Switch to Split Hand (Hand 2)
          updatedSeats[seatIndex] = {
            ...updatedSeat,
            activeHandIndex: 1,
          };
          await ctx.db.patch(tableId, {
            seats: updatedSeats,
            timer: Date.now() + 15000,
            lastUpdated: Date.now(),
            runningCount,
          });
        } else {
          // Advance turn
          await ctx.scheduler.runAfter(0, internal.blackjack.advanceTurnAsync, {
            tableId,
            roundNumber: table.roundNumber,
          });
        }
      } else {
        // Reset turn timer (15 seconds) for same player
        await ctx.db.patch(tableId, {
          timer: Date.now() + 15000,
          lastUpdated: Date.now(),
          runningCount,
        });
      }

    } else if (action === "stand") {
      const currentCards = isSplitHandActive ? seat.splitCards! : seat.cards;
      const currentScore = getHandValue(currentCards);
      const updatedSeat = { ...seat };

      if (isSplitHandActive) {
        updatedSeat.splitStatus = "stood";
        updatedSeat.lastAction = "스탠드";
      } else {
        updatedSeat.status = "stood";
        updatedSeat.lastAction = "스탠드";
      }
      updatedSeats[seatIndex] = updatedSeat;
      newHistory.push(`${seat.nickname}님이 ${currentScore}점으로 스탠드했습니다 (${isSplitHandActive ? '스플릿 핸드' : '메인 핸드'})`);

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
        runningCount,
      });

      if (isSplit && seat.activeHandIndex === 0) {
        // Switch to Split Hand (Hand 2)
        updatedSeats[seatIndex] = {
          ...updatedSeat,
          activeHandIndex: 1,
        };
        await ctx.db.patch(tableId, {
          seats: updatedSeats,
          timer: Date.now() + 15000,
          lastUpdated: Date.now(),
          runningCount,
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.blackjack.advanceTurnAsync, {
          tableId,
          roundNumber: table.roundNumber,
        });
      }

    } else if (action === "double") {
      const currentCards = isSplitHandActive ? seat.splitCards! : seat.cards;
      const currentBet = isSplitHandActive ? seat.splitBet! : seat.bet;

      if (currentCards.length !== 2) throw new Error("더블 다운은 처음 받은 2장의 카드로만 가능합니다.");
      if (seat.balance < currentBet) throw new Error("베팅을 두 배로 늘릴 칩이 부족합니다.");

      const extraBet = currentBet;
      const newBalance = seat.balance - extraBet;
      const newBet = currentBet * 2;

      await ctx.db.patch(userId, { balance: newBalance });

      const drawnCard = updatedDeck.pop()!;
      runningCount += getCardCountValue(drawnCard);

      const newCards = [...currentCards, drawnCard];
      const newScore = getHandValue(newCards);
      const newHandStatus = newScore > 21 ? "busted" : "stood";
      const updatedSeat = { ...seat };

      if (isSplitHandActive) {
        updatedSeat.splitBet = newBet;
        updatedSeat.balance = newBalance;
        updatedSeat.splitCards = newCards;
        updatedSeat.splitStatus = newHandStatus;
        updatedSeat.lastAction = "더블";
      } else {
        updatedSeat.bet = newBet;
        updatedSeat.balance = newBalance;
        updatedSeat.cards = newCards;
        updatedSeat.status = newHandStatus;
        updatedSeat.lastAction = "더블";
      }
      updatedSeats[seatIndex] = updatedSeat;

      let logMsg = `${seat.nickname} 더블 다운: $${newBet}로 배팅 증가 (${isSplitHandActive ? '스플릿 핸드' : '메인 핸드'}), 카드: ${drawnCard.value}${drawnCard.suit}`;
      if (newScore > 21) logMsg += " (버스트!)";

      newHistory.push(logMsg);

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        deck: updatedDeck,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
        runningCount,
      });

      if (isSplit && seat.activeHandIndex === 0) {
        // Switch to Split Hand (Hand 2)
        updatedSeats[seatIndex] = {
          ...updatedSeat,
          activeHandIndex: 1,
        };
        await ctx.db.patch(tableId, {
          seats: updatedSeats,
          timer: Date.now() + 15000,
          lastUpdated: Date.now(),
          runningCount,
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.blackjack.advanceTurnAsync, {
          tableId,
          roundNumber: table.roundNumber,
        });
      }
    } else if (action === "split") {
      if (seat.cards.length !== 2) throw new Error("스플릿은 처음 받은 2장의 카드로만 가능합니다.");
      if (seat.cards[0].value !== seat.cards[1].value) throw new Error("스플릿하려면 카드의 숫자가 같아야 합니다.");
      if (seat.balance < seat.bet) throw new Error("스플릿 베팅을 할 칩이 부족합니다.");

      const splitBet = seat.bet;
      const newBalance = seat.balance - splitBet;

      await ctx.db.patch(userId, { balance: newBalance });

      const card0 = seat.cards[0];
      const card1 = seat.cards[1];

      const drawn1 = updatedDeck.pop()!;
      const drawn2 = updatedDeck.pop()!;
      runningCount += getCardCountValue(drawn1) + getCardCountValue(drawn2);

      const newCards = [card0, drawn1];
      const newSplitCards = [card1, drawn2];

      updatedSeats[seatIndex] = {
        ...seat,
        balance: newBalance,
        cards: newCards,
        splitCards: newSplitCards,
        splitBet: splitBet,
        status: "playing",
        splitStatus: "playing",
        activeHandIndex: 0,
        lastAction: "스플릿",
      };

      newHistory.push(`${seat.nickname}님이 ${card0.value} 카드를 스플릿했습니다. 1번 핸드: ${drawn1.value}${drawn1.suit}, 2번 핸드: ${drawn2.value}${drawn2.suit}`);

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        deck: updatedDeck,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
        runningCount,
      });

      await ctx.db.patch(tableId, {
        timer: Date.now() + 15000,
        lastUpdated: Date.now(),
        runningCount,
      });
    }
  },
});

// Internal timeout handlers & transitions

// End betting timer timeout
export const endBettingTimeout = internalMutation({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, { tableId, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "betting" || table.roundNumber !== roundNumber) return;

    // Proceed to deal cards
    await ctx.scheduler.runAfter(0, internal.blackjack.dealCards, { tableId, roundNumber });
  },
});

// Deal initial 2 cards to active players and dealer
export const dealCards = internalMutation({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, { tableId, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "betting" || table.roundNumber !== roundNumber) return;

    const updatedSeats = [...table.seats];
    let updatedDeck = [...table.deck];
    const newHistory = [...table.history, "시작 카드 딜링 중..."];

    // Identify who betted
    const bettingSeatsIndices: number[] = [];
    for (let i = 0; i < 8; i++) {
      const s = updatedSeats[i];
      if (s.userId !== null && s.bet > 0) {
        bettingSeatsIndices.push(i);
        updatedSeats[i] = {
          ...s,
          cards: [],
          status: "playing",
        };
      } else {
        // Set spectator/idle status
        updatedSeats[i] = {
          ...s,
          cards: [],
          bet: 0,
          status: "idle",
        };
      }
    }

    // If nobody placed a bet, restart betting countdown
    if (bettingSeatsIndices.length === 0) {
      newHistory.push("배팅금액이 없습니다. 대기 중...");
      await ctx.db.patch(tableId, {
        status: "betting",
        timer: Date.now() + 15000,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
      });

      await ctx.scheduler.runAfter(15000, internal.blackjack.endBettingTimeout, {
        tableId,
        roundNumber,
      });
      return;
    }

    // Deal phase: Player 1st, Dealer 1st, Player 2nd, Dealer 2nd (face down)
    // Card drawing helper
    let runningCount = table.runningCount ?? 0;
    const draw = (faceUp = true) => {
      if (updatedDeck.length < 10) {
        updatedDeck = createDeck();
        runningCount = 0; // reset on reshuffle!
      }
      const c = updatedDeck.pop()!;
      if (faceUp) {
        runningCount += getCardCountValue(c);
      }
      return c;
    };

    // Deal Card 1
    for (const idx of bettingSeatsIndices) {
      updatedSeats[idx].cards.push(draw(true));
    }
    const dealerFirstCard = draw(true);
    
    // Deal Card 2
    for (const idx of bettingSeatsIndices) {
      updatedSeats[idx].cards.push(draw(true));
    }
    const dealerSecondCard = { ...draw(false), hidden: true };

    const dealerHand = {
      cards: [dealerFirstCard, dealerSecondCard],
      status: "playing",
    };

    // Check for natural blackjacks
    for (const idx of bettingSeatsIndices) {
      const val = getHandValue(updatedSeats[idx].cards);
      if (val === 21) {
        updatedSeats[idx].status = "blackjack";
        newHistory.push(`${updatedSeats[idx].nickname}님 내추럴 블랙잭 달성!`);
      }
    }

    // Check if dealer has immediate natural blackjack (Dealer has 10/A showing)
    const dealerShowValue = getHandValue([dealerFirstCard]);
    let immediateSettle = false;
    
    // If dealer has 10 or Ace up, peek for blackjack
    if ([10, 11].includes(dealerShowValue)) {
      const realDealerScore = getHandValue([dealerFirstCard, { ...dealerSecondCard, hidden: false }]);
      if (realDealerScore === 21) {
        dealerHand.cards[1].hidden = false; // Reveal card
        dealerHand.status = "blackjack";
        newHistory.push("딜러 블랙잭 달성!");
        immediateSettle = true;
      }
    }

    if (immediateSettle) {
      // Reveal second card -> add its value to running count!
      runningCount += getCardCountValue(dealerSecondCard);

      // Jump straight to dealer turn / settlement
      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        dealer: dealerHand,
        deck: updatedDeck,
        status: "dealer_turn",
        activeSeatIndex: -1,
        timer: undefined,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
        runningCount,
      });

      await ctx.scheduler.runAfter(15000, internal.blackjack.settleRound, {
        tableId,
        roundNumber,
      });
      return;
    }

    // Determine first acting player
    let firstPlayerIdx = -1;
    for (const idx of bettingSeatsIndices) {
      // Natural blackjacks don't need to act
      if (updatedSeats[idx].status === "playing") {
        firstPlayerIdx = idx;
        break;
      }
    }

    if (firstPlayerIdx === -1) {
      // Everyone has blackjack! Settle immediately
      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        dealer: dealerHand,
        deck: updatedDeck,
        status: "dealer_turn",
        activeSeatIndex: -1,
        timer: undefined,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
        runningCount,
      });

      await ctx.scheduler.runAfter(15000, internal.blackjack.settleRound, {
        tableId,
        roundNumber,
      });
    } else {
      // Set active player and start turn timer
      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        dealer: dealerHand,
        deck: updatedDeck,
        status: "playing",
        activeSeatIndex: firstPlayerIdx,
        timer: Date.now() + 15000,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
        runningCount,
      });

      // Schedule turn timeout
      await ctx.scheduler.runAfter(15000, internal.blackjack.turnTimeout, {
        tableId,
        seatIndex: firstPlayerIdx,
        roundNumber,
      });
    }
  },
});

// Asynchronous wrapper for advancing turn
export const advanceTurnAsync = internalMutation({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, { tableId, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "playing" || table.roundNumber !== roundNumber) return;

    let nextSeatIndex = -1;
    // Find next seat that is currently "playing"
    for (let i = table.activeSeatIndex + 1; i < 8; i++) {
      if (table.seats[i].userId !== null && table.seats[i].status === "playing") {
        nextSeatIndex = i;
        break;
      }
    }

    if (nextSeatIndex === -1) {
      // No more players to act -> Dealer's turn!
      await ctx.db.patch(tableId, {
        status: "dealer_turn",
        activeSeatIndex: -1,
        timer: undefined,
        lastUpdated: Date.now(),
      });

      await ctx.scheduler.runAfter(0, internal.blackjack.dealerPlay, {
        tableId,
        roundNumber,
      });
    } else {
      // Advance to next player
      await ctx.db.patch(tableId, {
        activeSeatIndex: nextSeatIndex,
        timer: Date.now() + 15000, // 15s timer
        lastUpdated: Date.now(),
      });

      // Schedule next timeout
      await ctx.scheduler.runAfter(15000, internal.blackjack.turnTimeout, {
        tableId,
        seatIndex: nextSeatIndex,
        roundNumber,
      });
    }
  },
});

// Player turn timeout handler
export const turnTimeout = internalMutation({
  args: { tableId: v.id("tables"), seatIndex: v.number(), roundNumber: v.number() },
  handler: async (ctx, { tableId, seatIndex, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "playing" || table.activeSeatIndex !== seatIndex || table.roundNumber !== roundNumber) return;

    // Force Stand on timeout
    const updatedSeats = [...table.seats];
    const seat = updatedSeats[seatIndex];
    const isSplit = seat.splitCards !== undefined;

    if (isSplit && seat.activeHandIndex === 0) {
      // Force stand on hand 1, switch to split hand (hand 2)
      updatedSeats[seatIndex] = {
        ...seat,
        status: "stood",
        activeHandIndex: 1,
        lastAction: "스탠드(시간초과)",
      };
      
      const newHistory = [...table.history, `${seat.nickname}님이 메인 핸드에서 시간 초과로 ${getHandValue(seat.cards)}점에서 자동 스탠드되었습니다.`].slice(-15);

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        history: newHistory,
        timer: Date.now() + 15000,
        lastUpdated: Date.now(),
      });

      // Schedule next timeout for hand 2
      await ctx.scheduler.runAfter(15000, internal.blackjack.turnTimeout, {
        tableId,
        seatIndex,
        roundNumber,
      });
    } else {
      // Standard stand (either not split, or already on split hand 2)
      const updatedSeat = { ...seat };
      if (isSplit && seat.activeHandIndex === 1) {
        updatedSeat.splitStatus = "stood";
        updatedSeat.lastAction = "스탠드(시간초과)";
      } else {
        updatedSeat.status = "stood";
        updatedSeat.lastAction = "스탠드(시간초과)";
      }
      updatedSeats[seatIndex] = updatedSeat;

      const val = isSplit ? getHandValue(seat.splitCards!) : getHandValue(seat.cards);
      const suffix = isSplit ? " (스플릿 핸드)" : "";
      const newHistory = [...table.history, `${seat.nickname}님이 시간 초과로 ${val}점${suffix}에서 자동 스탠드되었습니다.`].slice(-15);

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        history: newHistory,
        lastUpdated: Date.now(),
      });

      await ctx.scheduler.runAfter(0, internal.blackjack.advanceTurnAsync, {
        tableId,
        roundNumber,
      });
    }
  },
});

// Dealer plays card hands automatically according to casino regulations
export const dealerPlay = internalMutation({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, { tableId, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "dealer_turn" || table.roundNumber !== roundNumber) return;

    const dealerHand = { ...table.dealer };
    // Reveal second card & add its value to running count!
    let revealedCount = 0;
    dealerHand.cards = dealerHand.cards.map(c => {
      if (c.hidden) {
        revealedCount += getCardCountValue(c);
        return { ...c, hidden: false };
      }
      return c;
    });
    const newRunningCount = (table.runningCount ?? 0) + revealedCount;
    
    const newHistory = [...table.history, "딜러가 홀 카드를 공개합니다..."];

    // Check if dealer needs to draw
    // If all active players busted, dealer stands immediately without drawing cards
    const activeSeats = table.seats.filter(s => s.userId !== null && s.bet > 0);
    
    // Check bust status for both main and split hand if present
    const allBusted = activeSeats.every(s => {
      const mainBust = s.status === "busted";
      const splitBust = s.splitCards ? (s.splitStatus === "busted") : true;
      return mainBust && splitBust;
    });

    if (allBusted) {
      newHistory.push("모든 플레이어가 버스트되었습니다. 딜러가 스탠드합니다.");
      dealerHand.status = "stood";
      
      await ctx.db.patch(tableId, {
        dealer: dealerHand,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
        runningCount: newRunningCount,
      });

      // Schedule settlement
      await ctx.scheduler.runAfter(2000, internal.blackjack.settleRound, {
        tableId,
        roundNumber,
      });
      return;
    }

    const dealerScore = getHandValue(dealerHand.cards);
    newHistory.push(`딜러 카드 합계: ${dealerScore}`);

    await ctx.db.patch(tableId, {
      dealer: dealerHand,
      history: newHistory.slice(-15),
      lastUpdated: Date.now(),
      runningCount: newRunningCount,
    });

    if (dealerScore < 17) {
      // Schedule sequential delayed hits
      await ctx.scheduler.runAfter(1200, internal.blackjack.dealerHitLoop, {
        tableId,
        roundNumber,
      });
    } else {
      dealerHand.status = "stood";
      await ctx.db.patch(tableId, {
        dealer: dealerHand,
        lastUpdated: Date.now(),
        runningCount: newRunningCount,
      });
      await ctx.scheduler.runAfter(2000, internal.blackjack.settleRound, {
        tableId,
        roundNumber,
      });
    }
  },
});

// Dealer delayed sequential hitting loop
export const dealerHitLoop = internalMutation({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, { tableId, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "dealer_turn" || table.roundNumber !== roundNumber) return;

    const dealerHand = { ...table.dealer };
    let updatedDeck = [...table.deck];
    const newHistory = [...table.history];
    let runningCount = table.runningCount ?? 0;

    const dealerScore = getHandValue(dealerHand.cards);

    if (dealerScore < 17) {
      // Draw card (safe threshold check for 3-deck shoe)
      if (updatedDeck.length < 15) {
        updatedDeck = createDeck();
        newHistory.push("카드 슈에 카드가 부족하여 새로 셔플했습니다!");
        runningCount = 0;
      }
      const drawn = updatedDeck.pop()!;
      runningCount += getCardCountValue(drawn);
      dealerHand.cards.push(drawn);
      
      const newScore = getHandValue(dealerHand.cards);
      let logMsg = `딜러가 ${drawn.value}${drawn.suit} 카드를 드로우했습니다 (합계: ${newScore})`;
      
      if (newScore > 21) {
        dealerHand.status = "busted";
        logMsg += " (버스트!)";
      } else if (newScore >= 17) {
        dealerHand.status = "stood";
        logMsg += " (스탠드)";
      }

      newHistory.push(logMsg);

      await ctx.db.patch(tableId, {
        dealer: dealerHand,
        deck: updatedDeck,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
        runningCount,
      });

      if (newScore < 17) {
        // Schedule next hit
        await ctx.scheduler.runAfter(1200, internal.blackjack.dealerHitLoop, {
          tableId,
          roundNumber,
        });
      } else {
        // Dealer is done, schedule settlement
        await ctx.scheduler.runAfter(2000, internal.blackjack.settleRound, {
          tableId,
          roundNumber,
        });
      }
    } else {
      // Just in case dealer is already 17+, settle
      await ctx.scheduler.runAfter(0, internal.blackjack.settleRound, {
        tableId,
        roundNumber,
      });
    }
  },
});

// Helper to calculate payout and log string for a single hand
function calculateHandPayout(
  handCards: Card[],
  handStatus: string,
  handBet: number,
  dealerCards: Card[],
  dealerStatus: string
): { payout: number; outcome: string } {
  const userScore = getHandValue(handCards);
  const dealerScore = getHandValue(dealerCards);
  let payout = 0;
  let outcome = "";

  if (handStatus === "busted") {
    payout = 0;
    outcome = "패배 (버스트)";
  } else if (dealerStatus === "busted") {
    if (handStatus === "blackjack") {
      payout = Math.floor(handBet * 2.5); // Natural Blackjack pays 3:2
      outcome = "블랙잭 승리! (+$" + (payout - handBet) + ")";
    } else {
      payout = handBet * 2; // Standard Win pays 1:1
      outcome = "승리 (+$" + (payout - handBet) + ")";
    }
  } else {
    // Compare values
    if (handStatus === "blackjack" && dealerStatus !== "blackjack") {
      payout = Math.floor(handBet * 2.5);
      outcome = "블랙잭 승리! (+$" + (payout - handBet) + ")";
    } else if (userScore > dealerScore) {
      payout = handBet * 2;
      outcome = "승리 (+$" + (payout - handBet) + ")";
    } else if (userScore < dealerScore) {
      payout = 0;
      outcome = "패배 (-$" + handBet + ")";
    } else {
      // Tie score
      if (handStatus === "blackjack" && dealerStatus === "blackjack") {
        payout = handBet; // Push
        outcome = "푸시 (양측 블랙잭)";
      } else if (handStatus !== "blackjack" && dealerStatus === "blackjack") {
        payout = 0; // Dealer blackjack beats 21
        outcome = "패배 (딜러 블랙잭)";
      } else {
        payout = handBet; // Standard Push
        outcome = "푸시";
      }
    }
  }
  return { payout, outcome };
}

// Settle active round payouts and schedule the next round
export const settleRound = internalMutation({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, { tableId, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "dealer_turn" || table.roundNumber !== roundNumber) return;

    const dealerStatus = table.dealer.status;

    const updatedSeats = [...table.seats];
    const newHistory = [...table.history, "=== Round Settlement ==="];

    for (let i = 0; i < 8; i++) {
      const seat = updatedSeats[i];
      if (seat.userId === null || seat.bet === 0) continue;

      let totalPayout = 0;
      let outcomeMsg = "";

      // 1. Settle main hand
      const mainResult = calculateHandPayout(seat.cards, seat.status, seat.bet, table.dealer.cards, dealerStatus);
      totalPayout += mainResult.payout;
      outcomeMsg += `메인: ${mainResult.outcome}`;

      // 2. Settle split hand if it exists
      const isSplit = seat.splitCards !== undefined && seat.splitCards.length > 0;
      if (isSplit && seat.splitBet) {
        const splitResult = calculateHandPayout(seat.splitCards!, seat.splitStatus || "stood", seat.splitBet, table.dealer.cards, dealerStatus);
        totalPayout += splitResult.payout;
        outcomeMsg += ` | 스플릿: ${splitResult.outcome}`;
      }

      // Add payout back to seat balance
      const newSeatBalance = seat.balance + totalPayout;
      const totalBet = seat.bet + (seat.splitBet || 0);

      let seatStatus = "lost";
      let lastActionText = "패배";
      if (totalPayout > totalBet) {
        seatStatus = "won";
        lastActionText = "승리";
      } else if (totalPayout === totalBet) {
        seatStatus = "push";
        lastActionText = "푸시";
      }

      updatedSeats[i] = {
        ...seat,
        balance: newSeatBalance,
        status: seatStatus,
        lastAction: lastActionText,
      };

      // Sync user profile balance
      await ctx.db.patch(seat.userId as any, { balance: newSeatBalance });

      newHistory.push(`${i+1}번 자리 (${seat.nickname}) - ${outcomeMsg}`);
    }

    // Increment round number and schedule next round betting in 3 seconds review time
    const nextRound = table.roundNumber + 1;
    
    await ctx.db.patch(tableId, {
      seats: updatedSeats,
      history: newHistory.slice(-15),
      status: "round_over",
      timer: Date.now() + 3000,
      lastUpdated: Date.now(),
    });

    await ctx.scheduler.runAfter(3000, internal.blackjack.prepareNextRound, {
      tableId,
      roundNumber: nextRound,
    });
  },
});

// Prepare the seats for the next round (called after settlement countdown)
export const prepareNextRound = internalMutation({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, { tableId, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table) return;

    const updatedSeats = [...table.seats];

    // Reset bets, cards and actions for all seated players.
    // If a player has $0 balance, they are automatically stood up (kicked from seat).
    const newHistory = [...table.history, "다음 라운드를 시작합니다... 베팅해주세요!"];

    for (let i = 0; i < 8; i++) {
      const seat = updatedSeats[i];
      if (seat.userId === null) continue;

      if (seat.balance <= 0) {
        newHistory.push(`${seat.nickname}님이 자금 부족으로 강제 퇴장되었습니다!`);
        updatedSeats[i] = {
          userId: null,
          nickname: null,
          balance: 0,
          bet: 0,
          cards: [],
          status: "idle",
          lastAction: "퇴장당함",
        };
      } else {
        updatedSeats[i] = {
          ...seat,
          bet: 0,
          cards: [],
          status: "idle",
          lastAction: "",
          splitCards: undefined,
          splitBet: undefined,
          splitStatus: undefined,
          activeHandIndex: undefined,
        };
      }
    }

    const activePlayers = updatedSeats.filter(s => s.userId !== null);

    if (activePlayers.length === 0) {
      await ctx.db.delete(tableId);
      return;
    } else {
      // Transition to next betting phase (no timer)
      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        dealer: { cards: [], status: "playing" },
        status: "betting",
        activeSeatIndex: -1,
        timer: undefined,
        roundNumber,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
      });
    }
  },
});
