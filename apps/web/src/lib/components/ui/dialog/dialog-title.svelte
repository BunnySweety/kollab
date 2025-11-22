<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	let className: string | undefined = undefined;
	export { className as class };
	export let id: string | undefined = undefined;
</script>

<DialogPrimitive.Title
	id={id}
	class={cn('text-lg font-semibold leading-none tracking-tight', className)}
>
	<slot />
</DialogPrimitive.Title>

