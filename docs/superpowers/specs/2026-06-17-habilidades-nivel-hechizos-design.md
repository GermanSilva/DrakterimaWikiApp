# Habilidades — nuevo tipo de clasificación en hechizos de PJ

**Fecha:** 2026-06-17

## Contexto

La sección de hechizos de la ficha de PJ clasifica entradas por `nivel`: 0 (trucos) y 1–9 (conjuros). Se requiere un tercer tipo llamado "Habilidades" que agrupe habilidades de clase o raciales que no son hechizos propiamente dichos.

## Representación de datos

Se usa `nivel = 10` como valor especial para "Habilidades", con la misma mecánica que `nivel = 0` para trucos. Sin cambios de tipo en el schema — retrocompatible con datos existentes.

Schema sin cambios; el campo `nivel` admite ahora el rango efectivo 0–10.

## Comportamiento

- **Vista de detalle (PJSpellsSection):** Las habilidades (`nivel === 10`) siempre se muestran como activas (chip rojo), igual que los trucos. La lógica `isPrepared` incluye `Number(h.nivel) === 10`.
- **Formulario (SpellsCRUD):** El select de "Nivel" incluye la opción "Habilidad" (valor 10). El checkbox "Preparado" sigue disponible pero no afecta el color del chip en la vista.
- **Modal de detalle (SpellDetailModal):** `levelLabel` muestra `'Habilidad'` cuando `nivel === 10`.
- **Todos los demás campos** (casting_time, alcance, componentes, duración, concentración, ritual, descripción, a_niveles_superiores) siguen disponibles — útil para habilidades que tengan activación, alcance, etc.

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/pj/form/SpellsCRUD.jsx` | Agregar `'Habilidad'` a `LEVELS` y `'Habilidades'` a `LEVEL_LABELS` |
| `src/pages/pj/detail/PJSpellsSection.jsx` | Agregar `'Habilidades'` a `SPELL_LEVELS[10]`; actualizar `isPrepared` |
| `src/pages/pj/detail/SpellDetailModal.jsx` | Actualizar `levelLabel` para `nivel === 10` |
