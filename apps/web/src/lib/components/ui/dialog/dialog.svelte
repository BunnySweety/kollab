<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';

	export let open = false;
	export let onOpenChange: ((open: boolean) => void) | undefined = undefined;

	function handleOpenChange(newOpen: boolean) {
		open = newOpen;
		onOpenChange?.(newOpen);
	}
</script>

<DialogPrimitive.Root bind:open={open} onOpenChange={handleOpenChange}>
	<slot />
</DialogPrimitive.Root>

