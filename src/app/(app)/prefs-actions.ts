"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPref, setPref, type PageRef } from "@/lib/prefs";

const clean = (href: string) => (href.startsWith("/") && !href.startsWith("//") ? href.slice(0, 300) : "/");

export async function recordVisit(href: string, title: string) {
  const user = await requireUser();
  const h = clean(href);
  if (h === "/" || h.startsWith("/notifications")) return;
  const list = (await getPref<PageRef[]>(user.id, "recent", [])).filter((p) => p.href !== h);
  list.unshift({ href: h, title: title.slice(0, 80) });
  await setPref(user.id, "recent", list.slice(0, 12));
}

/** Pin (or unpin) the current page, including its filters, so it is one click away in the sidebar. */
export async function togglePin(href: string, title: string) {
  const user = await requireUser();
  const h = clean(href);
  const pins = await getPref<PageRef[]>(user.id, "pins", []);
  const next = pins.some((p) => p.href === h) ? pins.filter((p) => p.href !== h) : [...pins, { href: h, title: title.slice(0, 60) || h }].slice(-15);
  await setPref(user.id, "pins", next);
  revalidatePath("/", "layout");
  return next;
}

export async function saveDashboard(fd: FormData) {
  const user = await requireUser();
  const all = String(fd.get("all") ?? "").split(",").filter(Boolean);
  const shown = fd.getAll("show").map(String);
  await setPref(user.id, "dash_hidden", all.filter((k) => !shown.includes(k)));
  redirect("/");
}

export async function setLanguage(fd: FormData) {
  const user = await requireUser();
  await setPref(user.id, "lang", fd.get("lang") === "ar" ? "ar" : "en");
  revalidatePath("/", "layout");
  redirect(String(fd.get("back") || "/account"));
}
