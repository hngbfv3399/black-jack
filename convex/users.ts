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
      throw new Error("로그인이 필요합니다.");
    }

    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 15) {
      throw new Error("닉네임은 2자에서 15자 사이여야 합니다.");
    }

    // Basic regex checks to ensure letters/numbers/spaces only (no injections)
    if (!/^[a-zA-Z0-9가-힣\s-_]+$/.test(trimmed)) {
      throw new Error("닉네임에 유효하지 않은 문자가 포함되어 있습니다.");
    }

    // Check if nickname is taken
    const existing = await ctx.db
      .query("users")
      .withIndex("by_nickname", (q) => q.eq("nickname", trimmed))
      .first();

    if (existing && existing._id !== userId) {
      throw new Error("이 닉네임은 이미 다른 플레이어가 사용 중입니다.");
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
    const topUsers = await ctx.db
      .query("users")
      .withIndex("by_onboarded_balance", (q) => q.eq("isOnboarded", true))
      .order("desc")
      .take(10);
    
    return topUsers.map(u => ({
      _id: u._id,
      nickname: u.nickname!,
      balance: u.balance ?? 0,
    }));
  },
});

// Refill user balance back to $3000 if it falls below $1000
export const refillBalance = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("로그인이 필요합니다.");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    const currentBalance = user.balance ?? 0;
    if (currentBalance >= 1000) {
      throw new Error("잔액이 $1,000 미만일 때만 무료 충전이 가능합니다.");
    }

    await ctx.db.patch(userId, {
      balance: 3000,
    });

    // Synchronize the refilled balance to any active table seats this user occupies
    const activeTables = await ctx.db.query("tables").collect();
    for (const table of activeTables) {
      let seatModified = false;
      const updatedSeats = [...table.seats];
      for (let i = 0; i < 12; i++) {
        if (updatedSeats[i].userId === userId) {
          updatedSeats[i].balance = 3000;
          seatModified = true;
        }
      }
      if (seatModified) {
        await ctx.db.patch(table._id, {
          seats: updatedSeats,
          lastUpdated: Date.now(),
        });
      }
    }

    return 3000;
  },
});

