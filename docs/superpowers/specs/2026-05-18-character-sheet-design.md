# Diseño: Hoja de Personaje Completa (PJs)

**Fecha:** 2026-05-18
**Estado:** Aprobado — pendiente de implementación

---

## Resumen

Ampliar la pantalla de PJ para que funcione como hoja de personaje D&D 5e virtual completa, organizada al estilo de la webApp (no una copia visual del papel). Incluye mecánicas completas (atributos, habilidades con proficiencia, salvaciones, ataques, hechizos, equipo) y narrativa completa (apariencia física, personalidad, ideales, vínculos, defectos).

La integración con la API Open5e (búsqueda de hechizos/ítems por nombre) queda reservada para **Fase 2** — el schema la contempla desde el día 1.

---

## Decisiones de diseño

| Pregunta | Decisión |
|---|---|
| Alcance | Hoja completa (mecánicas + narrativa) |
| Vista de detalle | Página larga con barra de anclas rápidas |
| Ataques / Equipo / Hechizos | Listas estructuradas con CRUD |
| Habilidades y salvaciones | Agrupadas por atributo (con toggle a vista alfabética como mejora futura) |
| Hechizos | Slots por nivel + lista de nombres (sin descripción inline — Fase 2) |
| Formulario de edición | FormModal con 3 pestañas internas |
| Arquitectura | Archivos separados por responsabilidad (clean architecture) |
| Open5e API | Fase 2 — schema compatible desde el inicio |

---

## Schema — campos nuevos en el objeto PJ

Los campos existentes no cambian. Se agregan:

### Identidad extendida
```js
trasfondo_dnd   // string — Background D&D (Soldado, Sabio, Criminal, etc.)
alineamiento    // string — ej. "Leal Bueno", "Neutral Caótico"
experiencia     // number — puntos de experiencia
```

### Descripción física
```js
edad            // string
altura          // string — ej. "1.75m"
peso            // string — ej. "70kg"
ojos            // string
piel            // string
pelo            // string
apariencia      // string (textarea) — notas de aspecto visual
```

### Personalidad (página 2 de la hoja estándar)
```js
personalidad    // string (textarea)
ideales         // string (textarea)
vinculos        // string (textarea)
defectos        // string (textarea)
```

### Mecánicas de combate extendidas
```js
stat_proficiency_bonus        // number — editable, valor sugerido por nivel
stat_inspiration              // boolean
stat_hit_dice                 // string — ej. "5d8"
stat_death_saves_success      // number 0–3
stat_death_saves_failure      // number 0–3
```

### Proficiencias de tiradas de salvación (6 booleanos)
```js
save_str, save_dex, save_con, save_int, save_wis, save_cha
```

### Habilidades / Skills (18 valores: 0 = ninguna, 1 = proficiente, 2 = maestría)
```js
skill_acrobatics, skill_animal_handling, skill_arcana, skill_athletics,
skill_deception, skill_history, skill_insight, skill_intimidation,
skill_investigation, skill_medicine, skill_nature, skill_perception,
skill_performance, skill_persuasion, skill_religion, skill_sleight_of_hand,
skill_stealth, skill_survival
```

### Proficiencias e idiomas (textareas)
```js
idiomas               // string
prof_armas            // string
prof_armaduras        // string
prof_herramientas     // string
rasgos_clase          // string (textarea larga) — rasgos y habilidades de clase
otros_rasgos          // string (textarea)
```

### Hechicería
```js
spell_dc              // number — DC de salvación de conjuración
spell_attack_bonus    // number — bono de ataque de hechizo
spell_ability         // string — "INT" | "SAB" | "CAR"
spell_slots           // object — { "1": 4, "2": 3, "3": 2, ... } (máximo por nivel)
hechizos              // array — [{ id, nombre, nivel }]
```

### Ataques
```js
ataques   // array — [{ id, nombre, bono_ataque, dano, tipo_dano, alcance, notas }]
```

### Equipo
```js
equipo    // array — [{ id, nombre, cantidad, descripcion }]
monedas   // object — { cp, sp, ep, gp, pp }
```

**Compatibilidad:** el `localStorage` existente (`drakterima_wiki_v1`) no se rompe. Los campos nuevos son `undefined` en PJs ya guardados y se tratan como null/vacío en toda la UI.

---

## Vista de detalle — estructura de secciones

`PJDetail.jsx` renderiza una página larga con barra de anclas sticky. Cada sección se oculta si no tiene datos cargados.

