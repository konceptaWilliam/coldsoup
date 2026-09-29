export type GroupListItem = { id: string; name: string; created_at: string; myRole: string };

type MembershipRow = { role: unknown; groups: unknown };

// Shape returned by groups.list; also used by the shell layout to seed the
// same query from the server.
export function toGroupList(rows: MembershipRow[]): GroupListItem[] {
  return rows
    .map((m) => ({
      ...(m.groups as { id: string; name: string; created_at: string } | null),
      myRole: m.role as string,
    }))
    .filter((g): g is GroupListItem => !!(g as Partial<GroupListItem>).id);
}

export const GROUP_LIST_SELECT = "group_id, role, sort_order, groups(id, name, created_at)";
