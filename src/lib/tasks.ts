export const TASK_COLUMNS = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
] as const;
export const TASK_PRIORITIES = [["low", "Low", "slate"], ["normal", "Normal", "blue"], ["high", "High", "amber"], ["urgent", "Urgent", "red"]] as const;
export const prio = (p: string) => TASK_PRIORITIES.find(([k]) => k === p) ?? TASK_PRIORITIES[1];
