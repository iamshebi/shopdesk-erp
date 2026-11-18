import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import SetupForm from "./form";

export default async function SetupPage() {
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM users");
  if (n?.n) redirect("/login");
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md fade-in">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to DOLLAR44 ERP</h1>
          <p className="mt-1 text-sm text-slate-500">Set up the shop and the owner account. You can change everything later in Settings.</p>
        </div>
        <SetupForm />
      </div>
    </main>
  );
}
