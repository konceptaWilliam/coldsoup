import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { GROUP_LIST_SELECT, toGroupList } from "@/lib/group-list";

// Persistent shell for every /g/** URL. Has no dynamic segment, so it never
// remounts on group or thread switches; runs once per document load.
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // Middleware already did a real getUser() for this document request.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url, intro_seen")
      .eq("id", userId)
      .single(),
    supabase
      .from("group_memberships")
      .select(GROUP_LIST_SELECT)
      .eq("user_id", userId)
      .order("sort_order", { ascending: true, nullsFirst: false }),
  ]);

  if (!profile) redirect("/onboarding");

  return (
    <AppShell
      profile={{
        id: profile.id as string,
        display_name: profile.display_name as string,
        avatar_url: (profile.avatar_url as string | null) ?? null,
        intro_seen: !!(profile as { intro_seen?: boolean }).intro_seen,
      }}
      initialGroups={toGroupList(memberships ?? [])}
    >
      {children}
    </AppShell>
  );
}
