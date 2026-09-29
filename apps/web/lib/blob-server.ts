// Server-only random source for blob rolls. Rolls never happen on the client.
import "server-only";
import { randomInt } from "node:crypto";
import type { RandInt } from "@/lib/blob-evolution";

export const cryptoRand: RandInt = (n) => randomInt(n);
