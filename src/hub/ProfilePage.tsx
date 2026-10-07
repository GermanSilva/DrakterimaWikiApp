import { useMemo } from 'react'
import { ProfileForm, useAuth } from '../auth'
import { useHubData } from '../app/DataContext'

export function ProfilePage() {
  const { profile, profileStatus, refreshProfile } = useAuth()
  const data = useHubData()
  const repository = useMemo(() => ({ update: data.updateProfile }), [data])

  return (
    <>
      <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-5">Mi perfil</h1>
      {profile ? (
        // key: a refreshed profile re-seeds the form fields.
        <ProfileForm key={profile.id} profile={profile} repository={repository} onSaved={() => void refreshProfile()} />
      ) : profileStatus === 'error' ? (
        <p role="alert" className="text-sm text-accent-bright">
          No pudimos cargar tu perfil. Recargá la página para reintentar.
        </p>
      ) : (
        <p role="status" className="text-sm text-txt-muted">
          Cargando tu perfil…
        </p>
      )}
    </>
  )
}
