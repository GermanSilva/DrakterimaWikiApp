# Guía y Plantilla para la Actualización de la UI de Ficha de Personaje (PJ)

Este documento define la **estructura ideal** para planear cambios en la interfaz de usuario de la sección de detalles de personaje (`PJDetail.jsx` y subcomponentes en `src/pages/pj/detail`). Ha sido optimizado para que agentes de desarrollo especializados puedan comprender el diseño, la lógica técnica y ejecutar los cambios de forma precisa y autónoma.

A continuación se presenta la **Plantilla Vacía** y, posteriormente, un **Ejemplo Completo Resuelto** como referencia.

---

# 📝 PLANTILLA DE PLANIFICACIÓN DE UI
*(Copia esta sección en un nuevo archivo o al inicio de este documento cuando planees un cambio)*

## 1. Información General y Metadatos
* **Título del Cambio**: [ej. Rediseño de la Visualización de Hechizos y Slots]
* **Estado del Plan**: 🔘 Borrador / 🟢 Listo para Ejecución
* **Autor / Solicitante**: [Nombre]
* **Complejidad Estimada**: Baja / Media / Alta
* **Archivos Relacionados**:
  * `[MODIFICAR]` [Ruta al archivo, ej. `src/pages/pj/detail/PJStatsSection.jsx`]
  * `[NUEVO]` [Ruta al archivo, ej. `src/pages/pj/detail/PJCustomWidget.jsx`]

## 2. Objetivos de Diseño y UX
* **Propósito**: ¿Qué problema de diseño actual se está resolviendo y cuál es la mejora esperada?
* **Alineación Estética**: Especificar los tokens de diseño (colores, fuentes y clases Tailwind de `tailwind.config.js`) que se usarán para mantener la coherencia con el tema oscuro/fantasía.
* **Responsive Layout**: Describir detalladamente el comportamiento en Mobile (`max-sm`), Tablet (`max-md`) y Desktop (`lg`).

## 3. Jerarquía Visual y Mockup (ASCII / Mermaid)
*Dibujar o describir de forma esquemática cómo se debe distribuir la UI.*

```
+-------------------------------------------------------------+
| [Elemento A] | [Elemento B]                                |
+-------------------------------------------------------------+
| [Elemento C (Grid 2 cols en Mobile, 4 cols en Desktop)]     |
| [ - Sub-item C1 ]        | [ - Sub-item C2 ]                |
+-------------------------------------------------------------+
```

## 4. Plan de Implementación Técnica (Paso a Paso)
*Instrucciones detalladas de refactorización y lógica de componentes para el agente.*

### Fase 1: Preparación y Estilos
- [ ] [Paso 1, ej. Definir nuevas clases de Tailwind o variables CSS en `styles.css`]
- [ ] [Paso 2, ej. Comprobar constantes importadas en `pjConstants.js`]

### Fase 2: Estructura React y Componentes
- [ ] [Paso 3, ej. Modificar el componente `XComponent` para estructurar la nueva Grid]
- [ ] [Paso 4, ej. Implementar condicionales para renderizar secciones solo si los datos existen]

### Fase 3: Interactividad y Micro-animaciones
- [ ] [Paso 5, ej. Añadir clases `transition-all duration-200 hover:scale-[1.02]` en las tarjetas]
- [ ] [Paso 6, ej. Manejar los estados activos e inactivos de los botones con clases condicionales]

## 5. Control de Acceso y Visibilidad (DM vs. Player)
*Especificar cómo interactúa este cambio con los permisos del sistema:*
* **Vista DM**: ¿Qué campos privados (`pj.notas`, etc.) u opciones de edición se muestran?
* **Vista Jugador**: ¿Qué campos deben ocultarse o mostrarse con candado/atenuados?

## 6. Plan de Verificación y Criterios de Aceptación
*Checklist de pruebas específicas para validar la correcta ejecución de los cambios.*

- [ ] **Funcionalidad Básica**: [ej. Los modificadores se calculan correctamente en base a las estadísticas base]
- [ ] **Casos Borde (Empty States)**: [ej. Si el PJ no tiene hechizos asignados, la pestaña se oculta por completo]
- [ ] **Diseño Responsivo**: [ej. En pantallas menores a 640px, las tarjetas pasan a diseño vertical de 1 columna]
- [ ] **Interactividad**: [ej. Hover en las habilidades resalta el modificador con color `text-accent-bright`]

---

# 💡 EJEMPLO COMPLETO RESUELTO
*(Usa este ejemplo como referencia para ver el nivel de detalle y precisión requerido)*

