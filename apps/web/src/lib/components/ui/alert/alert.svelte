<script lang="ts">
	import { cn } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';

	type Variant = 'default' | 'destructive';

	interface $$Props extends HTMLAttributes<HTMLDivElement> {
		variant?: Variant;
	}

	export let variant: Variant = 'default';

	const variantStyles = {
		default: 'bg-background text-foreground',
		destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive'
	};
</script>

<div
	role="alert"
	class={cn(
		'relative w-full rounded-lg border p-4',
		variantStyles[variant],
		$$props.class
	)}
	{...$$restProps}
>
	<slot />
</div>