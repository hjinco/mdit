export type BrowserStorageLike = Pick<
	Storage,
	"getItem" | "setItem" | "removeItem"
>
