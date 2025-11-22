<script lang="ts">
	import { Avatar as AvatarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	export let src: string;
	export let alt: string = '';

	let className: string | undefined = undefined;
	export { className as class };
</script>

<AvatarPrimitive.Image
	{src}
	{alt}
	class={cn('aspect-square h-full w-full', className)}
	{...$$restProps}
/>