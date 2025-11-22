<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { Button } from '../button';

	export let variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | undefined = 'default';
	export let disabled: boolean | undefined = undefined;
	let className: string | undefined = undefined;
	export { className as class };
</script>

<DialogPrimitive.Close asChild let:builder>
	<Button builders={[builder]} {variant} {disabled} class={className}>
		<slot />
	</Button>
</DialogPrimitive.Close>

