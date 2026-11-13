export const STAGES = [
  { id: "new", label: "New", tone: "slate" },
  { id: "contacted", label: "Contacted", tone: "blue" },
  { id: "qualified", label: "Interested", tone: "violet" },
  { id: "proposal", label: "Quote sent", tone: "amber" },
  { id: "won", label: "Won", tone: "green" },
  { id: "lost", label: "Lost", tone: "red" },
] as const;
export const stageInfo = (s: string) => STAGES.find((x) => x.id === s) ?? STAGES[0];
export const ACTIVITY_TYPES = [["note", "Note"], ["call", "Call"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["visit", "Visit"], ["followup", "Follow-up reminder"]] as const;
export const LEAD_SOURCES = ["walk-in", "phone", "whatsapp", "instagram", "facebook", "website", "referral", "other"];
