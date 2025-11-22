<script lang="ts">
	import { cn } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';
</script>

<div
	class={cn('text-sm [&_p]:leading-relaxed', $$props.class)}
	{...$$restProps}
>
	<slot />
</div>