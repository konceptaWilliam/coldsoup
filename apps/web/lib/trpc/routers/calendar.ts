import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { Context } from "../context";
import { createAdminClient } from "@/lib/supabase/admin";

const HOUR_MS = 60 * 60 * 1000;
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #C8E6D5");
const DEFAULT_COLOR = "#C8E6D5";

// Assert the caller is a member of `groupId`, else FORBIDDEN. Uses the user's
// RLS-bound client so a non-member can never act on the group's calendar.
async function assertMember(
  supabase: Context["supabase"],
  groupId: string,
  userId: string
) {
  const { data: membership } = await supabase
    .from("group_memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .single();
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });
  }
}

export const calendarRouter = router({
  list: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      await assertMember(supabase, input.groupId, profile.id);

      const admin = createAdminClient();
      const { data, error } = await admin
        .from("calendar_events")
        .select(
          `id, group_id, title, description, start_at, end_at, all_day, location, color, created_by,
           creator:profiles!calendar_events_created_by_fkey(id, display_name, avatar_url)`
        )
        .eq("group_id", input.groupId)
        .order("start_at", { ascending: true });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  create: protectedProcedure
    .input(
      z.object({
        groupId: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().optional(),
        startAt: z.string().datetime(),
        endAt: z.string().datetime().optional(),
        allDay: z.boolean().optional(),
        location: z.string().max(200).nullable().optional(),
        color: colorSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      await assertMember(supabase, input.groupId, profile.id);

      const start = new Date(input.startAt);
      // Default to a one-hour event when no end is supplied.
      const end = input.endAt ? new Date(input.endAt) : new Date(start.getTime() + HOUR_MS);
      if (end.getTime() < start.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "End must be after start" });
      }

      const admin = createAdminClient();
      const { data, error } = await admin
        .from("calendar_events")
        .insert({
          group_id: input.groupId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          all_day: input.allDay ?? false,
          location: input.location?.trim() || null,
          color: input.color ?? DEFAULT_COLOR,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  update: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).nullable().optional(),
        startAt: z.string().datetime().optional(),
        endAt: z.string().datetime().optional(),
        allDay: z.boolean().optional(),
        location: z.string().max(200).nullable().optional(),
        color: colorSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: event } = await admin
        .from("calendar_events")
        .select("group_id, start_at, end_at")
        .eq("id", input.eventId)
        .single();
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      // Any group member may edit (collaborative calendar).
      await assertMember(supabase, event.group_id as string, profile.id);

      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title.trim();
      if (input.description !== undefined) patch.description = input.description?.trim() || null;
      if (input.startAt !== undefined) patch.start_at = new Date(input.startAt).toISOString();
      if (input.endAt !== undefined) patch.end_at = new Date(input.endAt).toISOString();
      if (input.allDay !== undefined) patch.all_day = input.allDay;
      if (input.location !== undefined) patch.location = input.location?.trim() || null;
      if (input.color !== undefined) patch.color = input.color;

      const nextStart = new Date((patch.start_at as string) ?? (event.start_at as string));
      const nextEnd = new Date((patch.end_at as string) ?? (event.end_at as string));
      if (nextEnd.getTime() < nextStart.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "End must be after start" });
      }

      const { data, error } = await admin
        .from("calendar_events")
        .update(patch)
        .eq("id", input.eventId)
        .select()
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  delete: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: event } = await admin
        .from("calendar_events")
        .select("group_id")
        .eq("id", input.eventId)
        .single();
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      await assertMember(supabase, event.group_id as string, profile.id);

      const { error } = await admin
        .from("calendar_events")
        .delete()
        .eq("id", input.eventId);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
