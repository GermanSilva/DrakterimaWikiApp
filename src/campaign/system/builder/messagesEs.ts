/** Spanish copy for the messages the formula parser and the sheet validator give in English. Unknown messages pass through. */

const FORMULA_ERRORS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^empty formula$/, () => 'la fórmula está vacía.'],
  [/^formula too long$/, () => 'la fórmula es demasiado larga (máximo 500 caracteres).'],
  [/^unclosed reference$/, () => 'falta cerrar una referencia con }.'],
  [/^invalid reference \{(.*)\}$/, (m) => `la referencia {${m[1]}} no es válida.`],
  [/^reserved reference \{(.*)\}$/, (m) => `la referencia {${m[1]}} está reservada.`],
  [/^unclosed text$/, () => 'falta cerrar un texto con comillas.'],
  [/^a text cannot span lines$/, () => 'un texto no puede ocupar varias líneas.'],
  [/^unexpected character "(.*)"$/, (m) => `carácter inesperado "${m[1]}".`],
  [/^unexpected token after the expression$/, () => 'hay algo de más después de la expresión.'],
  [/^expected "(.*)"$/, (m) => `se esperaba "${m[1]}".`],
  [/^formula nested too deeply$/, () => 'la fórmula tiene demasiados niveles anidados.'],
  [/^unexpected end of the formula$/, () => 'la fórmula termina antes de tiempo.'],
  [/^unexpected "(.*)"$/, (m) => `símbolo inesperado "${m[1]}".`],
  [/^(\w+) needs a table reference first$/, (m) => `${m[1]} necesita primero una tabla entre llaves.`],
  [/^(\w+) needs a column name in quotes$/, (m) => `${m[1]} necesita el nombre de una columna entre comillas.`],
  [/^unknown function "(.*)"$/, (m) => `la función "${m[1]}" no existe.`],
  [/^(\w+) takes (.+) argument\(s\)$/, (m) => `${m[1]} recibe ${m[2]} argumento(s).`],
]

/** The parser's error in Spanish (lower case, ends with a period, to follow "Fórmula no válida: "). */
export function formulaErrorEs(error: string): string {
  for (const [pattern, say] of FORMULA_ERRORS) {
    const match = error.match(pattern)
    if (match) return say(match)
  }
  return error
}
