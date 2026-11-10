import { Suspense } from "react";
import SearchPageClient from "@/components/search/SearchPageClient";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <SearchPageClient />
    </Suspense>
  );
}
