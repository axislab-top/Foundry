import { LayoutDashboard } from "lucide-react";

type PlaceholderPageProps = {
  title: string;
  description?: string;
};

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-gray-100 bg-gray-50">
        <LayoutDashboard className="h-9 w-9 text-gray-300" />
      </div>
      <h2 className="text-2xl font-bold text-gray-300">{title}</h2>
      <p className="mt-2 text-sm text-gray-400">{description ?? "该页面已创建，占位内容待后续接入。"}</p>
    </section>
  );
}
