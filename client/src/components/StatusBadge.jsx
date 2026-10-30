export default function StatusBadge({ children }) {
  const value = String(children || "");
  const key = value.toLowerCase();
  const tone = ["active", "present", "approved", "processed", "completed", "offer", "hired"].some((word) => key.includes(word)) ? "green"
    : ["pending", "late", "progress", "interview", "screening", "review"].some((word) => key.includes(word)) ? "orange"
      : key.includes("leave") ? "blue" : "neutral";
  return <span className={`status-badge ${tone}`}>{value}</span>;
}
