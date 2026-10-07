export function MissingConfigScreen({ missing }: { missing: string[] }) {
  return (
    <main id="main-content" tabIndex={-1} className="max-w-md mx-auto pt-24 px-4 outline-none">
      <h1 className="font-exo text-lg font-semibold tracking-[0.15em] uppercase text-txt-primary mb-3">Falta configurar Supabase</h1>
      <p className="text-sm text-txt-secondary mb-3">
        La app no puede conectarse porque no están definidas estas variables de entorno:
      </p>
      <ul className="mb-4 list-disc pl-5 text-sm text-txt-primary font-mono">
        {missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="text-sm text-txt-secondary">
        En desarrollo, corré <code className="text-txt-primary">supabase status</code> y copiá la URL y la anon key a{' '}
        <code className="text-txt-primary">.env.local</code>. Después reiniciá el servidor de desarrollo.
      </p>
    </main>
  )
}
