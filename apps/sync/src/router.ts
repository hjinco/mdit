import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { z } from "zod"
import { authMiddleware, type VerifiedAuthSession } from "./middlewares/auth"
import { createSyncRepository, getDb } from "./repository"
import { createSyncService } from "./service"

type SyncAppEnv = {
	Bindings: Env
	Variables: {
		session: VerifiedAuthSession
		service: ReturnType<typeof createSyncService>
	}
}

export const router = new Hono<SyncAppEnv>()
export const syncRouter = router

router.use("*", authMiddleware)

router.use("*", async (c, next) => {
	c.set(
		"service",
		createSyncService(
			createSyncRepository({
				db: getDb(c.env),
				bucket: c.env.BUCKET,
			}),
		),
	)
	await next()
})

router.post(
	"/vaults",
	zValidator(
		"json",
		z.object({
			vaultId: z.string().min(1),
			currentKeyVersion: z.number().int().positive().optional(),
		}),
	),
	async (c) => {
		const {
			service,
			session: { userId },
		} = c.var
		const body = c.req.valid("json")
		return c.json(
			await service.createVault({
				vaultId: body.vaultId,
				currentKeyVersion: body.currentKeyVersion,
				userId,
			}),
		)
	},
)

router.get("/vaults/:vaultId/head", async (c) => {
	const {
		service,
		session: { userId },
	} = c.var
	const vaultId = c.req.param("vaultId")
	return c.json(await service.getVaultHead({ vaultId, userId }))
})

router.post(
	"/vaults/:vaultId/blobs",
	zValidator(
		"json",
		z.object({
			blobId: z.string().min(1),
			kind: z.enum(["file", "manifest"]),
			ciphertextHash: z.string().min(1),
			ciphertextBase64: z.string().min(1),
			nonceBase64: z.string().min(1),
			ciphertextSize: z.number().int().nonnegative(),
		}),
	),
	async (c) => {
		const {
			service,
			session: { userId },
		} = c.var
		const vaultId = c.req.param("vaultId")
		const body = c.req.valid("json")
		return c.json(
			await service.uploadBlob({
				vaultId,
				userId,
				blobId: body.blobId,
				kind: body.kind,
				ciphertextHash: body.ciphertextHash,
				ciphertextBase64: body.ciphertextBase64,
				nonceBase64: body.nonceBase64,
				ciphertextSize: body.ciphertextSize,
			}),
		)
	},
)

router.get("/vaults/:vaultId/blobs/:blobId", async (c) => {
	const {
		service,
		session: { userId },
	} = c.var
	const vaultId = c.req.param("vaultId")
	const blobId = c.req.param("blobId")
	return c.json(await service.getBlob({ vaultId, blobId, userId }))
})

router.post(
	"/vaults/:vaultId/commits",
	zValidator(
		"json",
		z.object({
			commitId: z.string().min(1),
			baseCommitId: z.string().min(1).nullable(),
			manifestBlobId: z.string().min(1),
			manifestCiphertextHash: z.string().min(1),
			createdByDeviceId: z.string().min(1),
			keyVersion: z.number().int().positive(),
			signature: z.string().min(1),
			createdAt: z.number().int().nonnegative(),
		}),
	),
	async (c) => {
		const {
			service,
			session: { userId },
		} = c.var
		const vaultId = c.req.param("vaultId")
		const body = c.req.valid("json")
		return c.json(
			await service.createCommit({
				vaultId,
				userId,
				commitId: body.commitId,
				baseCommitId: body.baseCommitId,
				manifestBlobId: body.manifestBlobId,
				manifestCiphertextHash: body.manifestCiphertextHash,
				createdByDeviceId: body.createdByDeviceId,
				keyVersion: body.keyVersion,
				signature: body.signature,
				createdAt: body.createdAt,
			}),
		)
	},
)

router.get("/vaults/:vaultId/commits/:commitId", async (c) => {
	const {
		service,
		session: { userId },
	} = c.var
	const vaultId = c.req.param("vaultId")
	const commitId = c.req.param("commitId")
	return c.json(await service.getCommit({ vaultId, commitId, userId }))
})
