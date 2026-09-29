import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function RootPage() {
  const supabase = await createClient();

  // Middleware already did a real getUser() for this document request.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;

  if (!userId) {
    redirect("/login");
  }

  const admin = createAdminClient();

  // Admin client bypasses RLS for the profile existence check.
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    admin.from("profiles").select("id").eq("id", userId).single(),
    admin
      .from("group_memberships")
      .select("group_id")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .limit(1),
  ]);

  if (!profile) {
    redirect("/onboarding");
  }

  if (memberships && memberships.length > 0) {
    redirect(`/g/${memberships[0].group_id}`);
  }

  // No groups yet — show empty state
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center">
        <p className="font-mono text-sm text-muted">
          You&apos;re not in any groups yet.
        </p>
        <p className="text-xs text-muted mt-1">Ask an admin to add you.</p>
      </div>
    </div>
  );
}
