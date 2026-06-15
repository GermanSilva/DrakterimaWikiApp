const BASE = 'https://api.open5e.com'

async function apiFetch(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Error ${res.status} al contactar la API`)
  return res.json()
}

function buildUrl(path, params) {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  }
  return url.toString()
}

export async function fetchSpells({ search = '', level = '', school = '', pageUrl = null } = {}) {
  const url = pageUrl ?? buildUrl('/v1/spells/', {
    search, limit: 20,
    ...(level !== '' && { level_int: level }),
    ...(school !== '' && { school }),
  })
  const data = await apiFetch(url)
  return { results: data.results, next: data.next ?? null }
}

export async function fetchMonsters({ search = '', challenge_rating = '', type = '', pageUrl = null } = {}) {
  const url = pageUrl ?? buildUrl('/v1/monsters/', {
    search, limit: 20,
    ...(challenge_rating !== '' && { cr: challenge_rating }),
    ...(type !== '' && { type }),
  })
  const data = await apiFetch(url)
  return { results: data.results, next: data.next ?? null }
}

export async function fetchConditions() {
  const data = await apiFetch(buildUrl('/v1/conditions/', { limit: 50 }))
  return { results: data.results }
}

export async function fetchWeapons({ search = '', category = '', pageUrl = null } = {}) {
  const url = pageUrl ?? buildUrl('/v1/weapons/', {
    search, limit: 20,
    ...(category !== '' && { category }),
  })
  const data = await apiFetch(url)
  return { results: data.results, next: data.next ?? null }
}

export async function fetchArmors({ search = '', category = '', pageUrl = null } = {}) {
  const url = pageUrl ?? buildUrl('/v1/armor/', {
    search, limit: 20,
    ...(category !== '' && { category }),
  })
  const data = await apiFetch(url)
  return { results: data.results, next: data.next ?? null }
}

export async function fetchMagicItems({ search = '', rarity = '', pageUrl = null } = {}) {
  const url = pageUrl ?? buildUrl('/v1/magicitems/', {
    search, limit: 20,
    ...(rarity !== '' && { rarity }),
  })
  const data = await apiFetch(url)
  return { results: data.results, next: data.next ?? null }
}
