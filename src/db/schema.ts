import {
  blob,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const documents = sqliteTable('doc', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  relPath: text('rel_path').notNull().unique(),
})

export const segments = sqliteTable(
  'segment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    docId: integer('doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(), // 0..N-1
    lastHash: text('last_hash'),
  },
  (t) => [uniqueIndex('uniq_seg_doc_ord').on(t.docId, t.ordinal)]
)

export const embeddings = sqliteTable('embedding', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  segmentId: integer('segment_id')
    .notNull()
    .references(() => segments.id, { onDelete: 'cascade' })
    .unique(),
  dim: integer('dim').notNull(),
  vec: blob('vec').notNull().$type<Uint8Array>(), // Float32Array bytes (LE)
})

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // 'embedding_model', 'embedding_dim', 'chunking_version', etc.
})
