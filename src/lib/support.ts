export const TICKET_STATUSES = [
  { id: "open", label: "Open", tone: "blue" },
  { id: "pending", label: "Waiting on customer", tone: "amber" },
  { id: "resolved", label: "Resolved", tone: "green" },
  { id: "closed", label: "Closed", tone: "slate" },
] as const;
export const PRIORITIES = [
  { id: "low", label: "Low", tone: "slate" },
  { id: "normal", label: "Normal", tone: "blue" },
  { id: "high", label: "High", tone: "amber" },
  { id: "urgent", label: "Urgent", tone: "red" },
] as const;
export const CATEGORIES = ["inquiry", "complaint", "warranty", "return", "delivery", "billing", "other"];
export const CHANNELS = ["shop", "phone", "whatsapp", "email", "website", "social"];
export const tStatus = (s: string) => TICKET_STATUSES.find((x) => x.id === s) ?? TICKET_STATUSES[0];
export const tPriority = (s: string) => PRIORITIES.find((x) => x.id === s) ?? PRIORITIES[1];
