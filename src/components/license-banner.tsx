import Link from "next/link";

// Shown at the top of every page when the trial or subscription is close to its end.
export default function LicenseBanner(props: { state: string; daysLeft: number; endsOn: string; canRenew: boolean; checkWarning?: boolean }) {
  const { state, daysLeft } = props;
  if (props.checkWarning)
    return (
      <div className="card mb-4 flex flex-wrap items-center justify-between gap-2 bg-amber-50 p-3 text-sm text-amber-800">
        <span>Connect this computer to the internet: DOLLAR44 ERP has not checked your subscription for over 45 days.</span>
        {props.canRenew && <Link href="/activate" className="font-semibold underline">Check now</Link>}
      </div>
    );
  if (state === "active" && daysLeft > 7) return null;
  if (state === "trial" && daysLeft > 7) return null;
  const urgent = state === "grace" || daysLeft <= 3;
  const text =
    state === "grace"
      ? `Your DOLLAR44 ERP subscription ended on ${props.endsOn}. It locks in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
      : state === "trial"
        ? `Free trial: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`
        : `Subscription ends on ${props.endsOn}: renew to keep using DOLLAR44 ERP. ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`;
  return (
    <div className={`card mb-4 flex flex-wrap items-center justify-between gap-2 p-3 text-sm ${urgent ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
      <span>{text}</span>
      {props.canRenew && <Link href="/activate" className="font-semibold underline">Enter activation key</Link>}
    </div>
  );
}
