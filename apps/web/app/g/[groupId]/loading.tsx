import { ThreadListSkeleton, ThreadDetailEmptySkeleton } from "@/components/nav-skeletons";

export default function Loading() {
  return (
    <>
      <ThreadListSkeleton />
      <ThreadDetailEmptySkeleton />
    </>
  );
}
