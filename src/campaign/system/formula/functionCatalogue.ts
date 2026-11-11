/** The functions of the formula language for the "Funciones" tab (S42 f): Spanish description and a worked example each. */

export type FunctionGroup = 'general' | 'texto' | 'tabla'

export interface FormulaFunctionInfo {
  /** The name as typed in a formula (`&` is an operator, listed with the functions). */
  name: string
  syntax: string
  /** Spanish, one or two sentences. */
  description: string
  /** A formula that parses and computes over a character with `{fuerza}` 14, a table `{inventario}` (nombre, peso) and `{precios}` (objeto, oro). */
  example: string
  group: FunctionGroup
}

export const FORMULA_FUNCTIONS: readonly FormulaFunctionInfo[] = [
  { name: 'si', syntax: 'si(condición, si_cumple, si_no)', description: 'Elige entre dos resultados según una condición: si vale distinto de cero da el segundo, si no el tercero. Solo calcula el que elige.', example: 'si({fuerza} >= 12, 1, 0)', group: 'general' },
  { name: 'min', syntax: 'min(a, b, ...)', description: 'El menor de los números que le pasás.', example: 'min({fuerza}, 20)', group: 'general' },
  { name: 'max', syntax: 'max(a, b, ...)', description: 'El mayor de los números que le pasás.', example: 'max({fuerza}, 10)', group: 'general' },
  { name: 'floor', syntax: 'floor(n)', description: 'Redondea hacia abajo al entero. Sirve para el modificador de un atributo.', example: 'floor(({fuerza} - 10) / 2)', group: 'general' },
  { name: 'ceil', syntax: 'ceil(n)', description: 'Redondea hacia arriba al entero.', example: 'ceil({fuerza} / 5)', group: 'general' },
  { name: 'round', syntax: 'round(n)', description: 'Redondea al entero más cercano.', example: 'round({fuerza} / 3)', group: 'general' },
  { name: 'abs', syntax: 'abs(n)', description: 'El valor sin signo: la distancia a cero.', example: 'abs({fuerza} - 20)', group: 'general' },
  { name: 'signo', syntax: 'signo(n)', description: 'Convierte el número en texto con su signo: +3 o -1. El resultado es un texto.', example: 'signo(floor(({fuerza} - 10) / 2))', group: 'texto' },
  { name: '&', syntax: 'a & b', description: 'Une textos y números en un solo texto. Se calcula después de la aritmética: {a} & "/" & {a} + 1 une la suma.', example: '"Fuerza " & {fuerza}', group: 'texto' },
  { name: 'suma', syntax: 'suma({tabla}, "columna")', description: 'Suma los valores de una columna numérica de una tabla.', example: 'suma({inventario}, "peso")', group: 'tabla' },
  { name: 'promedio', syntax: 'promedio({tabla}, "columna")', description: 'El promedio de los valores de una columna; las celdas vacías no cuentan.', example: 'promedio({inventario}, "peso")', group: 'tabla' },
  { name: 'conteo', syntax: 'conteo({tabla}) o conteo({tabla}, "columna")', description: 'Sin columna cuenta las filas de la tabla; con columna, las filas donde esa celda está llena y no vale 0 (una casilla marcada cuenta).', example: 'conteo({inventario}, "nombre")', group: 'tabla' },
  { name: 'mayor', syntax: 'mayor({tabla}, "columna")', description: 'El valor más alto de una columna numérica.', example: 'mayor({inventario}, "peso")', group: 'tabla' },
  { name: 'menor', syntax: 'menor({tabla}, "columna")', description: 'El valor más bajo de una columna numérica.', example: 'menor({inventario}, "peso")', group: 'tabla' },
  { name: 'frecuente', syntax: 'frecuente({tabla}, "columna")', description: 'El valor que más se repite en una columna; en un empate, el que aparece primero.', example: 'frecuente({inventario}, "nombre")', group: 'tabla' },
  { name: 'infrecuente', syntax: 'infrecuente({tabla}, "columna")', description: 'El valor que menos se repite en una columna; en un empate, el que aparece primero.', example: 'infrecuente({inventario}, "nombre")', group: 'tabla' },
  { name: 'lookup', syntax: 'lookup({tabla}, "columna_clave", clave, "columna_resultado", si_no_está)', description: 'Busca la fila de una tabla cuya columna clave vale la clave dada y da el valor de otra columna. El último argumento es opcional: lo que da si no hay fila.', example: 'lookup({precios}, "objeto", "Daga", "oro", 0)', group: 'tabla' },
]
