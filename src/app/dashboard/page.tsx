"use client";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Shared dashboard placeholder content.</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            { label: "Total Projects", value: "12" },
            { label: "Active Tasks", value: "34" },
            { label: "Team Members", value: "8" },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="mb-1 text-xs font-medium uppercase tracking-widest text-slate-400">{card.label}</p>
              <p className="text-3xl font-bold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