## 1. Información General y Metadatos
* **Título del Cambio**: Rediseño Visual Premium de la Cabecera de Personaje y Grid Dinámico de Estadísticas (Stats)
* **Estado del Plan**: 🟢 Listo para Ejecución
* **Autor / Solicitante**: DM Germán Silva
* **Complejidad Estimada**: Media
* **Archivos Relacionados**:
  * `[MODIFICAR]` [PJDetail.jsx](file:///e:/Claude%20Cowork/Drakterima/dragones-wiki/src/pages/pj/PJDetail.jsx) (Actualización del layout de la cabecera y el grid principal)
  * `[MODIFICAR]` [PJStatsSection.jsx](file:///e:/Claude%20Cowork/Drakterima/dragones-wiki/src/pages/pj/detail/PJStatsSection.jsx) (Rediseño de las cajas de habilidades y stats)
  * `[MODIFICAR]` [pjConstants.js](file:///e:/Claude%20Cowork/Drakterima/dragones-wiki/src/pages/pj/pjConstants.js) (Ajuste de estilos CSS comunes)

## 2. Objetivos de Diseño y UX
* **Propósito**: Modernizar la cabecera del personaje y el bloque de estadísticas primarias (FUE, DES, etc.) para que se asemeje a una ficha de juego premium. Se quiere pasar de una vista lineal y plana a un diseño de tarjetas con efecto "glassmorphism", bordes de acento dinámicos y micro-animaciones al hacer hover.
* **Alineación Estética**: 
  * Usar la paleta de colores del tema: fondo de tarjeta en `bg-card` (`#111111`), fondos secundarios en `bg-mid` (`#0b0b0b`) y bordes en `border-base` (`#1e1e1e`).
  * Destacar las estadísticas clave con `text-accent-bright` (`#ef4444`) o `text-accent-dim` (`#991b1b`) al interactuar.
  * Mantener tipografía `font-exo` para valores numéricos y etiquetas de cabecera, y `font-barlow` para textos descriptivos.
* **Responsive Layout**:
  * **Desktop**: Cabecera con imagen flotando a la izquierda y datos a la derecha en 2 columnas; bloque de estadísticas primarias en grid horizontal de 6 columnas.
  * **Mobile (`max-md`)**: Imagen centrada arriba en tamaño reducido; estadísticas primarias se apilan en grid de 3 columnas x 2 filas para no perder legibilidad.

## 3. Jerarquía Visual y Mockup (ASCII)

```
+-----------------------------------------------------------------------------------+
|  [FOTO PJ]  | (Nombre del PJ) - Nivel X [Clase / Raza]  [Región - Tag de Color]   |
|  (Max 200px) |--------------------------------------------------------------------|
|             | Alineación: Caótico Bueno  |  Jugador: Germán                       |
+-----------------------------------------------------------------------------------+
| [ STATS PRIMARIAS - Grid 6 cols (Desktop) / 3 cols (Mobile) ]                     |
|  +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ |
|  |    FUE    | |    DES    | |    CON    | |    INT    | |    SAB    | |    CAR    | |
|  |   +3      | |   -1      | |   +2      | |   +0      | |   +1      | |   +4      | |
|  |  (16)     | |   (8)     | |  (14)     | |  (10)     | |  (12)     | |  (18)     | |
|  +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ |
+-----------------------------------------------------------------------------------+
| [ STATS SECUNDARIAS / COMBATE - Flexbox Wrap ]                                    |
|  [ HP Máx: 45 ]  [ AC: 16 ]  [ Iniciativa: +2 ]  [ Velocidad: 30ft ]  [ Bono Prof: +3 ]|
+-----------------------------------------------------------------------------------+
```

## 4. Plan de Implementación Técnica (Paso a Paso)

### Fase 1: Preparación y Estilos
- [ ] En [pjConstants.js](file:///e:/Claude%20Cowork/Drakterima/dragones-wiki/src/pages/pj/pjConstants.js), añadir clases utilitarias para las tarjetas de estadísticas primarias:
  ```javascript
  export const abilityCardCls = 'flex flex-col items-center justify-between bg-bg-card border border-border-base rounded px-2.5 py-3 transition-all duration-200 hover:border-accent-dim hover:bg-bg-card-hover hover:scale-[1.03] select-none'
  ```

### Fase 2: Componentes y Estructura React
- [ ] Modificar [PJStatsSection.jsx](file:///e:/Claude%20Cowork/Drakterima/dragones-wiki/src/pages/pj/detail/PJStatsSection.jsx) para reestructurar el componente `AbilityBox`:
  * En lugar de bordes rectos y colores planos, usar `abilityCardCls`.
  * Mostrar el modificador (calculado por `abilityMod`) en una fuente grande `text-xl font-bold tracking-tight` y color `text-txt-primary`.
  * La puntuación base de la habilidad debe ir al fondo, pequeña y con color `text-txt-muted` encerrada entre paréntesis (ej. `(14)`).
- [ ] Actualizar el grid de `ABILITY_SCORES` en el mismo archivo para que use:
  ```jsx
  className="grid grid-cols-6 gap-2.5 max-md:grid-cols-3 max-sm:grid-cols-2"
  ```
- [ ] Modificar las tarjetas de combate (`StatBadge`):
  * Reemplazar por un diseño con bordes redondeados sutiles (`rounded-md`).
  * Si el valor es de vital importancia (ej. HP actual, AC), añadir un borde izquierdo de color sólido `border-l-2 border-l-accent`.

### Fase 3: Estructuración de la Cabecera en PJDetail.jsx
- [ ] En [PJDetail.jsx](file:///e:/Claude%20Cowork/Drakterima/dragones-wiki/src/pages/pj/PJDetail.jsx), rediseñar la sección de la cabecera (líneas 56-76) para que integre la imagen dentro de una tarjeta principal:
  * Usar un contenedor flex-col o grid en móviles, y flex-row en desktop:
    ```jsx
    <div className="flex flex-col md:flex-row gap-6 items-center md:items-start p-5 bg-bg-card border border-border-light rounded-lg mb-6">
      {pj.imagen_url && (
        <img src={pj.imagen_url} alt={pj.nombre} className="w-36 h-36 md:w-44 md:h-44 object-cover rounded-full border-2 border-border-base shadow-lg" />
      )}
      <div className="flex-1 text-center md:text-left">
        {/* Nombre, clase, nivel y tags */}
      </div>
    </div>
    ```

### Fase 4: Interactividad y Micro-animaciones
- [ ] Añadir efectos de transición a las pestañas de navegación adhesivas en [PJDetail.jsx](file:///e:/Claude%20Cowork/Drakterima/dragones-wiki/src/pages/pj/PJDetail.jsx) (línea 79):
  * Al pasar el mouse por encima de una pestaña inactiva, cambiar suavemente el color del texto de `text-txt-muted` a `text-txt-primary` (`transition-colors duration-150`).
  * Añadir un borde inferior rojo activo en la pestaña correspondiente a la sección visible actual en la pantalla (usando un Observer o por selección al hacer click).

## 5. Control de Acceso y Visibilidad (DM vs. Player)
* **Vista DM**: 
  * En [PJDetail.jsx](file:///e:/Claude%20Cowork/Drakterima/dragones-wiki/src/pages/pj/PJDetail.jsx), las opciones de `Editar` y `Eliminar` en la cabecera deben mantenerse dentro del flujo flex superior, pero su diseño debe unificarse usando botones con fondo negro pulido (`bg-black/40 hover:bg-accent-dim`).
  * El bloque `<Lock /> Notas DM` debe situarse inmediatamente después de las estadísticas del personaje en pantallas grandes, pero seguir de forma secuencial al final de la página en móviles.
* **Vista Jugador**:
  * Si el PJ visualizado está en estado de borrador (`pj.estado === 'borrador'`) y no es el DM, el componente principal debe abortar el renderizado y devolver un mensaje de "Acceso No Autorizado" usando el componente `Tag`.

## 6. Plan de Verificación y Criterios de Aceptación

- [ ] **Funcionalidad de Estadísticas**:
  * Comprobar que una fuerza de `16` renderice un modificador de `+3` y un valor base de `(16)`.
  * Comprobar que una destreza de `9` renderice un modificador de `-1` y un valor base de `(9)`.
- [ ] **Diseño Responsivo**:
  * Simular pantalla de móvil (375px de ancho) en el navegador y verificar que la imagen de la cabecera se reduzca de forma proporcional y que la grid de habilidades pase a ser de 2 columnas de forma fluida.
  * Simular pantalla de tablet (768px de ancho) y confirmar que la grid de habilidades sea de 3 columnas.
- [ ] **Interactividad de Hover**:
  * Confirmar visualmente que al pasar el ratón por encima de cualquier caja de habilidad (`AbilityBox`), la caja aumente un `3%` de tamaño (`hover:scale-[1.03]`) de forma suave y el borde brille con el color `accent-dim`.
- [ ] **Manejo de Imágenes Rotos (Edge Case)**:
  * Probar con una URL de imagen inválida (ej. `https://imagen-falsa.com/pj.png`) y asegurar que el evento `onError` del tag `<img>` oculte la imagen sin romper el alineamiento de la información textual de la cabecera.
