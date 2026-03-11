import { and, eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import * as schema from "./db/schema"

export const getDb = (env: Env) => drizzle(env.DB, { schema })

export type SyncDatabase = ReturnType<typeof getDb>

type BlobEnvelope = {
	ciphertextBase64: string
	nonceBase64: string
}

export function createSyncRepository(input: {
	db: SyncDatabase
	bucket: Env["BUCKET"]
}) {
	const { db, bucket } = input

	return {
		findVaultById(vaultId: string) {
			return db.query.syncVault.findFirst({
				where: eq(schema.syncVault.id, vaultId),
			})
		},

		createVault(input: { vaultId: string; currentKeyVersion: number }) {
			return db.insert(schema.syncVault).values({
				id: input.vaultId,
				currentKeyVersion: input.currentKeyVersion,
			})
		},

		findActiveVaultMember(vaultId: string, userId: string) {
			return db.query.syncVaultMember.findFirst({
				where: and(
					eq(schema.syncVaultMember.vaultId, vaultId),
					eq(schema.syncVaultMember.userId, userId),
					eq(schema.syncVaultMember.status, "active"),
				),
			})
		},

		upsertVaultOwnerMember(input: { vaultId: string; userId: string }) {
			return db
				.insert(schema.syncVaultMember)
				.values({
					vaultId: input.vaultId,
					userId: input.userId,
					role: "owner",
					status: "active",
				})
				.onConflictDoUpdate({
					target: [
						schema.syncVaultMember.vaultId,
						schema.syncVaultMember.userId,
					],
					set: {
						role: "owner",
						status: "active",
						updatedAt: new Date(),
					},
				})
		},

		findBlob(vaultId: string, blobId: string) {
			return db.query.syncBlob.findFirst({
				where: and(
					eq(schema.syncBlob.vaultId, vaultId),
					eq(schema.syncBlob.blobId, blobId),
				),
			})
		},

		findManifestBlob(vaultId: string, blobId: string) {
			return db.query.syncBlob.findFirst({
				where: and(
					eq(schema.syncBlob.vaultId, vaultId),
					eq(schema.syncBlob.blobId, blobId),
					eq(schema.syncBlob.kind, "manifest"),
				),
			})
		},

		createBlob(input: {
			vaultId: string
			blobId: string
			kind: "file" | "manifest"
			size: number
			ciphertextHash: string
		}) {
			return db.insert(schema.syncBlob).values(input)
		},

		putBlobEnvelope(vaultId: string, blobId: string, envelope: BlobEnvelope) {
			return bucket.put(
				`blobs/${vaultId}/${blobId}`,
				JSON.stringify(envelope),
				{
					httpMetadata: { contentType: "application/json" },
				},
			)
		},

		async getBlobEnvelope(vaultId: string, blobId: string) {
			const object = await bucket.get(`blobs/${vaultId}/${blobId}`)
			if (!object) {
				return null
			}

			return (await object.json()) as BlobEnvelope
		},

		createCommit(input: {
			commitId: string
			vaultId: string
			baseCommitId: string | null
			manifestBlobId: string
			manifestCiphertextHash: string
			createdByUserId: string
			createdByDeviceId: string
			keyVersion: number
			signature: string
			createdAt: Date
		}) {
			return db.insert(schema.syncCommit).values({
				id: input.commitId,
				vaultId: input.vaultId,
				baseCommitId: input.baseCommitId,
				manifestBlobId: input.manifestBlobId,
				manifestCiphertextHash: input.manifestCiphertextHash,
				createdByUserId: input.createdByUserId,
				createdByDeviceId: input.createdByDeviceId,
				keyVersion: input.keyVersion,
				signature: input.signature,
				createdAt: input.createdAt,
			})
		},

		findCommit(vaultId: string, commitId: string) {
			return db.query.syncCommit.findFirst({
				where: and(
					eq(schema.syncCommit.vaultId, vaultId),
					eq(schema.syncCommit.id, commitId),
				),
			})
		},

		async updateVaultHead(input: {
			vaultId: string
			baseCommitId: string | null
			nextCommitId: string
			keyVersion: number
		}) {
			const result =
				input.baseCommitId === null
					? await db
							.update(schema.syncVault)
							.set({
								currentHeadCommitId: input.nextCommitId,
								currentKeyVersion: input.keyVersion,
								updatedAt: new Date(),
							})
							.where(
								and(
									eq(schema.syncVault.id, input.vaultId),
									sql`${schema.syncVault.currentHeadCommitId} IS NULL`,
								),
							)
					: await db
							.update(schema.syncVault)
							.set({
								currentHeadCommitId: input.nextCommitId,
								currentKeyVersion: input.keyVersion,
								updatedAt: new Date(),
							})
							.where(
								and(
									eq(schema.syncVault.id, input.vaultId),
									eq(schema.syncVault.currentHeadCommitId, input.baseCommitId),
								),
							)

			return Number(result.meta.changes ?? 0) > 0
		},
	}
}
