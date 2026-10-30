export default function PageHeader({ eyebrow, title, subtitle, action }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>
      {action}
    </div>
  );
}
