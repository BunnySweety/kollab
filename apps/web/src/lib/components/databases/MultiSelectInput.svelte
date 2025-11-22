<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { X } from 'lucide-svelte';

	export let value: string[] = [];
	export let options: string[] = [];
	export let placeholder = 'Select options...';
	export let disabled = false;
	export let id = '';
	export let error = '';

	let isOpen = false;
	let searchQuery = '';

	$: filteredOptions = options.filter(
		opt => !value.includes(opt) && opt.toLowerCase().includes(searchQuery.toLowerCase())
	);

	function toggleOption(option: string) {
		if (disabled) return;
		if (value.includes(option)) {
			value = value.filter(v => v !== option);
		} else {
			value = [...value, option];
		}
	}

	function removeOption(option: string) {
		if (disabled) return;
		value = value.filter(v => v !== option);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			isOpen = false;
		}
	}
</script>

<div class="relative">
	<div
		class="mt-1 min-h-[2.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 {error ? 'border-destructive' : ''}"
		role="combobox"
		aria-expanded={isOpen}
		aria-haspopup="listbox"
		{id}
	>
		<div class="flex flex-wrap gap-1.5">
			{#each value as option}
				<Badge variant="secondary" class="flex items-center gap-1 px-2 py-0.5">
					{option}
					{#if !disabled}
						<button
							type="button"
							class="ml-1 rounded-full hover:bg-destructive/20 focus:outline-none"
							on:click|stopPropagation={() => removeOption(option)}
							on:keydown={(e) => e.key === 'Enter' && removeOption(option)}
						>
							<X class="h-3 w-3" />
						</button>
					{/if}
				</Badge>
			{/each}
			<input
				type="text"
				class="flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
				placeholder={value.length === 0 ? placeholder : ''}
				bind:value={searchQuery}
				on:focus={() => (isOpen = true)}
				on:blur={() => setTimeout(() => (isOpen = false), 200)}
				on:keydown={handleKeydown}
				{disabled}
			/>
		</div>
	</div>

	{#if isOpen && filteredOptions.length > 0}
		<div
			class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
			role="listbox"
		>
			{#each filteredOptions as option}
				<button
					type="button"
					class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
					role="option"
					on:click={() => toggleOption(option)}
					on:keydown={(e) => e.key === 'Enter' && toggleOption(option)}
				>
					{option}
				</button>
			{/each}
		</div>
	{/if}

	{#if error}
		<p class="mt-1 text-xs text-destructive">{error}</p>
	{/if}
</div>

