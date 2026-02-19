import { CaptionPlugin } from "@platejs/caption/react"
import {
	AudioPlugin,
	FilePlugin,
	ImagePlugin,
	MediaEmbedPlugin,
	VideoPlugin,
} from "@platejs/media/react"
import { KEYS } from "platejs"

import { AudioElement } from "../ui/node-media-audio"
import { MediaEmbedElement } from "../ui/node-media-embed"
import { FileElement } from "../ui/node-media-file"
import { ImageElement } from "../ui/node-media-image"
import { VideoElement } from "../ui/node-media-video"

export const MediaKit = [
	ImagePlugin.configure({
		options: { disableUploadInsert: true },
		render: { node: ImageElement },
	}),
	MediaEmbedPlugin.withComponent(MediaEmbedElement),
	VideoPlugin.withComponent(VideoElement),
	AudioPlugin.withComponent(AudioElement),
	FilePlugin.withComponent(FileElement),
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
