"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isShellMounted, isShellPath, navigate, parseShellRoute } from "./shell-route";

export function useShellRoute() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = useMemo(() => parseShellRoute(pathname), [pathname]);
  return { ...route, highlight: searchParams.get("highlight") ?? undefined };
}

// Navigate anywhere: instant pushState inside the mounted shell, a normal
// router navigation otherwise (e.g. a notification tap while on /settings).
export function useShellNavigate() {
  const router = useRouter();
  return useCallback(
    (path: string) => {
      if (isShellMounted() && isShellPath(path)) navigate(path);
      else router.push(path);
    },
    [router]
  );
}
