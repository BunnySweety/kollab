<script lang="ts">
	import { theme } from '$lib/stores/theme';
	import { Sun, Moon, Monitor } from 'lucide-svelte';
	import type { Theme } from '$lib/stores/theme';

	let isOpen = false;
	let currentTheme: Theme = 'system';

	theme.subscribe(value => {
		currentTheme = value;
	});

	function selectTheme(newTheme: Theme) {
		theme.set(newTheme);
		isOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			isOpen = false;
		}
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.theme-switcher')) {
			isOpen = false;
		}
	}

	$: icon = currentTheme === 'light' ? Sun : currentTheme === 'dark' ? Moon : Monitor;
	$: label = currentTheme === 'light' ? 'Light' : currentTheme === 'dark' ? 'Dark' : 'System';
</script>

<svelte:window on:keydown={handleKeydown} on:click={handleClickOutside} />

<div class="relative theme-switcher">
	<button
		class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
		on:click={() => isOpen = !isOpen}
		aria-label="Toggle theme"
	>
		<svelte:component this={icon} class="w-4 h-4" />
		<span class="hidden sm:inline">{label}</span>
	</button>

	{#if isOpen}
		<div class="absolute right-0 mt-2 w-36 bg-popover border rounded-lg shadow-lg p-1 z-50">
			<button
				class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors {currentTheme === 'light' ? 'bg-accent' : ''}"
				on:click={() => selectTheme('light')}
			>
				<Sun class="w-4 h-4" />
				<span>Light</span>
			</button>
			<button
				class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors {currentTheme === 'dark' ? 'bg-accent' : ''}"
				on:click={() => selectTheme('dark')}
			>
				<Moon class="w-4 h-4" />
				<span>Dark</span>
			</button>
			<button
				class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors {currentTheme === 'system' ? 'bg-accent' : ''}"
				on:click={() => selectTheme('system')}
			>
				<Monitor class="w-4 h-4" />
				<span>System</span>
			</button>
		</div>
	{/if}
</div>

<style>
	.theme-switcher {
		user-select: none;
	}
</style>