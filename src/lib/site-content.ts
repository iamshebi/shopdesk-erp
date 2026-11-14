import { getSettings } from "./settings";

export interface SiteContent {
  announcement: string;
  banners: { title: string; subtitle: string; image: string; link: string; active: boolean }[];
  promos: { title: string; text: string; link: string; active: boolean }[];
  menu: { label: string; link: string }[];
  pages: { slug: string; title: string; body: string }[];
  seo: { title: string; description: string; keywords: string; ga_id: string; gtm_id: string; meta_pixel_id: string; search_console: string };
  contact: { whatsapp: string; phone: string; email: string; address: string; hours: string; instagram: string; facebook: string };
}
export const EMPTY_SITE: SiteContent = {
  announcement: "", banners: [], promos: [], menu: [], pages: [],
  seo: { title: "", description: "", keywords: "", ga_id: "", gtm_id: "", meta_pixel_id: "", search_console: "" },
  contact: { whatsapp: "", phone: "", email: "", address: "", hours: "", instagram: "", facebook: "" },
};
export async function siteContent(): Promise<SiteContent> {
  const s = await getSettings();
  try { const j = JSON.parse(s.site_content || "{}"); return { ...EMPTY_SITE, ...j, seo: { ...EMPTY_SITE.seo, ...(j.seo ?? {}) }, contact: { ...EMPTY_SITE.contact, ...(j.contact ?? {}) } }; } catch { return EMPTY_SITE; }
}
