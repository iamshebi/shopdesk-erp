import { redirect } from "next/navigation";
import { pending2faUser } from "@/lib/auth";
import { ShieldCheck } from "lucide-react";
import TwoFactorForm from "./form";

export default async function TwoFactorPage() {
  if (!(await pending2faUser())) redirect("/login");
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-white"><ShieldCheck size={26} /></div>
          <h1 className="text-xl font-semibold tracking-tight">Two-step verification</h1>
          <p className="mt-1 text-sm text-slate-500">Open your authenticator app and enter the code for DOLLAR44 ERP.</p>
        </div>
        <TwoFactorForm />
      </div>
    </main>
  );
}
