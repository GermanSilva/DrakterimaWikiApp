# Diseño: Markdown + imágenes en WikiText

**Fecha:** 2026-05-25  
**Branch:** UI-Update  
**Alcance:** `src/components/WikiText.jsx`, nuevo `src/components/WikiImage.jsx`

---

## Objetivo

Agregar soporte de formato markdown básico y embeds de imagen (`[[url]]`) a todos los campos de texto largo del wiki, manteniendo la funcionalidad existente de wiki-links (`[[{NL}texto]]`).

---

## Arquitectura general

El cambio vive completamente en `WikiText.jsx` y un nuevo `WikiImage.jsx`. No cambia ninguna interfaz pública — `<WikiText text={campo} />` sigue siendo el mismo contrato. `WikiLink`, `Tooltip` y `wikiHelpers.js` no se modifican.

Pipeline interno:

```
text (string)
  └─► parseBlocks()      → Block[]   (heading, list, hr, paragraph)
        └─► parseInline() → Node[]   (text, bold, italic, wikilink, image)
              └─► render  → JSX
```

---

## Parser de bloques (block-level)

Las líneas del texto se clasifican en orden de prioridad:

| Patrón | Tipo | Render |
|--------|------|--------|
| `# Texto` | h1 | `<h1>` |
| `## Texto` | h2 | `<h2>` |
| `### Texto` | h3 | `<h3>` |
| `- texto` o `* texto` | list-item unordered | `<ul><li>` |
| `1. texto` | list-item ordered | `<ol><li>` |
| `---` (línea sola) | hr | `<hr>` |
| Línea vacía | separador de párrafos | agrupación |
| Todo lo demás | paragraph | `<p>` |

- Las líneas consecutivas del mismo tipo de lista se agrupan en un solo `<ul>` o `<ol>`.
- Los párrafos consecutivos (sin línea vacía entre ellos) se fusionan en un `<p>` con `<br>` entre ellos (comportamiento actual preservado).

---

## Parser inline

Dentro de cada bloque de texto, se parsea en una sola pasada con una regex combinada. Orden de prioridad:

| Patrón | Tipo | Render |
|--------|------|--------|
| `[[https://...]]` / `[[http://...]]` | imagen | `<WikiImage>` |
| `[[{NL}texto]]` | wiki-link válido | `<WikiLink>` (existente) |
| `[[{N}texto]]` | wiki-link inválido | span atenuado (existente) |
| `***texto***` | bold + italic | `<strong><em>` |
| `**texto**` | negrita | `<strong>` |
| `*texto*` | cursiva | `<em>` |
| texto plano | texto | `<span>` |

El orden garantiza que combinaciones como `**negrita con [[{1P}link]]**` funcionen: la negrita envuelve el wiki-link correctamente.

---

## Componente `WikiImage`

**Archivo:** `src/components/WikiImage.jsx`

```jsx
function WikiImage({ url }) {
  const [error, setError] = useState(false)
  if (error) return (
    <a href={url} target="_blank" rel="noopener noreferrer">[Error al cargar imagen]</a>
  )
  return (
    <img
      src={url}
      alt=""
      onError={() => setError(true)}
      style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
    />
  )
}
```

- `maxWidth: 100%` — contiene la imagen al espacio disponible
- `height: auto` — mantiene el aspect ratio original
- `display: block` + `margin: 0 auto` — centra la imagen cuando es más angosta que el contenedor

Fallback en caso de error: `<a>` con texto `[Error al cargar imagen]` que abre la URL en nueva pestaña.

---

## Archivos a modificar / crear

| Archivo | Cambio |
|---------|--------|
| `src/components/WikiText.jsx` | Reemplazar lógica de renderizado con pipeline block + inline |
| `src/components/WikiImage.jsx` | Nuevo componente |

Ningún otro archivo se modifica.

---

## Fuera de alcance

- Preview markdown en el formulario de edición
- Tablas, bloques de código, tachado (GFM extendido)
- Nuevas dependencias npm
