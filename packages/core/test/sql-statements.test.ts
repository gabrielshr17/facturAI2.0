import { describe, it, expect } from "vitest";
import { partirStatements } from "../src/db/sql-statements.js";

/**
 * partirStatements reemplaza el split(";") ingenuo de tauri-sql-driver.ts.
 * Vive en core (sin depender de @tauri-apps/plugin-sql) justo para poder
 * probarlo aquí con node:sqlite/vitest sin cargar el plugin de escritorio.
 */
describe("partirStatements", () => {
  it("no parte un ';' dentro de un literal de texto entre comillas simples", () => {
    const sql = "INSERT INTO x VALUES ('a;b')";
    expect(partirStatements(sql)).toEqual(["INSERT INTO x VALUES ('a;b')"]);
  });

  it("no genera un statement extra por un ';' dentro de un comentario '--'", () => {
    const sql = "-- rol: admin; cajero\nCREATE TABLE x (id TEXT);";
    expect(partirStatements(sql)).toEqual([
      "-- rol: admin; cajero\nCREATE TABLE x (id TEXT)",
    ]);
  });

  it("un CREATE TRIGGER con BEGIN ... ; ... END; sale como un único statement", () => {
    const sql = `
      CREATE TRIGGER trg_x AFTER INSERT ON x
      BEGIN
        UPDATE y SET n = n + 1;
        UPDATE z SET n = n - 1;
      END;
    `.trim();
    const partes = partirStatements(sql);
    expect(partes).toHaveLength(1);
    expect(partes[0]).toContain("UPDATE y SET n = n + 1;");
    expect(partes[0]).toContain("UPDATE z SET n = n - 1;");
  });

  it("parte statements normales separados por ';'", () => {
    const sql = "CREATE TABLE a (id TEXT); CREATE TABLE b (id TEXT);";
    expect(partirStatements(sql)).toEqual([
      "CREATE TABLE a (id TEXT)",
      "CREATE TABLE b (id TEXT)",
    ]);
  });

  it("ignora statements vacíos producidos por ';' finales o repetidos", () => {
    const sql = "CREATE TABLE a (id TEXT);;  ;\n";
    expect(partirStatements(sql)).toEqual(["CREATE TABLE a (id TEXT)"]);
  });

  it("respeta un apóstrofe escapado ('') dentro de un literal", () => {
    const sql = "INSERT INTO x VALUES ('O''Neil;caso')";
    expect(partirStatements(sql)).toEqual([sql]);
  });
});
