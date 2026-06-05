import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

// Get current logged-in user profile
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const user = await ctx.db.get(userId);
    return user;
  },
});

// Complete onboarding by setting nickname and initializing starting money
export const completeOnboarding = mutation({
  args: { nickname: v.string() },
  handler: async (ctx, { nickname }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You must be signed in to perform this action.");
    }

    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 15) {
      throw new Error("Nickname must be between 2 and 15 characters.");
    }

    // Basic regex checks to ensure letters/numbers/spaces only (no injections)
    if (!/^[a-zA-Z0-9가-힣\s-_]+$/.test(trimmed)) {
      throw new Error("Nickname contains invalid characters.");
    }

    // Check if nickname is taken
    const existing = await ctx.db
      .query("users")
      .withIndex("by_nickname", (q) => q.eq("nickname", trimmed))
      .first();

    if (existing && existing._id !== userId) {
      throw new Error("This nickname is already taken by another player.");
    }

    // Update user profile with $3000 starting cash
    await ctx.db.patch(userId, {
      nickname: trimmed,
      balance: 3000,
      isOnboarded: true,
    });

    return userId;
  },
});

// Query to get top players ordered by balance
export const getLeaderboard = query({
  args: {},
  handler: async (ctx) => {
    const topUsers = await ctx.db.query("users").collect();
    
    return topUsers
      .filter(u => u.isOnboarded && u.nickname !== undefined)
      .map(u => ({
        _id: u._id,
        nickname: u.nickname!,
        balance: u.balance ?? 0,
      }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10); // top 10 players
  },
});