### Barra de anclas (sticky)
```
Stats · Habilidades · Ataques · Hechizos · Equipo · Rasgos · Narrativa · Apariencia · 🔒 DM
```
Solo muestra anclas para secciones con datos. En mobile colapsa a scroll horizontal.

### Sección 1 — Cabecera (existente, sin cambios)
Nombre, jugador, tags (clase/nivel, raza, región, estado), imagen.

### Sección 2 — Stats (existente + adiciones)
6 ability boxes (modificador grande + base chico). Badges de HP, AC, Vel, Init.
**Nuevo:** Bono Proficiencia · Dados de Golpe · Inspiración · Percepción Pasiva (calculada: 10 + mod SAB + bono prof si proficiente).

### Sección 3 — Habilidades & Salvaciones (nueva)
6 tarjetas agrupadas por atributo. Cada tarjeta muestra:
- Header: nombre del atributo + modificador
- Salvación con ●/◌ y bono calculado
- Skills asociadas con ●/◆/◌ y bono calculado

Bono de skill = mod atributo + (prof > 0 ? bono_prof : 0) + (prof > 1 ? bono_prof : 0)

**Mejora futura:** toggle para ver lista alfabética plana (estilo A) o buscador rápido.

### Sección 4 — Ataques (nueva)
Tabla: Arma · Bono · Daño · Tipo · Alcance · Notas. Se oculta si `ataques` está vacío.

### Sección 5 — Hechizos (nueva)
DC y bono de conjuración (si hay hechizos). Slots por nivel como grupo de burbujas (solo lectura). Lista de hechizos agrupada por nivel como tags. Se oculta si no hay hechizos.

### Sección 6 — Equipo (nueva)
Lista de ítems con nombre y cantidad. Monedas al pie (PP · GP · EP · SP · CP). Se oculta si no hay equipo ni monedas.

### Sección 7 — Rasgos & Proficiencias (nueva)
Rasgos de clase, otros rasgos (nl2br). Idiomas, proficiencias de armas/armaduras/herramientas como texto.

### Sección 8 — Narrativa (existente, sin cambios)
Historia/trasfondo, motivación, relación con la Magralita.

### Sección 9 — Apariencia & Personalidad (nueva)
Descripción física como badges inline (Edad · Altura · Peso · Ojos · Piel · Pelo). Notas de apariencia. Personalidad · Ideales · Vínculos · Defectos en grid 2×2.

### Sección 10 — Notas DM (existente, DM-only 🔒)

---

## Formulario de edición — PJForm con 3 pestañas

`PJForm.jsx` reemplaza el `PjForm` actual dentro de `FormModal.jsx`. Usa un `useState('identidad')` para la pestaña activa. El estado del formulario (`f`) sigue siendo un objeto plano con todos los campos.

### Pestaña 1 — Identidad
- Fila: Nombre · Jugador
- Fila: Clase · Raza · Trasfondo D&D
- Fila: Nivel · Región · Alineamiento · XP
- Imagen URL con preview
- Estado / Visibilidad (componente existente `EstadoField`)
- *Separador: Apariencia Física*
- Fila: Edad · Altura · Peso
- Fila: Ojos · Piel · Pelo
- Notas de apariencia (textarea)
- *Separador: Personalidad*
- Grid 2×2: Rasgos de personalidad · Ideales · Vínculos · Defectos
- *Separador: Trasfondo & Campaña*
- Historia/trasfondo · Motivación · Relación con la Magralita · Notas DM 🔒

### Pestaña 2 — Mecánicas
- Fila: Bono Proficiencia · Dados de Golpe · Inspiración (checkbox)
- Grid 6 columnas: atributos (existente)
- Fila combate: HP · AC · Velocidad · Iniciativa (existente)
- *Separador: Tiradas de Salvación*
- 6 checkboxes alineados con los atributos
- *Separador: Habilidades*
- `SkillsProficiencyGrid` — 18 skills en grid 3 columnas; cada skill tiene un botón que cicla entre ◌ (0) → ● (1) → ◆ (2) → ◌ al hacer click
- Percepción Pasiva: badge display-only (no input), muestra el valor calculado en tiempo real mientras el DM edita los campos de SAB y proficiencia
- *Separador: Hechicería* (se muestra siempre; campos opcionales)
- Fila: DC · Bono Ataque · Atributo (select INT/SAB/CAR)
- Slots por nivel: inputs numéricos niv 1–9 (en fila compacta)

