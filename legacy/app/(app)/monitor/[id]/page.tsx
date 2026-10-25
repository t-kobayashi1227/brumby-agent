import { notFound } from "next/navigation";
import { properties } from "../../../_lib/data";
import MonitorDetail from "./MonitorDetail";

export function generateStaticParams() {
  return properties.map((_, id) => ({ id: String(id) }));
}

export default async function MonitorDetailPage({ params }: PageProps<"/monitor/[id]">) {
  const { id } = await params;
  const property = properties[Number(id)];
  if (!property) notFound();
  return <MonitorDetail property={property} />;
}
