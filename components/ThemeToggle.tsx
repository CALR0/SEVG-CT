"use client";
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("segv-theme") : null;
    const prefers = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeState((stored as Theme) || (prefers ? "dark" : "light"));
  }, []);
  function setTheme(t: Theme) {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("segv-theme", t); } catch {}
  }
  return [theme, setTheme];
}
