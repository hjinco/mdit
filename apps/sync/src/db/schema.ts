import { relations, sql } from "drizzle-orm"
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core"

const authUser = sqliteTable("user", {
	id: text("id").primaryKey(),
})

export const syncVault = sqliteTable("sync_vault", {
	id: text("id").primaryKey(),
	currentHeadCommitId: text("current_head_commit_id"),
	currentKeyVersion: integer("current_key_version").default(1).notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
})

export const syncVaultMember = sqliteTable(
	"sync_vault_member",
	{
		vaultId: text("vault_id")
			.notNull()
			.references(() => syncVault.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => authUser.id, { onDelete: "cascade" }),
		role: text("role").notNull(),
		status: text("status").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.vaultId, table.userId] }),
		index("sync_vault_member_user_id_idx").on(table.userId),
	],
)

export const syncBlob = sqliteTable(
	"sync_blob",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		vaultId: text("vault_id")
			.notNull()
			.references(() => syncVault.id, { onDelete: "cascade" }),
		blobId: text("blob_id").notNull(),
		kind: text("kind").notNull(),
		size: integer("size").notNull(),
		ciphertextHash: text("ciphertext_hash").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("sync_blob_vault_blob_id_unique").on(
			table.vaultId,
			table.blobId,
		),
		index("sync_blob_vault_id_idx").on(table.vaultId),
	],
)

export const syncCommit = sqliteTable(
	"sync_commit",
	{
		id: text("id").primaryKey(),
		vaultId: text("vault_id")
			.notNull()
			.references(() => syncVault.id, { onDelete: "cascade" }),
		baseCommitId: text("base_commit_id"),
		manifestBlobId: text("manifest_blob_id").notNull(),
		manifestCiphertextHash: text("manifest_ciphertext_hash").notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => authUser.id, { onDelete: "cascade" }),
		createdByDeviceId: text("created_by_device_id").notNull(),
		keyVersion: integer("key_version").notNull(),
		signature: text("signature").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("sync_commit_vault_id_idx").on(table.vaultId),
		index("sync_commit_created_by_user_id_idx").on(table.createdByUserId),
	],
)

export const syncVaultRelations = relations(syncVault, ({ many }) => ({
	members: many(syncVaultMember),
	blobs: many(syncBlob),
	commits: many(syncCommit),
}))

export const syncVaultMemberRelations = relations(
	syncVaultMember,
	({ one }) => ({
		vault: one(syncVault, {
			fields: [syncVaultMember.vaultId],
			references: [syncVault.id],
		}),
		user: one(authUser, {
			fields: [syncVaultMember.userId],
			references: [authUser.id],
		}),
	}),
)

export const syncBlobRelations = relations(syncBlob, ({ one }) => ({
	vault: one(syncVault, {
		fields: [syncBlob.vaultId],
		references: [syncVault.id],
	}),
}))

export const syncCommitRelations = relations(syncCommit, ({ one }) => ({
	vault: one(syncVault, {
		fields: [syncCommit.vaultId],
		references: [syncVault.id],
	}),
	user: one(authUser, {
		fields: [syncCommit.createdByUserId],
		references: [authUser.id],
	}),
}))
