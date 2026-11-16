import { notFound } from "next/navigation";
import { RpsLab } from "./rps-lab";

// Next 14: searchParams is a plain object.
export default function DevRpsPage({ searchParams }: { searchParams: { s?: string } }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <RpsLab section={searchParams.s ?? "all"} />;
}
