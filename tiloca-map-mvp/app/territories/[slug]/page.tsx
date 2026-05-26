import { TerritoryOverview } from "@/components/TerritoryOverview";

export default async function TerritoryOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TerritoryOverview slug={slug} />;
}
