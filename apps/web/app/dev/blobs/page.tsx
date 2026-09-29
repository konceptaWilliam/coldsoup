import { notFound } from "next/navigation";
import { BlobLab } from "./blob-lab";

export default function DevBlobsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BlobLab />;
}
