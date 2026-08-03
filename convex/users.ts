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
    try {
      return await ctx.db.get(userId);
    } catch (e) {
      // If the ID is invalid (e.g. database was wiped/reset, causing invalid ID version decode error)
      return null;
    }
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

    // Update user profile with $10000 starting cash.
    // The first user remains the initial administrator.
    const allUsers = await ctx.db.query("users").collect();
    const isFirstUser = allUsers.length <= 1; // including the current user

    await ctx.db.patch(userId, {
      nickname: trimmed,
      balance: 10000,
      isOnboarded: true,
      role: isFirstUser ? "admin" : "user",
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

// Refill user balance by $10000 if it falls below $1000.
// There is no daily refill-count limit.
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

    const newBalance = currentBalance + 10000;

    await ctx.db.patch(userId, {
      balance: newBalance,
    });

    // Synchronize the refilled balance to any active table seats this user occupies
    const activeTables = await ctx.db.query("tables").collect();
    for (const table of activeTables) {
      let seatModified = false;
      const updatedSeats = [...table.seats];
      for (let i = 0; i < updatedSeats.length; i++) {
        if (updatedSeats[i].userId === userId) {
          updatedSeats[i].balance = newBalance;
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

    return newBalance;
  },
});

export const getMyRole = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { role: "guest", isAnonymous: true };
    try {
      const user = await ctx.db.get(userId);
      return {
        role: user?.role ?? "user",
        isAnonymous: user?.isAnonymous ?? false,
      };
    } catch (e) {
      // If the ID is invalid (e.g. database was wiped/reset, causing invalid ID version decode error)
      return { role: "guest", isAnonymous: true };
    }
  }
});

export const getAllUsersAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("로그인이 필요합니다.");
    const currentUser = await ctx.db.get(userId);
    if (currentUser?.role !== "admin") {
      throw new Error("관리자 권한이 필요합니다.");
    }
    const users = await ctx.db.query("users").collect();
    return users
      .filter(u => u.isOnboarded && !u.isAnonymous)
      .map(u => ({
        _id: u._id,
        nickname: u.nickname ?? "No name",
        email: u.email ?? "No email",
        balance: u.balance ?? 0,
        role: u.role ?? "user",
      }));
  }
});

export const updateUserBalanceAdmin = mutation({
  args: { targetUserId: v.id("users"), newBalance: v.number() },
  handler: async (ctx, { targetUserId, newBalance }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("로그인이 필요합니다.");
    const currentUser = await ctx.db.get(userId);
    if (currentUser?.role !== "admin") {
      throw new Error("관리자 권한이 필요합니다.");
    }
    if (newBalance < 0) throw new Error("잔액은 0 이상이어야 합니다.");
    
    await ctx.db.patch(targetUserId, { balance: newBalance });

    // Sync balance across any active table seats
    const activeTables = await ctx.db.query("tables").collect();
    for (const table of activeTables) {
      let seatModified = false;
      const updatedSeats = [...table.seats];
      for (let i = 0; i < updatedSeats.length; i++) {
        if (updatedSeats[i].userId === targetUserId) {
          updatedSeats[i].balance = newBalance;
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
  }
});
