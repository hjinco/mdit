import { z } from "zod"
import type { createSyncRepository } from "./repository"

const vaultRoleSchema = z.enum(["owner", "editor", "viewer"])

type SyncRepository = ReturnType<typeof createSyncRepository>
type SyncErrorBody = {
	code: string
	message?: string
	currentHeadCommitId?: string | null
}

export class SyncServiceError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: SyncErrorBody,
	) {
		super(typeof body.code === "string" ? body.code : "SYNC_SERVICE_ERROR")
	}
}

const canWriteRole = (role: z.infer<typeof vaultRoleSchema>): boolean =>
	role === "owner" || role === "editor"

const decodeBase64 = (value: string): Uint8Array =>
	Uint8Array.from(atob(value), (char) => char.charCodeAt(0))

export function createSyncService(repository: SyncRepository) {
	const requireActiveMembership = async (vaultId: string, userId: string) => {
		const membership = await repository.findActiveVaultMember(vaultId, userId)
		if (!membership) {
			throw new SyncServiceError(404, { code: "NOT_FOUND" })
		}
		return membership
	}

	const requireWriterMembership = async (vaultId: string, userId: string) => {
		const membership = await requireActiveMembership(vaultId, userId)
		if (!canWriteRole(vaultRoleSchema.parse(membership.role))) {
			throw new SyncServiceError(403, { code: "FORBIDDEN" })
		}
		return membership
	}

	return {
		async createVault(input: {
			vaultId: string
			currentKeyVersion?: number
			userId: string
		}) {
			const existingVault = await repository.findVaultById(input.vaultId)
			if (existingVault) {
				await requireActiveMembership(input.vaultId, input.userId)
				return {
					vaultId: existingVault.id,
					currentHeadCommitId: existingVault.currentHeadCommitId ?? null,
					currentKeyVersion:
						existingVault.currentKeyVersion ?? input.currentKeyVersion ?? 1,
					created: false,
				}
			}

			await repository.createVault({
				vaultId: input.vaultId,
				currentKeyVersion: input.currentKeyVersion ?? 1,
			})

			await repository.upsertVaultOwnerMember({
				vaultId: input.vaultId,
				userId: input.userId,
			})

			const vault = await repository.findVaultById(input.vaultId)
			return {
				vaultId: input.vaultId,
				currentHeadCommitId: vault?.currentHeadCommitId ?? null,
				currentKeyVersion:
					vault?.currentKeyVersion ?? input.currentKeyVersion ?? 1,
				created: true,
			}
		},

		async getVaultHead(input: { vaultId: string; userId: string }) {
			const membership = await requireActiveMembership(
				input.vaultId,
				input.userId,
			)
			const vault = await repository.findVaultById(input.vaultId)
			if (!vault) {
				throw new SyncServiceError(404, { code: "NOT_FOUND" })
			}

			return {
				vaultId: vault.id,
				currentHeadCommitId: vault.currentHeadCommitId,
				currentKeyVersion: vault.currentKeyVersion,
				role: membership.role,
				membershipStatus: membership.status,
			}
		},

		async uploadBlob(input: {
			vaultId: string
			userId: string
			blobId: string
			kind: "file" | "manifest"
			ciphertextHash: string
			ciphertextBase64: string
			nonceBase64: string
			ciphertextSize: number
		}) {
			await requireWriterMembership(input.vaultId, input.userId)

			if (input.blobId !== input.ciphertextHash) {
				throw new SyncServiceError(400, {
					code: "INVALID_BLOB_ID",
					message: "blobId must equal ciphertextHash",
				})
			}

			const ciphertext = decodeBase64(input.ciphertextBase64)
			if (ciphertext.byteLength !== input.ciphertextSize) {
				throw new SyncServiceError(400, {
					code: "INVALID_BLOB_SIZE",
					message: "ciphertextSize does not match decoded payload length",
				})
			}

			const existingBlob = await repository.findBlob(
				input.vaultId,
				input.blobId,
			)
			if (!existingBlob) {
				await repository.putBlobEnvelope(input.vaultId, input.blobId, {
					ciphertextBase64: input.ciphertextBase64,
					nonceBase64: input.nonceBase64,
				})

				await repository.createBlob({
					vaultId: input.vaultId,
					blobId: input.blobId,
					kind: input.kind,
					size: input.ciphertextSize,
					ciphertextHash: input.ciphertextHash,
				})
			}

			return {
				vaultId: input.vaultId,
				blobId: input.blobId,
				kind: input.kind,
				existed: Boolean(existingBlob),
			}
		},

		async getBlob(input: { vaultId: string; blobId: string; userId: string }) {
			await requireActiveMembership(input.vaultId, input.userId)

			const blob = await repository.findBlob(input.vaultId, input.blobId)
			if (!blob) {
				throw new SyncServiceError(404, { code: "NOT_FOUND" })
			}

			const envelope = await repository.getBlobEnvelope(
				input.vaultId,
				input.blobId,
			)
			if (!envelope) {
				throw new SyncServiceError(404, { code: "BLOB_OBJECT_NOT_FOUND" })
			}

			return {
				vaultId: input.vaultId,
				blobId: input.blobId,
				kind: blob.kind,
				ciphertextHash: blob.ciphertextHash,
				ciphertextBase64: envelope.ciphertextBase64,
				nonceBase64: envelope.nonceBase64,
				ciphertextSize: blob.size,
			}
		},

		async createCommit(input: {
			vaultId: string
			userId: string
			commitId: string
			baseCommitId: string | null
			manifestBlobId: string
			manifestCiphertextHash: string
			createdByDeviceId: string
			keyVersion: number
			signature: string
			createdAt: number
		}) {
			await requireWriterMembership(input.vaultId, input.userId)

			const manifestBlob = await repository.findManifestBlob(
				input.vaultId,
				input.manifestBlobId,
			)
			if (!manifestBlob) {
				throw new SyncServiceError(400, { code: "MANIFEST_BLOB_NOT_FOUND" })
			}

			await repository.createCommit({
				commitId: input.commitId,
				vaultId: input.vaultId,
				baseCommitId: input.baseCommitId,
				manifestBlobId: input.manifestBlobId,
				manifestCiphertextHash: input.manifestCiphertextHash,
				createdByUserId: input.userId,
				createdByDeviceId: input.createdByDeviceId,
				keyVersion: input.keyVersion,
				signature: input.signature,
				createdAt: new Date(input.createdAt),
			})

			const updated = await repository.updateVaultHead({
				vaultId: input.vaultId,
				baseCommitId: input.baseCommitId,
				nextCommitId: input.commitId,
				keyVersion: input.keyVersion,
			})
			if (!updated) {
				const vault = await repository.findVaultById(input.vaultId)
				throw new SyncServiceError(409, {
					code: "HEAD_CONFLICT",
					currentHeadCommitId: vault?.currentHeadCommitId ?? null,
				})
			}

			return {
				vaultId: input.vaultId,
				commitId: input.commitId,
				currentHeadCommitId: input.commitId,
				currentKeyVersion: input.keyVersion,
			}
		},

		async getCommit(input: {
			vaultId: string
			commitId: string
			userId: string
		}) {
			await requireActiveMembership(input.vaultId, input.userId)

			const commit = await repository.findCommit(input.vaultId, input.commitId)
			if (!commit) {
				throw new SyncServiceError(404, { code: "NOT_FOUND" })
			}

			return {
				vaultId: input.vaultId,
				commitId: commit.id,
				baseCommitId: commit.baseCommitId,
				manifestBlobId: commit.manifestBlobId,
				manifestCiphertextHash: commit.manifestCiphertextHash,
				createdByUserId: commit.createdByUserId,
				createdByDeviceId: commit.createdByDeviceId,
				keyVersion: commit.keyVersion,
				signature: commit.signature,
				createdAt: commit.createdAt.getTime(),
			}
		},
	}
}
