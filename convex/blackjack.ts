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
  
// Use 6 decks as requested
  for (let i = 0; i < 6; i++) {
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

    const seats = Array.from({ length: 12 }, () => ({
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

    const seats = Array.from({ length: 12 }, () => ({
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

    if (seatIndex < 0 || seatIndex >= 12) throw new Error("유효하지 않은 자리 선택입니다.");
    if (table.seats[seatIndex].userId !== null) throw new Error("이미 다른 플레이어가 앉아있는 자리입니다.");

    // Check if player is already seated at 3 or more seats
    const userSeatsCount = table.seats.filter(s => s.userId === userId).length;
    if (userSeatsCount >= 3) {
      throw new Error("한 테이블에서 최대 3자리까지 착석 가능합니다.");
    }

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
      joinTime: Date.now(),
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

    let updatedSeats = [...table.seats];
    const userSeatsIndices: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (updatedSeats[i].userId === userId) {
        userSeatsIndices.push(i);
      }
    }

    const wasSeated = userSeatsIndices.length > 0;

    // If seated, handle leaving all seats (refunding/forfeiting bets, syncing balance)
    if (wasSeated) {
      const seat = table.seats[userSeatsIndices[0]];
      const user = await ctx.db.get(userId);
      if (user && seat.balance !== user.balance) {
        await ctx.db.patch(userId, { balance: seat.balance });
      }

      for (const idx of userSeatsIndices) {
        updatedSeats[idx] = {
          userId: null,
          nickname: null,
          balance: 0,
          bet: 0,
          cards: [],
          status: "idle",
          lastAction: "퇴장",
        };
      }

      // If they left during their active turn, advance the turn asynchronously
      if (table.status === "playing" && userSeatsIndices.includes(table.activeSeatIndex)) {
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
    if (wasSeated) {
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

      const nickname = table.seats[userSeatsIndices[0]]?.nickname ?? "Player";
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
  args: {
    tableId: v.id("tables"),
    seatIndex: v.number(),
    amount: v.number(),
    sideBetPerfectPairs: v.optional(v.number()),
    sideBet213: v.optional(v.number()),
  },
  handler: async (ctx, { tableId, seatIndex, amount, sideBetPerfectPairs = 0, sideBet213 = 0 }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("로그인이 필요합니다.");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const table = await ctx.db.get(tableId);
    if (!table) throw new Error("테이블을 찾을 수 없습니다.");

    if (table.status !== "betting") throw new Error("베팅은 배팅 단계에서만 가능합니다.");
    
    const seat = table.seats[seatIndex];
    if (seat.userId !== userId) throw new Error("이 자리에 앉아 있지 않습니다.");
    if (amount <= 0) throw new Error("베팅 금액은 0보다 커야 합니다.");

    const latestBalance = user.balance ?? 3000;
    const totalWager = amount + sideBetPerfectPairs + sideBet213;
    if (totalWager > latestBalance) throw new Error("잔액이 부족합니다.");

    const updatedSeats = [...table.seats];
    const newSeatBalance = latestBalance - totalWager;
    
    updatedSeats[seatIndex] = {
      ...seat,
      bet: amount,
      balance: newSeatBalance,
      sideBetPerfectPairs: sideBetPerfectPairs,
      sideBet213: sideBet213,
      sideBetPerfectPairsStatus: sideBetPerfectPairs > 0 ? "none" : undefined,
      sideBet213Status: sideBet213 > 0 ? "none" : undefined,
      status: "betting",
      lastAction: `배팅 $${amount}`,
    };

    // Synchronize balance across all seats of this user
    for (let i = 0; i < 12; i++) {
      if (updatedSeats[i].userId === userId) {
        updatedSeats[i].balance = newSeatBalance;
      }
    }

    // Sync balance immediately to user record
    await ctx.db.patch(userId, { balance: newSeatBalance });

    let betDetailsMsg = `${seat.nickname}님이 $${amount}를 배팅했습니다.`;
    if (sideBetPerfectPairs > 0 || sideBet213 > 0) {
      betDetailsMsg += ` (사이드: PP $${sideBetPerfectPairs}, 21+3 $${sideBet213})`;
    }
    const newHistory = [...table.history, betDetailsMsg].slice(-15);

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

      // Sync balance across all seats of this user
      for (let i = 0; i < 12; i++) {
        if (updatedSeats[i].userId === userId) {
          updatedSeats[i].balance = newBalance;
        }
      }

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

      // Sync balance across all seats of this user
      for (let i = 0; i < 12; i++) {
        if (updatedSeats[i].userId === userId) {
          updatedSeats[i].balance = newBalance;
        }
      }

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

// Helper function to check dealer blackjack and settle round or start play phase
async function checkDealerBlackjack(ctx: any, tableId: any, seats: any[], history: string[]) {
  const table = await ctx.db.get(tableId);
  if (!table) return;

  const dealerCards = table.dealer.cards;
  const isDealerBlackjack = getHandValue(dealerCards) === 21;

  if (isDealerBlackjack) {
    history.push("딜러가 블랙잭을 오픈했습니다!");
    
    // Reveal dealer's hole card immediately
    const revealedCards = dealerCards.map((c: any) => ({ ...c, hidden: false }));
    
    await ctx.db.patch(tableId, {
      seats,
      dealer: {
        cards: revealedCards,
        status: "blackjack"
      },
      status: "dealer_turn",
      timer: undefined,
      history: history.slice(-15),
      lastUpdated: Date.now(),
    });

    await ctx.scheduler.runAfter(3000, internal.blackjack.settleRound, {
      tableId,
      roundNumber: table.roundNumber,
    });
  } else {
    history.push("딜러가 블랙잭이 아닙니다. 일반 게임을 계속합니다.");
    
    // Mark insuranceStatus as "lost" for players who bought it
    const updatedSeats = seats.map((s: any) => {
      if (s.insuranceStatus === "bought") {
        return { ...s, insuranceStatus: "lost" };
      }
      return s;
    });

    // Start play phase
    const activeSeats = [];
    for (let i = 0; i < 12; i++) {
      if (updatedSeats[i].userId !== null && updatedSeats[i].bet > 0 && updatedSeats[i].status === "playing") {
        activeSeats.push({ index: i, joinTime: updatedSeats[i].joinTime ?? 0 });
      }
    }
    activeSeats.sort((a, b) => a.joinTime - b.joinTime);
    const actionOrder = activeSeats.map(s => s.index);
    let firstPlayerIdx = actionOrder.length > 0 ? actionOrder[0] : -1;

    if (firstPlayerIdx === -1) {
      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        status: "dealer_turn",
        activeSeatIndex: -1,
        timer: undefined,
        history: history.slice(-15),
        lastUpdated: Date.now(),
      });

      await ctx.scheduler.runAfter(3000, internal.blackjack.settleRound, {
        tableId,
        roundNumber: table.roundNumber,
      });
    } else {
      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        status: "playing",
        activeSeatIndex: firstPlayerIdx,
        actionOrder,
        actionOrderIndex: 0,
        timer: Date.now() + 15000,
        history: history.slice(-15),
        lastUpdated: Date.now(),
      });

      await ctx.scheduler.runAfter(15000, internal.blackjack.turnTimeout, {
        tableId,
        seatIndex: firstPlayerIdx,
        roundNumber: table.roundNumber,
      });
    }
  }
}

// User makes an insurance bet decision
export const setInsuranceChoice = mutation({
  args: { tableId: v.id("tables"), seatIndex: v.number(), buy: v.boolean() },
  handler: async (ctx, { tableId, seatIndex, buy }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("로그인이 필요합니다.");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "insurance") throw new Error("현재 인셔런스 단계가 아닙니다.");

    const seat = table.seats[seatIndex];
    if (seat.userId !== userId) throw new Error("본인의 자리가 아닙니다.");
    if (seat.insuranceStatus && seat.insuranceStatus !== "none") throw new Error("이미 인셔런스 선택을 완료했습니다.");

    const updatedSeats = [...table.seats];
    const newHistory = [...table.history];

    if (buy) {
      const insuranceCost = Math.floor(seat.bet / 2);
      const latestBalance = user.balance ?? 3000;
      if (latestBalance < insuranceCost) {
        throw new Error("인셔런스를 구매할 칩이 부족합니다.");
      }
      
      const newSeatBalance = latestBalance - insuranceCost;
      await ctx.db.patch(userId, { balance: newSeatBalance });

      updatedSeats[seatIndex] = {
        ...seat,
        balance: newSeatBalance,
        insuranceBet: insuranceCost,
        insuranceStatus: "bought",
        lastAction: "보험 구매",
      };
      newHistory.push(`${seat.nickname}님이 인셔런스를 구매했습니다 ($${insuranceCost}).`);
    } else {
      updatedSeats[seatIndex] = {
        ...seat,
        insuranceStatus: "declined",
        lastAction: "보험 거절",
      };
      newHistory.push(`${seat.nickname}님이 인셔런스를 거절했습니다.`);
    }

    // Sync balance across all seats of this user
    for (let i = 0; i < 12; i++) {
      if (updatedSeats[i].userId === userId) {
        updatedSeats[i].balance = updatedSeats[seatIndex].balance;
      }
    }

    const pendingInsurance = updatedSeats.some(s => s.userId !== null && s.bet > 0 && (!s.insuranceStatus || s.insuranceStatus === "none"));

    if (!pendingInsurance) {
      await checkDealerBlackjack(ctx, tableId, updatedSeats, newHistory);
    } else {
      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
      });
    }
  }
});

// End insurance choice timeout
export const endInsuranceTimeout = internalMutation({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, { tableId, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "insurance" || table.roundNumber !== roundNumber) return;

    const updatedSeats = [...table.seats];
    const newHistory = [...table.history];

    let autoDeclined = false;
    for (let i = 0; i < 12; i++) {
      const seat = updatedSeats[i];
      if (seat.userId !== null && seat.bet > 0 && (!seat.insuranceStatus || seat.insuranceStatus === "none")) {
        updatedSeats[i] = {
          ...seat,
          insuranceStatus: "declined",
          lastAction: "보험 거절",
        };
        autoDeclined = true;
      }
    }

    if (autoDeclined) {
      newHistory.push("선택 시간이 초과되어 남은 플레이어들의 인셔런스가 자동으로 거절되었습니다.");
    }

    await checkDealerBlackjack(ctx, tableId, updatedSeats, newHistory);
  }
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
    for (let i = 0; i < 12; i++) {
      const s = updatedSeats[i];
      if (s.userId !== null && s.bet > 0) {
        bettingSeatsIndices.push(i);
        updatedSeats[i] = {
          ...s,
          cards: [],
          status: "playing",
          insuranceBet: 0,
          insuranceStatus: "none",
          sideBetPerfectPairsStatus: s.sideBetPerfectPairs && s.sideBetPerfectPairs > 0 ? "none" : undefined,
          sideBet213Status: s.sideBet213 && s.sideBet213 > 0 ? "none" : undefined,
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

    // Settle side bets!
    for (const idx of bettingSeatsIndices) {
      const seat = updatedSeats[idx];
      const playerFirstTwo = seat.cards;
      const dealerUp = dealerFirstCard;

      // 1. Perfect Pairs Settle
      if (seat.sideBetPerfectPairs && seat.sideBetPerfectPairs > 0) {
        const c1 = playerFirstTwo[0];
        const c2 = playerFirstTwo[1];
        let payout = 0;
        let sideStatus = "lost";
        let outcomeText = "";

        if (c1.value === c2.value) {
          const isRed = (s: string) => ["H", "D"].includes(s);
          if (c1.suit === c2.suit) {
            payout = seat.sideBetPerfectPairs * 25;
            sideStatus = "perfect_pair";
            outcomeText = "퍼펙트 페어 (25배)";
          } else if (isRed(c1.suit) === isRed(c2.suit)) {
            payout = seat.sideBetPerfectPairs * 12;
            sideStatus = "colored_pair";
            outcomeText = "컬러 페어 (12배)";
          } else {
            payout = seat.sideBetPerfectPairs * 6;
            sideStatus = "mixed_pair";
            outcomeText = "믹스드 페어 (6배)";
          }
        }

        const winAmount = payout;
        const newSeatBalance = seat.balance + winAmount;
        
        updatedSeats[idx] = {
          ...updatedSeats[idx],
          balance: newSeatBalance,
          sideBetPerfectPairsStatus: sideStatus,
          sideBetPerfectPairsWinAmount: winAmount,
        };

        // Sync global user wallet
        await ctx.db.patch(seat.userId as any, { balance: newSeatBalance });

        if (winAmount > 0) {
          newHistory.push(`${seat.nickname}님이 Perfect Pairs 성공: ${outcomeText} (+$${winAmount})!`);
        } else {
          newHistory.push(`${seat.nickname}님이 Perfect Pairs 사이드 배팅 패배.`);
        }
      }

      // 2. 21+3 Settle
      const currentSeat = updatedSeats[idx];
      if (currentSeat.sideBet213 && currentSeat.sideBet213 > 0) {
        const c1 = playerFirstTwo[0];
        const c2 = playerFirstTwo[1];
        const d1 = dealerUp;

        const cardValToInt = (val: string): number => {
          if (val === "A") return 14;
          if (val === "K") return 13;
          if (val === "Q") return 12;
          if (val === "J") return 11;
          return parseInt(val, 10);
        };

        const r1 = cardValToInt(c1.value);
        const r2 = cardValToInt(c2.value);
        const r3 = cardValToInt(d1.value);
        const sortedRanks = [r1, r2, r3].sort((x, y) => x - y);
        const suits = [c1.suit, c2.suit, d1.suit];

        const isSameSuit = suits[0] === suits[1] && suits[1] === suits[2];
        const isSameValue = c1.value === c2.value && c2.value === d1.value;

        // Straight check
        let isStraight = false;
        if (sortedRanks[1] - sortedRanks[0] === 1 && sortedRanks[2] - sortedRanks[1] === 1) {
          isStraight = true;
        } else if (sortedRanks[0] === 2 && sortedRanks[1] === 3 && sortedRanks[2] === 14) {
          isStraight = true;
        }

        let payout = 0;
        let sideStatus = "lost";
        let outcomeText = "";

        if (isSameValue && isSameSuit) {
          payout = currentSeat.sideBet213 * 100;
          sideStatus = "suited_trips";
          outcomeText = "수티드 트립스 (100배)";
        } else if (isStraight && isSameSuit) {
          payout = currentSeat.sideBet213 * 40;
          sideStatus = "straight_flush";
          outcomeText = "스트레이트 플러시 (40배)";
        } else if (isSameValue) {
          payout = currentSeat.sideBet213 * 30;
          sideStatus = "three_of_a_kind";
          outcomeText = "쓰리 오브 어 카인드 (30배)";
        } else if (isStraight) {
          payout = currentSeat.sideBet213 * 10;
          sideStatus = "straight";
          outcomeText = "스트레이트 (10배)";
        } else if (isSameSuit) {
          payout = currentSeat.sideBet213 * 5;
          sideStatus = "flush";
          outcomeText = "플러시 (5배)";
        }

        const winAmount = payout;
        const newSeatBalance = currentSeat.balance + winAmount;

        updatedSeats[idx] = {
          ...updatedSeats[idx],
          balance: newSeatBalance,
          sideBet213Status: sideStatus,
          sideBet213WinAmount: winAmount,
        };

        // Sync global user wallet
        await ctx.db.patch(currentSeat.userId as any, { balance: newSeatBalance });

        if (winAmount > 0) {
          newHistory.push(`${currentSeat.nickname}님이 21+3 성공: ${outcomeText} (+$${winAmount})!`);
        } else {
          newHistory.push(`${currentSeat.nickname}님이 21+3 사이드 배팅 패배.`);
        }
      }

      // Sync balance across all seats of this user
      for (let i = 0; i < 12; i++) {
        if (updatedSeats[i].userId === seat.userId) {
          updatedSeats[i].balance = updatedSeats[idx].balance;
        }
      }
    }

    // Check for natural blackjacks
    for (const idx of bettingSeatsIndices) {
      const val = getHandValue(updatedSeats[idx].cards);
      if (val === 21) {
        updatedSeats[idx].status = "blackjack";
        newHistory.push(`${updatedSeats[idx].nickname}님 내추럴 블랙잭 달성!`);
      }
    }

    // Check if dealer shows Ace -> Offer Insurance
    if (dealerFirstCard.value === "A") {
      for (const idx of bettingSeatsIndices) {
        updatedSeats[idx].insuranceStatus = "none";
        updatedSeats[idx].insuranceBet = 0;
      }

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        dealer: dealerHand,
        deck: updatedDeck,
        status: "insurance",
        timer: Date.now() + 15000,
        history: [...newHistory, "딜러의 오픈 카드가 에이스입니다. 인셔런스 베팅이 시작됩니다."].slice(-15),
        lastUpdated: Date.now(),
        runningCount,
      });

      await ctx.scheduler.runAfter(15000, internal.blackjack.endInsuranceTimeout, {
        tableId,
        roundNumber,
      });
      return;
    }

    // Check if dealer has immediate natural blackjack (Dealer has 10/J/Q/K showing)
    const isDealerTenShow = ["10", "J", "Q", "K"].includes(dealerFirstCard.value);
    let immediateSettle = false;
    
    if (isDealerTenShow) {
      const realDealerScore = getHandValue([dealerFirstCard, { ...dealerSecondCard, hidden: false }]);
      if (realDealerScore === 21) {
        dealerHand.cards[1].hidden = false;
        dealerHand.status = "blackjack";
        newHistory.push("딜러 블랙잭 달성!");
        immediateSettle = true;
      }
    }

    if (immediateSettle) {
      runningCount += getCardCountValue(dealerSecondCard);

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

      // 3 seconds review time for natural BJ reveal
      await ctx.scheduler.runAfter(3000, internal.blackjack.settleRound, {
        tableId,
        roundNumber,
      });
      return;
    }

    // Determine chronological active order based on seat joinTime
    const activeSeats = [];
    for (const idx of bettingSeatsIndices) {
      if (updatedSeats[idx].status === "playing") {
        activeSeats.push({ index: idx, joinTime: updatedSeats[idx].joinTime ?? 0 });
      }
    }
    // Sort chronological: earliest joinTime plays first
    activeSeats.sort((a, b) => a.joinTime - b.joinTime);
    const actionOrder = activeSeats.map(s => s.index);
    let firstPlayerIdx = actionOrder.length > 0 ? actionOrder[0] : -1;

    if (firstPlayerIdx === -1) {
      // Everyone had blackjack! Settle immediately
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

      await ctx.scheduler.runAfter(3000, internal.blackjack.settleRound, {
        tableId,
        roundNumber,
      });
    } else {
      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        dealer: dealerHand,
        deck: updatedDeck,
        status: "playing",
        activeSeatIndex: firstPlayerIdx,
        actionOrder,
        actionOrderIndex: 0,
        timer: Date.now() + 15000,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
        runningCount,
      });

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
    let nextActionOrderIndex = (table.actionOrderIndex ?? 0) + 1;
    const actionOrder = table.actionOrder ?? [];

    while (nextActionOrderIndex < actionOrder.length) {
      const seatIdx = actionOrder[nextActionOrderIndex];
      const seat = table.seats[seatIdx];
      if (seat.userId !== null && seat.status === "playing") {
        nextSeatIndex = seatIdx;
        break;
      }
      nextActionOrderIndex++;
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
        actionOrderIndex: nextActionOrderIndex,
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
    const newHistory = [...table.history, "=== 라운드 결과 정산 ==="];

    // Gather payouts per seat to support multi-seat synchronization cleanly
    const seatPayouts: number[] = Array(12).fill(0);
    const seatOutcomeMsgs: string[] = Array(12).fill("");
    const seatStatuses: string[] = Array(12).fill("lost");
    const seatLastActions: string[] = Array(12).fill("패배");

    for (let i = 0; i < 12; i++) {
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

      // 3. Settle insurance bet
      if (dealerStatus === "blackjack" && seat.insuranceStatus === "bought") {
        const insPayout = (seat.insuranceBet ?? 0) * 3;
        totalPayout += insPayout;
        outcomeMsg += ` | 인셔런스: 성공 (+$${insPayout - (seat.insuranceBet ?? 0)})`;
      }

      seatPayouts[i] = totalPayout;
      seatOutcomeMsgs[i] = outcomeMsg;

      const totalBet = seat.bet + (seat.splitBet || 0);
      if (totalPayout > totalBet) {
        seatStatuses[i] = "won";
        seatLastActions[i] = "승리";
      } else if (totalPayout === totalBet) {
        seatStatuses[i] = "push";
        seatLastActions[i] = "푸시";
      } else {
        seatStatuses[i] = "lost";
        seatLastActions[i] = "패배";
      }
    }

    // Sum payouts by user ID and update global user profiles
    const userPayoutSum: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const seat = updatedSeats[i];
      if (seat.userId === null || seat.bet === 0) continue;
      userPayoutSum[seat.userId] = (userPayoutSum[seat.userId] ?? 0) + seatPayouts[i];
    }

    const userNewBalances: Record<string, number> = {};
    for (const userId of Object.keys(userPayoutSum)) {
      const userDoc = (await ctx.db.get(userId as any)) as any;
      if (userDoc) {
        const currentBal = userDoc.balance ?? 3000;
        const payout = userPayoutSum[userId];
        const newBal = currentBal + payout;
        await ctx.db.patch(userId as any, { balance: newBal });
        userNewBalances[userId] = newBal;
      }
    }

    // Update seat records with outcomes and synced balances
    for (let i = 0; i < 12; i++) {
      const seat = updatedSeats[i];
      if (seat.userId === null) continue;

      const syncedBalance = userNewBalances[seat.userId] ?? (seat.userId ? (((await ctx.db.get(seat.userId as any)) as any)?.balance ?? seat.balance) : seat.balance);

      if (seat.bet > 0) {
        updatedSeats[i] = {
          ...seat,
          balance: syncedBalance,
          status: seatStatuses[i],
          lastAction: seatLastActions[i],
          insuranceStatus: (dealerStatus === "blackjack" && seat.insuranceStatus === "bought") ? "won" : seat.insuranceStatus,
        };
        newHistory.push(`${i+1}번 자리 (${seat.nickname}) - ${seatOutcomeMsgs[i]}`);
      } else {
        updatedSeats[i] = {
          ...seat,
          balance: syncedBalance,
        };
      }
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

    for (let i = 0; i < 12; i++) {
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
          insuranceBet: undefined,
          insuranceStatus: undefined,
          sideBetPerfectPairs: undefined,
          sideBet213: undefined,
          sideBetPerfectPairsStatus: undefined,
          sideBet213Status: undefined,
          sideBetPerfectPairsWinAmount: undefined,
          sideBet213WinAmount: undefined,
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
