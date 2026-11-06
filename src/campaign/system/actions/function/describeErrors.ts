/** Spanish, path-addressed text for the errors `validateActionFunction` reports (its own messages are English, for logs and tests). */
import type { FunctionError } from './model'

const SEGMENTS: Record<string, string> = {
  steps: 'Pasos', key: 'clave', label: 'etiqueta', input: 'entrada', min: 'mínimo', max: 'máximo', value: 'valor', target: 'destino',
  table: 'tabla', column: 'columna', match: 'coincidencia', op: 'operación', type: 'tipo', kind: 'tipo de paso', options: 'opciones',
}

/** `steps[1].target.key` -> `Paso 2 › destino › clave`. */
export function describePath(path: string): string {
  return path
    .split('.')
    .flatMap((part) => {
      const indexed = /^([a-z]+)\[(\d+)\]$/.exec(part)
      if (!indexed) return [SEGMENTS[part] ?? part]
      const n = Number(indexed[2]) + 1
      return [indexed[1] === 'steps' ? `Paso ${n}` : indexed[1] === 'options' ? `opción ${n}` : `${SEGMENTS[indexed[1]] ?? indexed[1]} ${n}`]
    })
    .join(' › ')
}

const MESSAGES: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^a function needs 1 to (\d+) steps$/, (m) => `Una función necesita entre 1 y ${m[1]} pasos.`],
  [/^parameter \{(.+)\} is declared by a later step$/, (m) => `El parámetro {${m[1]}} se declara en un paso posterior.`],
  [/^unknown reference \{(.+)\}$/, (m) => `Referencia desconocida {${m[1]}}.`],
  [/^\{(.+)\} is a table, use it inside a table function$/, (m) => `{${m[1]}} es una tabla: usala dentro de una función de tabla.`],
  [/^\{(.+)\} is not a table that functions can read$/, (m) => `{${m[1]}} no es una tabla que las funciones puedan leer.`],
  [/^\{(.+)\} has no column (.+)$/, (m) => `{${m[1]}} no tiene la columna ${m[2]}.`],
  [/^invalid formula$/, () => 'La fórmula no es válida.'],
  [/^a bound is a number or a formula$/, () => 'Un límite es un número o una fórmula.'],
  [/^min is above max$/, () => 'El mínimo supera al máximo.'],
  [/^the input is number, checkbox or options$/, () => 'La entrada es número, casilla u opciones.'],
  [/^options need 1 to (\d+) entries$/, (m) => `Las opciones necesitan entre 1 y ${m[1]} entradas.`],
  [/^invalid label$/, () => 'La etiqueta no es válida.'],
  [/^a value is a finite number or a short text$/, () => 'El valor es un número o un texto corto.'],
  [/^repeated value$/, () => 'Valor repetido.'],
  [/^invalid key$/, () => 'La clave no es válida (minúsculas, números y guion bajo; empieza con letra).'],
  [/^repeated key$/, () => 'Clave repetida.'],
  [/^a field target needs a key$/, () => 'El destino necesita un campo o rol.'],
  [/^the role (.+) is not bound to a stored field in the sheet$/, (m) => `El rol ${m[1]} no está enlazado a un campo guardado de la hoja.`],
  [/^no field or role named (.+)$/, (m) => `No hay un campo ni un rol llamado ${m[1]}.`],
  [/^(.+) is not a stored number field$/, (m) => `${m[1]} no es un campo numérico guardado.`],
  [/^a state target needs the Habilidad table of the action$/, () => 'El estado necesita la tabla de Habilidad de la acción.'],
  [/^the column must be a stored number column of character scope$/, () => 'La columna debe ser numérica, guardada y del personaje.'],
  [/^the target is field, row or state$/, () => 'El destino es un campo, una fila o un estado.'],
  [/^the table must be a Libre table of the sheet$/, () => 'La tabla debe ser una tabla Libre de la hoja.'],
  [/^the match column must be a number column of the table$/, () => 'La columna de coincidencia debe ser numérica.'],
  [/^the column must be a stored number column of the table$/, () => 'La columna debe ser numérica y guardada.'],
  [/^the operation is set, add or subtract$/, () => 'La operación es fijar, sumar o restar.'],
  [/^a step is an object$/, () => 'Un paso es un objeto.'],
  [/^a step is param or effect$/, () => 'Un paso es un parámetro o un efecto.'],
]

export function describeFunctionError(error: FunctionError): string {
  const hit = MESSAGES.map(([pattern, build]) => {
    const m = pattern.exec(error.message)
    return m ? build(m) : null
  }).find((text) => text !== null)
  return `${describePath(error.path)}: ${hit ?? error.message}`
}

