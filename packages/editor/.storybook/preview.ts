/// <reference path="../src/css.d.ts" />
import type { Preview } from "@storybook/react-vite"
import "../stories/storybook.css"

const preview: Preview = {
	parameters: {
		layout: "fullscreen",
	},
}

export default preview
