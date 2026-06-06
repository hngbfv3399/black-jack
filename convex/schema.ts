import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

// Card definition
export const cardValidator = v.object({
  suit: v.string(), // 'H' (Hearts), 'D' (Diamonds), 'C' (Clubs), 'S' (Spades)
  value: v.string(), // '2'..'10', 'J', 'Q', 'K', 'A'
  hidden: v.optional(v.boolean()), // true if face down (dealer's second card)
});

// Player seat definition
export const seatValidator = v.object({
  userId: v.union(v.string(), v.null()), // User ID sitting here
  nickname: v.union(v.string(), v.null()), // Display name
  balance: v.number(), // Chips/money balance
  bet: v.number(), // Amount wagered in this round
  cards: v.array(cardValidator), // Player's hand
  status: v.string(), // 'idle', 'betting', 'playing', 'stood', 'busted', 'blackjack', 'won', 'lost', 'push'
  lastAction: v.optional(v.string()), // 'hit', 'stand', 'double', 'join', 'leave' (for visual tags)
  
  // Split hand properties
  splitCards: v.optional(v.array(cardValidator)),
  splitBet: v.optional(v.number()),
  splitStatus: v.optional(v.string()),
  activeHandIndex: v.optional(v.number()),
});

// Dealer hand definition
export const dealerValidator = v.object({
  cards: v.array(cardValidator),
  status: v.string(), // 'playing', 'stood', 'busted', 'blackjack'
});

export default defineSchema({
  ...authTables,

  // Extend the default users table defined by Convex Auth
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),

    // Custom properties
    nickname: v.optional(v.string()),
    balance: v.optional(v.number()), // default $3000
    isOnboarded: v.optional(v.boolean()), // default false
  })
    .index("by_nickname", ["nickname"])
    .index("email", ["email"])
    .index("by_onboarded_balance", ["isOnboarded", "balance"]),

  // Blackjack room tables
  tables: defineTable({
    name: v.string(), // Room Name
    status: v.string(), // 'waiting', 'betting', 'playing', 'dealer_turn', 'round_over'
    seats: v.array(seatValidator), // Exactly 8 seats (indices 0-7)
    dealer: dealerValidator,
    deck: v.array(cardValidator), // Pre-shuffled cards
    activeSeatIndex: v.number(), // Seat index of player currently acting
    roundNumber: v.number(), // Monotonically increasing round counter
    timer: v.optional(v.number()), // Unix timestamp (ms) when current phase/turn ends
    history: v.array(v.string()), // History logs
    lastUpdated: v.number(), // Unix timestamp (ms) of last modification
    hostId: v.optional(v.string()), // Host/Creator User ID
    runningCount: v.optional(v.number()), // Hi-Lo Running Count
  })
    .index("by_lastUpdated", ["lastUpdated"]),
});
