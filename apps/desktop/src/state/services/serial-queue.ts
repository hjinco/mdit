export const createSerialQueue = () => {
	let tail: Promise<unknown> = Promise.resolve()

	return <Result>(run: () => Promise<Result>): Promise<Result> => {
		const result = tail.then(run)
		tail = result.catch(() => undefined)
		return result
	}
}
