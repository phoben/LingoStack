import type { ReactNode } from "react";

export function SetSection({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-border py-5 first:pt-3 last:border-0">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {desc ? (
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{desc}</p>
      ) : null}
      {children}
    </section>
  );
}

export function FuncCell({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">{children}</div>
  );
}
