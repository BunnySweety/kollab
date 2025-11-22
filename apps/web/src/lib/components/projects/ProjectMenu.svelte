<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Eye, Pencil, UserPlus, Archive, ArchiveRestore, Trash2 } from 'lucide-svelte';
	import type { Project } from '$lib/services/project-service';

	export let project: Project;
	export let isArchived = false;

	const dispatch = createEventDispatcher<{
		action: 'edit' | 'share' | 'archive' | 'unarchive' | 'delete' | 'open';
	}>();

	function handleAction(action: 'edit' | 'share' | 'archive' | 'unarchive' | 'delete' | 'open') {
		dispatch('action', action);
	}
</script>

<button
	class="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 rounded-t-lg"
	on:click|stopPropagation={() => handleAction('open')}
>
	<Eye class="h-4 w-4" />
	Ouvrir
</button>
{#if !isArchived}
	<button
		class="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
		on:click|stopPropagation={() => handleAction('edit')}
	>
		<Pencil class="h-4 w-4" />
		Modifier
	</button>
	<button
		class="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
		on:click|stopPropagation={() => handleAction('share')}
	>
		<UserPlus class="h-4 w-4" />
		Partager
	</button>
	<button
		class="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
		on:click|stopPropagation={() => handleAction('archive')}
	>
		<Archive class="h-4 w-4" />
		Archiver
	</button>
{:else}
	<button
		class="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
		on:click|stopPropagation={() => handleAction('unarchive')}
	>
		<ArchiveRestore class="h-4 w-4" />
		Restaurer
	</button>
{/if}
<div class="border-t my-1"></div>
<button
	class="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 text-destructive rounded-b-lg"
	on:click|stopPropagation={() => handleAction('delete')}
>
	<Trash2 class="h-4 w-4" />
	Supprimer
</button>

