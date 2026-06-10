# Diseño: Eliminar nota con modal de confirmación

**Fecha:** 2026-06-10  
**Archivos afectados:** `src/App.jsx`, `src/pages/Notas.jsx`

## Objetivo

Agregar un botón de eliminar en cada NoteCard de la página Notas, accesible para el DM (cualquier nota) y para cada jugador (sus propias notas). La acción requiere confirmación mediante un modal.

## Alcance

- Solo la página Notas (`Notas.jsx`). No se modifica `PlayerNotes.jsx` (editor inline en vistas de detalle de entidades).
- El modal de confirmación es un componente inline dentro de `Notas.jsx`.

## Cambios

### 1. `src/App.jsx` — nueva función de contexto

Agregar `deletePlayerNote(note_id)` junto a `savePlayerNote`:

```js
async function deletePlayerNote(note_id) {
  await deleteDoc(doc(firestore, 'player_notes', note_id))
  showToast('Nota eliminada')
}
```

Exponer en el contexto (`ctx`) junto al resto de funciones de mutación.

**Por qué no usar `remove()`:** La función `remove()` existente tiene `window.confirm()` bakeado y llama `setForm(null)`, que no aplica a player notes. Una función dedicada mantiene la separación clara.

### 2. `src/pages/Notas.jsx`

#### 2a. `NoteCard` — botón de eliminar

`NoteCard` recibe nueva prop `onDelete`. En la cabecera del card (junto al nombre y la etiqueta de tipo) se agrega el botón con ícono `Trash2` de Lucide:

- Posicionado a la derecha del flex row del header.
- Estilo: `text-txt-muted hover:text-red-400 transition-colors p-0.5 cursor-pointer`.
- `e.stopPropagation()` para no activar la navegación del card al hacer click.
- Solo se renderiza si `onDelete` está definido.

Layout del header de NoteCard:
```
[ nombre ]  [ tipo-badge ]  →  flex gap-2 items-center  ←  [🗑]
```
El icono de basura queda a la derecha gracias a `ml-auto` en su wrapper.

#### 2b. `pendingDelete` state

```jsx
const [pendingDelete, setPendingDelete] = useState(null)
// null = modal cerrado; objeto note = modal abierto
```

Declarado antes de los `if` condicionales (hooks rules). El mismo state sirve tanto para la vista DM como para la vista jugador.

#### 2c. `ConfirmModal` — componente inline

Componente local `ConfirmModal({ note, onConfirm, onCancel })`:

- Overlay fijo fullscreen (`fixed inset-0 bg-black/60 z-50 flex items-center justify-center`).
- Card centrado (`bg-bg-card border border-border-base p-6 w-[min(380px,90vw)]`).
- Título: "¿Eliminar esta nota?"
- Subtítulo: nombre de la entidad + tipo (para identificar qué nota se borra).
- Botones: "Eliminar" (danger style: `bg-red-600 hover:bg-red-700 text-white`) y "Cancelar" (`btnSecondary`).
- Cerrar con Escape (keydown listener).

#### 2d. Paso de `onDelete` y render del modal

En ambas vistas (DM y jugador), `NoteCard` recibe:
```jsx
<NoteCard
  key={note.id}
  note={note}
  db={db}
  goToDetail={goToDetail}
  onDelete={() => setPendingDelete(note)}
/>
```

El modal se renderiza condicionalmente al final del JSX de retorno:
```jsx
{pendingDelete && (
  <ConfirmModal
    note={pendingDelete}
    db={db}
    onConfirm={() => { deletePlayerNote(pendingDelete.id); setPendingDelete(null) }}
    onCancel={() => setPendingDelete(null)}
  />
)}
```

## Acceso

- **Vista DM:** todas las notas mostradas son borrables sin restricción adicional.
- **Vista jugador:** `myNotes` ya está filtrado a las notas de `currentPlayer` — todas son borrables.
- No se necesita ningún check de autorización extra en la capa de UI.

## Criterio de éxito

1. Cada NoteCard muestra un ícono de papelera que no navega al hacer click.
2. Al hacer click en la papelera aparece un modal con nombre de entidad, botón "Eliminar" y "Cancelar".
3. Confirmar elimina el documento de Firestore y muestra toast "Nota eliminada".
4. Cancelar o Escape cierra el modal sin cambios.
5. No se modifica `PlayerNotes.jsx` ni ningún otro archivo fuera de los dos listados.
