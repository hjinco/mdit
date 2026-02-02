import {
  blob,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const documents = sqliteTable('doc', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  relPath: text('rel_path').notNull().unique(),
  chunkingVersion: integer('chunking_version').notNull(),
  lastHash: text('last_hash').notNull(),
  lastLinkHash: text('last_link_hash').notNull().default(''),
  lastEmbeddingModel: text('last_embedding_model').notNull(),
  lastEmbeddingDim: integer('last_embedding_dim').notNull(),
})

export const segments = sqliteTable(
  'segment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    docId: integer('doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(), // 0..N-1
    lastHash: text('last_hash').notNull(),
  },
  (t) => [uniqueIndex('uniq_seg_doc_ord').on(t.docId, t.ordinal)]
)

export const embeddings = sqliteTable('embedding', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  segmentId: integer('segment_id')
    .notNull()
    .references(() => segments.id, { onDelete: 'cascade' })
    .unique(),
  model: text('model').notNull(),
  dim: integer('dim').notNull(),
  vec: blob('vec').notNull().$type<Uint8Array>(), // Float32Array bytes (LE)
})

export const links = sqliteTable(
  'link',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceDocId: integer('source_doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    targetDocId: integer('target_doc_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    targetPath: text('target_path').notNull(),
    targetAnchor: text('target_anchor'),
    alias: text('alias'),
    isEmbed: integer('is_embed').notNull(),
    isWiki: integer('is_wiki').notNull(),
    isExternal: integer('is_external').notNull(),
  },
  (t) => [
    index('idx_link_source').on(t.sourceDocId),
    index('idx_link_target').on(t.targetDocId),
    index('idx_link_target_path').on(t.targetPath),
  ]
)
