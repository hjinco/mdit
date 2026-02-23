export function Logo({ className }: { className?: string }) {
	return (
		<svg
			width="100%"
			height="100%"
			viewBox="0 0 432 432"
			fill="none"
			className={className}
			xmlns="http://www.w3.org/2000/svg"
		>
			<g filter="url(#filter0_g_102_47)">
				<rect
					x="36"
					y="36"
					width="360"
					height="360"
					rx="180"
					fill="url(#paint0_radial_102_47)"
				/>
			</g>
			<defs>
				<filter
					id="filter0_g_102_47"
					x="0"
					y="0"
					width="432"
					height="432"
					filterUnits="userSpaceOnUse"
					color-interpolation-filters="sRGB"
				>
					<feFlood flood-opacity="0" result="BackgroundImageFix" />
					<feBlend
						mode="normal"
						in="SourceGraphic"
						in2="BackgroundImageFix"
						result="shape"
					/>
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.02083333395421505 0.02083333395421505"
						numOctaves="3"
						seed="295"
					/>
					<feDisplacementMap
						in="shape"
						scale="72"
						xChannelSelector="R"
						yChannelSelector="G"
						result="displacedImage"
						width="100%"
						height="100%"
					/>
					<feMerge result="effect1_texture_102_47">
						<feMergeNode in="displacedImage" />
					</feMerge>
				</filter>
				<radialGradient
					id="paint0_radial_102_47"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="translate(216 216) scale(180)"
				>
					<stop />
					<stop offset="1" stop-color="#444444" />
				</radialGradient>
			</defs>
		</svg>
	)
}
