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

const NAME_ERROR = 'El nombre debe tener entre 1 y 60 caracteres, sin caracteres de control ni invisibles.'
const KEY_ERROR = 'Clave no válida: empieza con una letra minúscula y usa solo minúsculas sin tildes, números y guion bajo, sin doble guion bajo (hasta 40 caracteres).'

const SHEET_ERRORS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^the sheet is too large$/, () => 'La plantilla es demasiado grande (máximo 40.000 caracteres).'],
  [/^a sheet needs categories$/, () => 'La plantilla necesita categorías.'],
  [/^invalid key$/, () => KEY_ERROR],
  [/^reserved key$/, () => 'Esa clave está reservada por la aplicación. Elegí otra.'],
  [/^key already used at /, () => 'Esa clave ya está en uso por otro elemento.'],
  [/^repeated key$/, () => 'Hay otra clave igual en esta lista.'],
  [/^invalid label$/, () => NAME_ERROR],
  [/^editableBy must be dm or player$/, () => 'Elegí quién edita: el DM o el jugador.'],
  [/^format signed needs a number or options field$/, () => 'El formato con signo solo sirve para campos numéricos o de opciones.'],
  [/^default does not match the type$/, () => 'El valor por defecto no coincide con el tipo.'],
  [/^options belong to an options field$/, () => 'Solo un campo de opciones lleva opciones.'],
  [/^display belongs to an options field$/, () => 'Solo un campo de opciones se muestra como lista o casilla.'],
  [/^an options field needs 2 to 20 options$/, () => 'Un campo de opciones necesita entre 2 y 20 opciones.'],
  [/^invalid option$/, () => 'La opción no es válida.'],
  [/^display must be select or checkbox$/, () => 'Elegí cómo se muestra: lista desplegable o casilla.'],
  [/^a checkbox has exactly two options$/, () => 'Una casilla tiene exactamente dos opciones.'],
  [/^reset needs a custom number column/, () => 'El reinicio necesita una columna numérica propia (sin fórmula) de una tabla Libre o Habilidad.'],
  [/^invalid reset$/, () => 'El reinicio no es válido.'],
  [/^reset to a value needs a finite number$/, () => 'El reinicio a un valor necesita un número.'],
  [/^reset to a column needs another number column/, () => 'El reinicio a una columna necesita otra columna numérica de la tabla.'],
  [/^reset must go to zero/, () => 'El reinicio debe ir a cero, a una columna o a un valor.'],
  [/^columns required$/, () => 'La tabla necesita sus columnas (hasta 12).'],
  [/^invalid column$/, () => 'La columna no es válida.'],
  [/^invalid type$/, () => 'Tipo no válido.'],
  [/^formula needs a number or boolean column$/, () => 'Solo las columnas numéricas o sí/no pueden tener fórmula.'],
  [/^scope must be entry or character/, () => 'El alcance (entrada o personaje) solo existe en columnas de Habilidad sin fórmula.'],
  [/^invalid calculation$/, () => 'El cálculo no es válido.'],
  [/^unknown calculation$/, () => 'Elegí una operación.'],
  [/^a calculation needs a table$/, () => 'El cálculo necesita una tabla.'],
  [/^this calculation needs a column$/, () => 'Esta operación necesita una columna.'],
  [/^a calculation reads a free, skill or coin table$/, () => 'El cálculo lee una tabla Libre, de Habilidad o de monedas.'],
  [/^this calculation gives a number/, () => 'Este cálculo da un número (el valor más o menos frecuente puede ser un número o un texto corto).'],
  [/^a field has a formula or a calculation, not both$/, () => 'Un campo tiene fórmula o cálculo, no ambos.'],
  [/^formula needs a number, boolean or short text field$/, () => 'La fórmula necesita un campo numérico, sí/no o de texto corto.'],
  [/^a computed field is computed/, () => 'Un campo calculado solo lo escribe el DM.'],
  [/^overridable is a boolean and needs a formula$/, () => 'Reemplazable necesita una fórmula.'],
  [/^hidden is a boolean and needs a formula or a calculation$/, () => 'Oculto necesita una fórmula o un cálculo.'],
  [/^invalid bound$/, () => 'El mínimo y el máximo son números y solo van en campos numéricos.'],
  [/^searchable is a boolean for short and number fields$/, () => 'Buscable solo vale para campos de texto corto o numéricos.'],
  [/^invalid sort$/, () => 'El orden no es válido.'],
  [/^sort by a column of the table$/, () => 'Ordená por una columna de la tabla.'],
  [/^direction must be asc or desc$/, () => 'Elegí ascendente o descendente.'],
  [/^a table declares 1 to 30 categories$/, () => 'Una tabla declara de 1 a 30 categorías de acciones.'],
  [/^invalid category$/, () => 'La categoría no es válida.'],
  [/^rewardDestination is a boolean$/, () => 'El destino de recompensa es sí o no.'],
  [/^only one table can be the reward destination$/, () => 'Solo una tabla puede ser el destino de recompensa.'],
  [/^only the coin table or an economy table can be the reward destination$/, () => 'Solo la tabla de monedas o una de economía puede ser el destino de recompensa.'],
  [/^sections required$/, () => 'La categoría necesita su lista de secciones.'],
  [/^items required$/, () => 'La sección necesita su lista de ítems.'],
  [/^blocks required$/, () => 'La sección necesita su lista de bloques.'],
  [/^too many sections$/, () => 'Hay demasiadas secciones (máximo 12 por categoría y 40 en total).'],
  [/^too many items$/, () => 'Hay demasiados ítems (máximo 60 por sección y 400 en total).'],
  [/^too many blocks$/, () => 'Hay demasiados bloques (máximo 60 por sección).'],
  [/^too many categories$/, () => 'Hay demasiadas categorías (máximo 12).'],
  [/^too many rows$/, () => 'Hay demasiadas filas (máximo 100, y 8 en monedas).'],
  [/^only Libre and Habilidad tables can be sorted$/, () => 'Solo las tablas Libre y Habilidad se ordenan.'],
  [/^only Habilidad tables declare categories$/, () => 'Solo las tablas de Habilidad declaran categorías de acciones.'],
  [/^invalid (item|section)$/, () => 'El elemento no es válido.'],
  [/^kind must be field or table$/, () => 'El ítem debe ser un campo o una tabla.'],
  [/^invalid table type$/, () => 'Tipo de tabla no válido.'],
  [/^modifier formula required$/, () => 'Falta la fórmula del modificador.'],
  [/^invalid row$/, () => 'La fila no es válida.'],
  [/^must be the key of a stat row$/, () => 'Elegí un stat de una tabla de stats.'],
  [/^use must be valor or modificador$/, () => 'Elegí si usa el valor o el modificador.'],
  [/^a table the player edits cannot hold a DM column$/, () => 'Una tabla que edita el jugador no puede tener columnas solo del DM.'],
  [/^an economy table holds amounts only$/, () => 'Una tabla de economía solo guarda cantidades: no lleva filas ni columnas.'],
  [/^an economy table is DM only$/, () => 'Una tabla de economía solo la edita el DM.'],
  [/^value must be an integer from 1 to 1e9$/, () => 'El valor es un entero de 1 a 1.000.000.000.'],
  [/^denomination values must differ$/, () => 'Los valores de las denominaciones deben ser distintos.'],
  [/^the smallest denomination must be worth 1$/, () => 'La denominación más chica debe valer 1.'],
  [/^only one coin table is allowed$/, () => 'Solo puede haber una tabla de monedas.'],
  [/^an economy table needs the coin table/, () => 'Una tabla de economía necesita la tabla de monedas que define las denominaciones.'],
  [/^invalid block$/, () => 'El bloque no es válido.'],
  [/^invalid mode$/, () => 'Modo no válido.'],
  [/^items must be keys$/, () => 'Los ítems del bloque no son válidos.'],
  [/^(.*) is not an item of this section$/, (m) => `«${m[1]}» no es un ítem de esta sección.`],
  [/^(.*) is already shown by another block$/, (m) => `«${m[1]}» ya lo muestra otro bloque.`],
  [/^mode (\w+) does not fit (.*)$/, (m) => `El modo ${m[1]} no sirve para «${m[2]}».`],
  [/^a modal block names the categories it filters$/, () => 'Un bloque modal necesita las categorías que muestra (de 1 a 20).'],
  [/^not a category of the table$/, () => 'No es una categoría de la tabla.'],
  [/^unknown reference \{(.*)\}$/, (m) => `La referencia {${m[1]}} no existe.`],
  [/^\{(.*)\} is a table, use it inside a table function$/, (m) => `{${m[1]}} es una tabla: usala dentro de una función de tabla.`],
  [/^\{(.*)\} is not a free, skill or coin table$/, (m) => `{${m[1]}} no es una tabla Libre, de Habilidad ni de monedas.`],
  [/^(.*) has no column "(.*)"$/, (m) => `La tabla ${m[1]} no tiene la columna "${m[2]}".`],
  [/^formulas reference each other in a cycle$/, () => 'Hay fórmulas que se referencian entre sí en círculo.'],
  [/^roles must be an object$/, () => 'Los roles no son válidos.'],
  [/^unknown role$/, () => 'Rol desconocido.'],
  [/^a role is bound to a number field$/, () => 'Un rol se asigna a un campo numérico.'],
  [/^a sheet needs at least one category$/, () => 'La plantilla necesita al menos una categoría.'],
]

/** The validator's message in Spanish; a message this table does not know is returned unchanged. */
export function sheetErrorEs(message: string): string {
  for (const [pattern, say] of SHEET_ERRORS) {
    const match = message.match(pattern)
    if (match) return say(match)
  }
  return message
}
