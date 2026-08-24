/** Re-export fund DDL builders for the provision/compare scripts. */
export {
  addChunksFkSql,
  addFundCheckSql,
  assertNoAnnOrPartitionSql,
  copyChunksSql,
  copyDocumentsSql,
  copyEventsSql,
  countTableSql,
  createChunksLikeSql,
  createDocumentsLikeSql,
  createEventsLikeSql,
  createSchemaSql,
  publicCorpusTablesSql,
  truncateFundTablesSql,
} from "@wunderstack/db";
