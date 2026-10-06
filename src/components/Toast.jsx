export default function Toast({ message, variant = 'success' }) {
  const isError = variant === 'error'
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={`fixed bottom-6 right-6 bg-bg-card border px-5 py-3 font-exo text-[11px] font-semibold tracking-[0.1em] z-[1100] animate-slide-up uppercase max-w-[calc(100vw-48px)] ${
        isError ? 'border-accent text-accent' : 'border-accent-dim text-accent-bright'
      }`}
    >
      {message}
    </div>
  )
}
