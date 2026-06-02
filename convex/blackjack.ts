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
  
  // Use 6 decks for standard casino rules
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

// Queries

// List all active Blackjack tables (and auto-create one if none exist)
export const listTables = query({
  args: {},
  handler: async (ctx) => {
    let tables = await ctx.db.query("tables").collect();
    
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
    const existing = await ctx.db.query("tables").first();
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
      history: ["Table created. Welcome to Blackjack!"],
      lastUpdated: Date.now(),
    });

    return tableId;
  },
});

// Create custom Blackjack table lobby
export const createTable = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 25) {
      throw new Error("Table name must be between 2 and 25 characters.");
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
      history: [`Table "${trimmed}" created by player.`],
      lastUpdated: Date.now(),
      hostId: userId,
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
    if (userId === null) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user || !user.isOnboarded) throw new Error("Complete onboarding first");

    const table = await ctx.db.get(tableId);
    if (!table) throw new Error("Table not found");

    if (seatIndex < 0 || seatIndex >= 8) throw new Error("Invalid seat selection");
    if (table.seats[seatIndex].userId !== null) throw new Error("Seat is already taken");

    // Check if player is already seated at another seat
    const alreadySeated = table.seats.some(s => s.userId === userId);
    if (alreadySeated) throw new Error("You are already seated at this table");

    // Copy player info to seat
    const updatedSeats = [...table.seats];
    updatedSeats[seatIndex] = {
      userId,
      nickname: user.nickname ?? "Anonymous Player",
      balance: user.balance ?? 3000,
      bet: 0,
      cards: [],
      status: "idle",
      lastAction: "join",
    };

    const newHistory = [...table.history, `${user.nickname} sat down at Seat ${seatIndex + 1}`].slice(-15);

    let newStatus = table.status;
    let newTimer = table.timer;

    // If table was waiting (empty) and we now have a player, transition to betting phase
    if (table.status === "waiting") {
      newStatus = "betting";
      newTimer = Date.now() + 15000; // 15 seconds to place bet
      
      // Schedule timeout to deal cards
      await ctx.scheduler.runAfter(15000, internal.blackjack.endBettingTimeout, {
        tableId,
        roundNumber: table.roundNumber,
      });
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
    if (userId === null) throw new Error("Not authenticated");

    const table = await ctx.db.get(tableId);
    if (!table) throw new Error("Table not found");

    const seat = table.seats[seatIndex];
    if (seat.userId !== userId) throw new Error("You are not sitting in this seat");

    // Refund bet if in betting phase, otherwise they forfeit the active bet
    const updatedSeats = [...table.seats];
    updatedSeats[seatIndex] = {
      userId: null,
      nickname: null,
      balance: 0,
      bet: 0,
      cards: [],
      status: "idle",
      lastAction: "leave",
    };

    // Return any remaining balance to the user's permanent record
    const user = await ctx.db.get(userId);
    if (user && seat.balance !== user.balance) {
      await ctx.db.patch(userId, { balance: seat.balance });
    }

    const newHistory = [...table.history, `${seat.nickname} left Seat ${seatIndex + 1}`].slice(-15);

    // Check if table is empty now
    const activePlayers = updatedSeats.filter(s => s.userId !== null);
    
    if (activePlayers.length === 0 && table.hostId) {
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
        lastAction: "leave",
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
      
      if (activePlayers.length === 0 && table.hostId) {
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
      const newHistory = [...(table.history ?? []), `${nickname} left the table.`].slice(-15);

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
    if (userId === null) throw new Error("Not authenticated");

    const table = await ctx.db.get(tableId);
    if (!table) throw new Error("Table not found");

    if (table.status !== "betting") throw new Error("Bets can only be placed during the betting phase");
    
    const seat = table.seats[seatIndex];
    if (seat.userId !== userId) throw new Error("You are not sitting in this seat");
    if (amount <= 0) throw new Error("Bet amount must be positive");
    if (amount > seat.balance) throw new Error("Insufficient balance");

    const updatedSeats = [...table.seats];
    const newSeatBalance = seat.balance - amount;
    
    updatedSeats[seatIndex] = {
      ...seat,
      bet: amount,
      balance: newSeatBalance,
      status: "betting",
      lastAction: `bet $${amount}`,
    };

    // Sync balance immediately to user record
    await ctx.db.patch(userId, { balance: newSeatBalance });

    const newHistory = [...table.history, `${seat.nickname} bet $${amount}`].slice(-15);

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
    if (userId === null) throw new Error("Not authenticated");

    const table = await ctx.db.get(tableId);
    if (!table) throw new Error("Table not found");

    if (table.status !== "playing") throw new Error("Game is not in active playing phase");
    if (table.activeSeatIndex !== seatIndex) throw new Error("It is not your turn");

    const seat = table.seats[seatIndex];
    if (seat.userId !== userId) throw new Error("You are not sitting in this seat");

    const updatedSeats = [...table.seats];
    let updatedDeck = [...table.deck];
    const newHistory = [...table.history];

    // Ensure we have enough cards in shoe (reshuffle if running low)
    if (updatedDeck.length < 52) {
      updatedDeck = createDeck();
      newHistory.push("Shoe running low. Deck reshuffled!");
    }

    if (action === "hit") {
      const drawnCard = updatedDeck.pop()!;
      const newCards = [...seat.cards, drawnCard];
      const newScore = getHandValue(newCards);
      
      let newStatus = "playing";
      let nextStep = false;
      let logMsg = `${seat.nickname} hits and receives ${drawnCard.value}${drawnCard.suit}`;

      if (newScore > 21) {
        newStatus = "busted";
        logMsg += " (Bust!)";
        nextStep = true;
      } else if (newScore === 21) {
        newStatus = "stood";
        logMsg += " (21!)";
        nextStep = true;
      }

      updatedSeats[seatIndex] = {
        ...seat,
        cards: newCards,
        status: newStatus,
        lastAction: "hit",
      };

      newHistory.push(logMsg);

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        deck: updatedDeck,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
      });

      if (nextStep) {
        await ctx.scheduler.runAfter(0, internal.blackjack.advanceTurnAsync, {
          tableId,
          roundNumber: table.roundNumber,
        });
      } else {
        // Reset turn timer (15 seconds) for same player
        await ctx.db.patch(tableId, {
          timer: Date.now() + 15000,
          lastUpdated: Date.now(),
        });
      }

    } else if (action === "stand") {
      updatedSeats[seatIndex] = {
        ...seat,
        status: "stood",
        lastAction: "stand",
      };

      newHistory.push(`${seat.nickname} stands on ${getHandValue(seat.cards)}`);

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
      });

      await ctx.scheduler.runAfter(0, internal.blackjack.advanceTurnAsync, {
        tableId,
        roundNumber: table.roundNumber,
      });

    } else if (action === "double") {
      if (seat.cards.length !== 2) throw new Error("Double down is only allowed on the initial two cards");
      if (seat.balance < seat.bet) throw new Error("Insufficient chips to double bet");

      // Deduct another bet amount
      const extraBet = seat.bet;
      const newBalance = seat.balance - extraBet;
      const newBet = seat.bet * 2;

      await ctx.db.patch(userId, { balance: newBalance });

      const drawnCard = updatedDeck.pop()!;
      const newCards = [...seat.cards, drawnCard];
      const newScore = getHandValue(newCards);
      const newStatus = newScore > 21 ? "busted" : "stood";

      updatedSeats[seatIndex] = {
        ...seat,
        bet: newBet,
        balance: newBalance,
        cards: newCards,
        status: newStatus,
        lastAction: "double",
      };

      let logMsg = `${seat.nickname} doubles down to $${newBet}, draws ${drawnCard.value}${drawnCard.suit}`;
      if (newScore > 21) logMsg += " (Bust!)";

      newHistory.push(logMsg);

      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        deck: updatedDeck,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
      });

      await ctx.scheduler.runAfter(0, internal.blackjack.advanceTurnAsync, {
        tableId,
        roundNumber: table.roundNumber,
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
    const newHistory = [...table.history, "Dealing starting hands..."];

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
      newHistory.push("No bets placed. Waiting for players...");
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
    const draw = () => {
      if (updatedDeck.length < 10) {
        updatedDeck = createDeck();
      }
      return updatedDeck.pop()!;
    };

    // Deal Card 1
    for (const idx of bettingSeatsIndices) {
      updatedSeats[idx].cards.push(draw());
    }
    const dealerFirstCard = draw();
    
    // Deal Card 2
    for (const idx of bettingSeatsIndices) {
      updatedSeats[idx].cards.push(draw());
    }
    const dealerSecondCard = { ...draw(), hidden: true };

    const dealerHand = {
      cards: [dealerFirstCard, dealerSecondCard],
      status: "playing",
    };

    // Check for natural blackjacks
    for (const idx of bettingSeatsIndices) {
      const val = getHandValue(updatedSeats[idx].cards);
      if (val === 21) {
        updatedSeats[idx].status = "blackjack";
        newHistory.push(`${updatedSeats[idx].nickname} has Natural Blackjack!`);
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
        newHistory.push("Dealer has Blackjack!");
        immediateSettle = true;
      }
    }

    if (immediateSettle) {
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
    
    updatedSeats[seatIndex] = {
      ...seat,
      status: "stood",
      lastAction: "stand (timeout)",
    };

    const newHistory = [...table.history, `${seat.nickname} timed out and automatically stood on ${getHandValue(seat.cards)}`].slice(-15);

    await ctx.db.patch(tableId, {
      seats: updatedSeats,
      history: newHistory,
      lastUpdated: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.blackjack.advanceTurnAsync, {
      tableId,
      roundNumber,
    });
  },
});

// Dealer plays card hands automatically according to casino regulations
export const dealerPlay = internalMutation({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, { tableId, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "dealer_turn" || table.roundNumber !== roundNumber) return;

    const dealerHand = { ...table.dealer };
    // Reveal second card
    dealerHand.cards = dealerHand.cards.map(c => ({ ...c, hidden: false }));
    
    let updatedDeck = [...table.deck];
    const newHistory = [...table.history, "Dealer reveals hole card..."];

    // Check if dealer needs to draw
    // If all active players busted, dealer stands immediately without drawing cards
    const activeSeats = table.seats.filter(s => s.userId !== null && s.bet > 0);
    const allBusted = activeSeats.every(s => s.status === "busted");

    if (allBusted) {
      newHistory.push("All players busted. Dealer stands.");
      dealerHand.status = "stood";
    } else {
      let dealerScore = getHandValue(dealerHand.cards);
      newHistory.push(`Dealer shows ${dealerScore}`);

      // Dealer hits soft/hard 17 limits: Draw card if under 17
      while (dealerScore < 17) {
        if (updatedDeck.length < 5) {
          updatedDeck = createDeck();
        }
        const drawn = updatedDeck.pop()!;
        dealerHand.cards.push(drawn);
        dealerScore = getHandValue(dealerHand.cards);
        newHistory.push(`Dealer draws ${drawn.value}${drawn.suit} and shows ${dealerScore}`);
      }

      if (dealerScore > 21) {
        dealerHand.status = "busted";
        newHistory.push("Dealer busts!");
      } else {
        dealerHand.status = "stood";
        newHistory.push(`Dealer stands on ${dealerScore}`);
      }
    }

    await ctx.db.patch(tableId, {
      dealer: dealerHand,
      deck: updatedDeck,
      history: newHistory.slice(-15),
      lastUpdated: Date.now(),
    });

    // Schedule settlement
    await ctx.scheduler.runAfter(2000, internal.blackjack.settleRound, {
      tableId,
      roundNumber,
    });
  },
});

