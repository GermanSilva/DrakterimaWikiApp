import { sectionTitleCls } from '../../../constants'

export default function SessionCardShell({ title, children }) {
  return (
    <section className="border border-border-base bg-bg-card p-5 mb-5">
      <div className={sectionTitleCls}>{title}</div>
      {children}
    </section>
  )
}
