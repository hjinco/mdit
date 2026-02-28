import { CaptionPlugin } from "@platejs/caption/react"
import {
	// AudioPlugin,
	// FilePlugin,
	ImagePlugin,
	// MediaEmbedPlugin,
	// VideoPlugin,
} from "@platejs/media/react"
import { KEYS } from "platejs"
import {
	createImageElement,
	type MediaImageHostDeps,
} from "../nodes/node-media-image"

// import { AudioElement } from "../nodes/node-media-audio"
// import { MediaEmbedElement } from "../nodes/node-media-embed"
// import { FileElement } from "../nodes/node-media-file"
// import { VideoElement } from "../nodes/node-media-video"

export type MediaHostDeps = MediaImageHostDeps

export const createMediaKit = ({ host }: { host: MediaHostDeps }) => [
	ImagePlugin.configure({
		options: { disableUploadInsert: true },
		render: { node: createImageElement(host) },
	}),
	// MediaEmbedPlugin.withComponent(MediaEmbedElement),
	// VideoPlugin.withComponent(VideoElement),
	// AudioPlugin.withComponent(AudioElement),
	// FilePlugin.withComponent(FileElement),
	// PlaceholderPlugin.configure({
	//   options: { disableEmptyPlaceholder: true },
	//   render: { afterEditable: MediaUploadToast, node: PlaceholderElement },
	// }),
	CaptionPlugin.configure({
		options: {
			query: {
				allow: [KEYS.img, KEYS.video, KEYS.audio, KEYS.file, KEYS.mediaEmbed],
			},
		},
	}),
]
