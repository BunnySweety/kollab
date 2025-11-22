<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';
	import { ChevronDown } from 'lucide-svelte';

	export let value: string | undefined = undefined;
	export let placeholder = 'Select an option';
	export let disabled = false;

	let className: string | undefined = undefined;
	export { className as class };
</script>

<SelectPrimitive.Root bind:value {disabled}>
	<SelectPrimitive.Trigger
		class={cn(
			'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		{...$$restProps}
	>
		<SelectPrimitive.Value {placeholder} />
		<ChevronDown class="h-4 w-4 opacity-50" />
	</SelectPrimitive.Trigger>
	<SelectPrimitive.Content
		class="relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-80 p-1"
	>
		<slot />
	</SelectPrimitive.Content>
</SelectPrimitive.Root>