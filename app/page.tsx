import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/controlt";

export default function Home() {
  const hasSession = cookies().get(SESSION_COOKIE);
  redirect(hasSession ? "/dashboard" : "/login");
}
