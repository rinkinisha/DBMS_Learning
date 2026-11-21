export function buildSampleSelectQuery(tableName: string): string {
  return `SELECT * FROM ${tableName};`;
}
