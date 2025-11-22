<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	let className: string | undefined = undefined;
	export { className as class };
	export let id: string | undefined = undefined;
</script>

<DialogPrimitive.Description
	id={id}
	class={cn('text-sm text-muted-foreground', className)}
>
	<slot />
</DialogPrimitive.Description>

