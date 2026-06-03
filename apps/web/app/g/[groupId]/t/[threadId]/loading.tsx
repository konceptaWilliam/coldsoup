import { ThreadListSkeleton, ThreadDetailSkeleton } from "@/components/nav-skeletons";

export default function Loading() {
  return (
    <>
      <ThreadListSkeleton active />
      <ThreadDetailSkeleton />
    </>
  );
}
