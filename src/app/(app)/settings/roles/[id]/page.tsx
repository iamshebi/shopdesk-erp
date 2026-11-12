import { notFound, redirect } from "next/navigation";
import { one, q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import Submit from "@/components/submit";
import RoleForm from "./form";
import { deleteRole } from "../../staff/actions";

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser("staff");
  if (!me.perms.includes("*")) redirect("/settings/staff?err=Only+an+owner+can+edit+roles");
  const { id } = await params;
  const isNew = id === "new";
  const role = isNew ? null : await one<any>("SELECT * FROM roles WHERE id=$1", [Number(id)]);
  if (!isNew && (!role || role.locked)) notFound();
  const staff = role ? await q<{ name: string }>("SELECT name FROM users WHERE role_id=$1 AND active", [role.id]) : [];
  return (
    <div className="max-w-3xl">
      <PageHeader title={isNew ? "New role" : `Edit role: ${role.name}`} subtitle={staff.length ? `Used by ${staff.map((s) => s.name).join(", ")}` : "Tick what people with this role are allowed to do"}>
        {role && (
          <form action={deleteRole}>
            <input type="hidden" name="id" value={role.id} />
            <Submit className="btn-danger" confirm="Delete this role?">Delete role</Submit>
          </form>
        )}
      </PageHeader>
      <RoleForm role={role ? { id: role.id, name: role.name, perms: JSON.parse(role.permissions) } : null} />
    </div>
  );
}
