/**
 * Partidor de statements SQL consciente de literales, comentarios y bloques
 * BEGIN...END de trigger. Reemplaza el `sql.split(";")` ingenuo que tenía
 * tauri-sql-driver.ts: ese split rompía en cuanto una migración traía un ';'
 * dentro de un literal de texto ('a;b'), dentro de un comentario `-- rol:
 * admin; cajero`, o dentro del cuerpo de un CREATE TRIGGER. Vive en core (sin
 * depender de `@tauri-apps/plugin-sql`) para poder probarlo con vitest/node
 * sin cargar el plugin de escritorio.
 */
export function partirStatements(sql: string): string[] {
  const statements: string[] = [];
  let actual = "";
  let enCadena = false;
  let profundidadBloque = 0;
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i]!;

    if (enCadena) {
      if (c === "'" && sql[i + 1] === "'") {
        actual += "''";
        i += 2;
        continue;
      }
      if (c === "'") {
        enCadena = false;
      }
      actual += c;
      i++;
      continue;
    }

    if (c === "'") {
      enCadena = true;
      actual += c;
      i++;
      continue;
    }

    if (c === "-" && sql[i + 1] === "-") {
      const finLinea = sql.indexOf("\n", i);
      const fin = finLinea === -1 ? n : finLinea;
      actual += sql.slice(i, fin);
      i = fin;
      continue;
    }

    const resto = sql.slice(i);
    const inicioBegin = /^BEGIN\b/i.exec(resto);
    if (inicioBegin) {
      profundidadBloque++;
      actual += inicioBegin[0];
      i += inicioBegin[0].length;
      continue;
    }
    const inicioEnd = /^END\b/i.exec(resto);
    if (inicioEnd && profundidadBloque > 0) {
      profundidadBloque--;
      actual += inicioEnd[0];
      i += inicioEnd[0].length;
      continue;
    }

    if (c === ";" && profundidadBloque === 0) {
      const listo = actual.trim();
      if (listo.length > 0) statements.push(listo);
      actual = "";
      i++;
      continue;
    }

    actual += c;
    i++;
  }

  const cola = actual.trim();
  if (cola.length > 0) statements.push(cola);

  return statements;
}
