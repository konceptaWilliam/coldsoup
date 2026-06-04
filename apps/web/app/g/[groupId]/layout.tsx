import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { SwipeToOpenSidebar } from "@/components/swipe-to-open-sidebar";
import { IntroOverlay } from "@/components/intro-overlay";
import { UnreadProvider } from "@/lib/unread-context";
import { MobileSidebarProvider } from "@/lib/mobile-sidebar-context";

export default async function GroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/onboarding");
  }

  // Fetch all groups the user belongs to
  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("group_id, groups(id, name)")
    .eq("user_id", user.id);

  const groups = (memberships ?? [])
    .map((m) => m.groups)
    .filter(Boolean) as unknown as Array<{ id: string; name: string }>;

  return (
    <UnreadProvider>
      <MobileSidebarProvider>
        <div className="h-screen-dynamic flex overflow-hidden bg-surface">
          <Sidebar
            groups={groups}
            userDisplayName={profile.display_name}
            avatarUrl={profile.avatar_url ?? null}
          />
          <SwipeToOpenSidebar>{children}</SwipeToOpenSidebar>
        </div>
        <IntroOverlay seen={!!(profile as { intro_seen?: boolean }).intro_seen} />
      </MobileSidebarProvider>
    </UnreadProvider>
  );
}
