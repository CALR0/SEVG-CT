import { redirect } from "next/navigation";
import { getSession } from "@/lib/controlt";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  return <DashboardClient user={{ email: s.email, name: s.name, idCompany: s.idCompany }} />;
}