### Pestaña 3 — Equipo & Rasgos
- *Separador: Ataques* → `AttacksCRUD`
- *Separador: Hechizos* → `SpellsCRUD`
- *Separador: Equipo* → `EquipmentCRUD` + fila de monedas
- *Separador: Proficiencias & Rasgos*
- Idiomas · Prof. Armas · Prof. Armaduras · Prof. Herramientas (textareas cortas)
- Rasgos de clase · Otros rasgos (textareas largas)

---

## Estructura de archivos

```
src/
  pages/
    PJs.jsx                        # Shell: grid de cards + routing por selectedId
    pj/
      PJCard.jsx                   # Card individual en la grilla
      PJDetail.jsx                 # Contenedor: barra de anclas + secciones
      PJForm.jsx                   # Form container: 3 pestañas + estado compartido
      detail/
        PJStatsSection.jsx         # Stats + badges de combate
        PJSkillsSection.jsx        # Habilidades agrupadas por atributo
        PJAttacksSection.jsx       # Tabla de ataques (solo lectura)
        PJSpellsSection.jsx        # Slots + lista de hechizos
        PJEquipmentSection.jsx     # Lista de equipo + monedas
        PJTraitsSection.jsx        # Rasgos, proficiencias, idiomas
        PJNarrativeSection.jsx     # Historia, motivación, Magralita
        PJAppearanceSection.jsx    # Descripción física + personalidad
      form/
        PJIdentityTab.jsx          # Pestaña 1: identidad + narrativa
        PJMechanicsTab.jsx         # Pestaña 2: stats, salvaciones, habilidades
        PJInventoryTab.jsx         # Pestaña 3: ataques, hechizos, equipo, rasgos
        SkillsProficiencyGrid.jsx  # Grid de 18 skills con selector 0/1/2
        AttacksCRUD.jsx            # CRUD inline de ataques
        SpellsCRUD.jsx             # CRUD de hechizos + slots
        EquipmentCRUD.jsx          # CRUD de equipo + monedas
  helpers/
    pjCalc.js                      # Cálculo: modificadores, bono prof, perc. pasiva
```

**Cambios en archivos existentes:**
- `src/pages/PJs.jsx` — queda como shell delgado. Importa `PJCard`, `PJDetail`.
- `src/components/FormModal.jsx` — `FORM_COMPONENTS.pjs` importa `PJForm` desde `src/pages/pj/PJForm.jsx`. El `PjForm` inline se elimina.
- `src/seed.js` — nuevos campos con defaults (`null` o `0` o `[]` o `{}`).
- `src/styles.css` — nuevas clases: `.form-tabs`, `.detail-anchors`, `.skill-group`, `.skill-row`, `.attack-table`, `.spell-slots`, `.equipment-list`, `.currency-row`, `.physical-badges`.

---

## Fase 2 — Open5e API (fuera de scope actual)

La API `https://api.open5e.com/` ofrece endpoints SRD para hechizos, ítems mágicos, armas, etc. En Fase 2:
- Al agregar un hechizo, buscar por nombre en Open5e y pre-rellenar datos.
- Al agregar equipo, opción de importar desde el catálogo SRD.
- Los datos importados son editables para adaptar a la campaña.
- El schema actual (`hechizos[].nombre`, `equipo[].nombre`) ya es compatible — Fase 2 agrega campos opcionales (`source`, `srd_data`) sin breaking changes.

---

## Consideraciones adicionales

- **Cálculos derivados** (`pjCalc.js`): modificador de atributo = `Math.floor((val - 10) / 2)`, percepción pasiva = `10 + mod_SAB + (skill_perception > 0 ? prof_bonus : 0) + (skill_perception > 1 ? prof_bonus : 0)`. Bono de proficiencia sugerido por nivel: niv 1–4 → +2, 5–8 → +3, 9–12 → +4, 13–16 → +5, 17–20 → +6 (el campo `stat_proficiency_bonus` es editable para contemplar multiclase u otras variantes).
- **Campos opcionales**: ninguna sección es obligatoria. Un PJ puede tener solo nombre y clase (como hoy) sin problema.
- **Acceso jugadores**: la decisión de qué campos pueden editar los jugadores (vs solo el DM) se toma en una sesión posterior a la implementación.
- **No hay breaking change** en el localStorage: la clave `drakterima_wiki_v1` se mantiene.
