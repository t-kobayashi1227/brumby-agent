import type { PropertyStatus } from "../_lib/data";
import { badgeClass } from "../_lib/ui";

export default function StatusBadge({ status }: { status: PropertyStatus }) {
  return <span className={badgeClass(status)}>{status}</span>;
}