// Settle active round payouts and schedule the next round
export const settleRound = internalMutation({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, { tableId, roundNumber }) => {
    const table = await ctx.db.get(tableId);
    if (!table || table.status !== "dealer_turn" || table.roundNumber !== roundNumber) return;

    const dealerScore = getHandValue(table.dealer.cards);
    const dealerStatus = table.dealer.status;

    const updatedSeats = [...table.seats];
    const newHistory = [...table.history, "=== Round Settlement ==="];

    for (let i = 0; i < 8; i++) {
      const seat = updatedSeats[i];
      if (seat.userId === null || seat.bet === 0) continue;

      const userScore = getHandValue(seat.cards);
      let payout = 0;
      let outcome = "";

      if (seat.status === "busted") {
        payout = 0;
        outcome = "lost (Bust)";
      } else if (dealerStatus === "busted") {
        if (seat.status === "blackjack") {
          payout = Math.floor(seat.bet * 2.5); // Natural Blackjack pays 3:2
          outcome = "won with Blackjack! ($" + (payout - seat.bet) + ")";
        } else {
          payout = seat.bet * 2; // Standard Win pays 1:1
          outcome = "won ($" + (payout - seat.bet) + ")";
        }
      } else {
        // Compare values
        if (seat.status === "blackjack" && dealerStatus !== "blackjack") {
          payout = Math.floor(seat.bet * 2.5);
          outcome = "won with Blackjack! ($" + (payout - seat.bet) + ")";
        } else if (userScore > dealerScore) {
          payout = seat.bet * 2;
          outcome = "won ($" + (payout - seat.bet) + ")";
        } else if (userScore < dealerScore) {
          payout = 0;
          outcome = "lost ($" + seat.bet + ")";
        } else {
          // Tie score
          if (seat.status === "blackjack" && dealerStatus === "blackjack") {
            payout = seat.bet; // Push
            outcome = "pushed (Both Blackjack)";
          } else if (seat.status !== "blackjack" && dealerStatus === "blackjack") {
            payout = 0; // Dealer blackjack beats 21
            outcome = "lost (Dealer Blackjack)";
          } else {
            payout = seat.bet; // Standard Push
            outcome = "pushed";
          }
        }
      }

      // Add payout back to seat balance
      const newSeatBalance = seat.balance + payout;
      updatedSeats[i] = {
        ...seat,
        balance: newSeatBalance,
        status: payout > seat.bet ? "won" : (payout === seat.bet ? "push" : "lost"),
        lastAction: payout > seat.bet ? "Win" : (payout === seat.bet ? "Push" : "Loss"),
      };

      // Sync user profile balance
      await ctx.db.patch(seat.userId as any, { balance: newSeatBalance });

      newHistory.push(`Seat ${i+1} (${seat.nickname}) ${outcome}`);
    }

    // Increment round number and schedule next round betting in 8 seconds
    const nextRound = table.roundNumber + 1;
    
    await ctx.db.patch(tableId, {
      seats: updatedSeats,
      history: newHistory.slice(-15),
      status: "round_over",
      timer: Date.now() + 3000, // 3 seconds review time
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
    const newHistory = [...table.history, "Starting next round... Place your bets!"];

    for (let i = 0; i < 8; i++) {
      const seat = updatedSeats[i];
      if (seat.userId === null) continue;

      if (seat.balance <= 0) {
        newHistory.push(`${seat.nickname} was stood up (Out of money!)`);
        updatedSeats[i] = {
          userId: null,
          nickname: null,
          balance: 0,
          bet: 0,
          cards: [],
          status: "idle",
          lastAction: "kicked",
        };
      } else {
        updatedSeats[i] = {
          ...seat,
          bet: 0,
          cards: [],
          status: "idle",
          lastAction: "",
        };
      }
    }

    const activePlayers = updatedSeats.filter(s => s.userId !== null);

    if (activePlayers.length === 0) {
      if (table.hostId) {
        await ctx.db.delete(tableId);
        return;
      }
      // Go back to waiting if all players left or got kicked
      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        dealer: { cards: [], status: "playing" },
        status: "waiting",
        activeSeatIndex: -1,
        timer: undefined,
        roundNumber,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
      });
    } else {
      // Transition to next betting phase
      await ctx.db.patch(tableId, {
        seats: updatedSeats,
        dealer: { cards: [], status: "playing" },
        status: "betting",
        activeSeatIndex: -1,
        timer: Date.now() + 15000, // 15 seconds to bet
        roundNumber,
        history: newHistory.slice(-15),
        lastUpdated: Date.now(),
      });

      // Schedule end betting timeout
      await ctx.scheduler.runAfter(15000, internal.blackjack.endBettingTimeout, {
        tableId,
        roundNumber,
      });
    }
  },
});
