import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const user = ctx.user;
  return next({
    ctx: {
      ...ctx,
      user,
      // Most procedures only need the id, which the verified JWT already has.
      profile: { id: user.id },
      getProfile: async () => {
        const p = await ctx.getProfile();
        if (!p) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Profile missing" });
        return p;
      },
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuthed);
