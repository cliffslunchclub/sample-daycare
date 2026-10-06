export function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="page-title"><div className="eyebrow">DAYCARE LUNCH OPERATIONS</div><h1>{title}</h1><p>{subtitle}</p></div>;
}
