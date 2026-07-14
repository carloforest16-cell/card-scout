import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminToken } from "@/lib/adminAuth";
import Dashboard from "./_components/Dashboard";

export const metadata = {
  title: "Mission Control",
  robots: "noindex, nofollow",
};

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;

  if (!verifyAdminToken(token)) {
    redirect("/admin/login");
  }

  return <Dashboard />;
}
