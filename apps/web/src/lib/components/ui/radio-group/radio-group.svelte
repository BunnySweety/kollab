<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	export let value: string | undefined = undefined;

	let className: string | undefined = undefined;
	export { className as class };
</script>

<RadioGroupPrimitive.Root
	bind:value
	class={cn('grid gap-2', className)}
	{...$$restProps}
>
	<slot />
</RadioGroupPrimitive.Root>