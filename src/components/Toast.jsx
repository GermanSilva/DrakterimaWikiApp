export default function Toast({ message }) {
  return (
    <div className="fixed bottom-6 right-6 bg-bg-card border border-accent-dim px-5 py-3 font-exo text-[11px] font-semibold tracking-[0.1em] text-accent-bright z-[999] animate-slide-up uppercase">
      {message}
    </div>
  )
}
