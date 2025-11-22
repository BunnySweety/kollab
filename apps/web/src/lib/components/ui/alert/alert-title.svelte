<script lang="ts">
	import { cn } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';
</script>

<h5
	class={cn('mb-1 font-medium leading-none tracking-tight', $$props.class)}
	{...$$restProps}
>
	<slot />
</h5>