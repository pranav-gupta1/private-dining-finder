import { PlannerApp } from "@/components/PlannerApp";
import { catalogueSize } from "@/lib/db/queries";

export default async function Home() {
  const catalogue = await catalogueSize();
  return <PlannerApp catalogue={catalogue} />;
}
