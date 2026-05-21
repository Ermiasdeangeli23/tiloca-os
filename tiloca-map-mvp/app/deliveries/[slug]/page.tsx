"use client";

import { useParams } from "next/navigation";

import { DeliveryWorkspace } from "@/components/DeliveryWorkspace";

export default function DeliveryPage() {
  const params = useParams<{ slug: string }>();
  return <DeliveryWorkspace slug={params.slug} />;
}
