<script lang="ts">
	export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
	export let showText = true;
	export let className = '';

	const sizes = {
		sm: { icon: 32, text: 20 },
		md: { icon: 40, text: 24 },
		lg: { icon: 48, text: 32 },
		xl: { icon: 64, text: 40 }
	};

	$: iconSize = sizes[size].icon;
	$: textSize = sizes[size].text;
</script>

<div class="flex items-center gap-2 {className}">
	<!-- Logo Icon -->
	<svg
		width={iconSize}
		height={iconSize}
		viewBox="0 0 64 64"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		class="flex-shrink-0"
	>
		<!-- Background -->
		<rect
			width="64"
			height="64"
			rx="16"
			fill="url(#kollabGradient)"
		/>

		<!-- K Letter with connections -->
		<path
			d="M 18 20 L 18 44 M 18 32 L 34 20 M 18 32 L 34 44"
			stroke="white"
			stroke-width="4"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>

		<!-- Connection dots -->
		<circle cx="18" cy="20" r="3" fill="white" opacity="0.9" />
		<circle cx="18" cy="44" r="3" fill="white" opacity="0.9" />
		<circle cx="34" cy="20" r="3" fill="white" opacity="0.9" />
		<circle cx="34" cy="44" r="3" fill="white" opacity="0.9" />

		<!-- Collaboration lines -->
		<path
			d="M 40 26 L 46 32 L 40 38"
			stroke="white"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			opacity="0.7"
		/>
		<circle cx="46" cy="32" r="2" fill="white" opacity="0.7" />

		<!-- Gradient Definition -->
		<defs>
			<linearGradient id="kollabGradient" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" style="stop-color:#8B5CF6" /> <!-- Purple -->
				<stop offset="100%" style="stop-color:#3B82F6" /> <!-- Blue -->
			</linearGradient>
		</defs>
	</svg>

	<!-- Logo Text -->
	{#if showText}
		<span
			class="font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent"
			style="font-size: {textSize}px;"
		>
			Kollab
		</span>
	{/if}
</div>