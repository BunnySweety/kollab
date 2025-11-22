<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Plus, StickyNote, X, Pin, Archive, Trash2, Edit, Search, Tag } from 'lucide-svelte';
	import { NoteService, type Note, type CreateNoteData, type UpdateNoteData } from '$lib/services/note-service';
	import { workspaceStore, currentWorkspaceId } from '$lib/stores/workspace';
	import { toast } from 'svelte-sonner';
	import { log } from '$lib/logger';

	// Accept SvelteKit props to avoid warnings
	import type { PageData } from '$lib/types';
	export let data: PageData = undefined as unknown as PageData;

	let notes: Note[] = [];
	let filteredNotes: Note[] = [];
	let loading = true;
	let showCreateModal = false;
	let showEditModal = false;
	let showDeleteModal = false;
	let editingNote: Note | null = null;
	let noteToDelete: Note | null = null;
	let searchQuery = '';
	let selectedFilter: 'all' | 'pinned' | 'archived' = 'all';
	let selectedTags: string[] = [];
	let allTags: string[] = [];

	// Form data
	let newNoteTitle = '';
	let newNoteContent = '';
	let newNoteTags: string[] = [];
	let newNoteColor = '';
	let newNoteIsPinned = false;
	let editNoteTitle = '';
	let editNoteContent = '';
	let editNoteTags: string[] = [];
	let editNoteColor = '';
	let editNoteIsPinned = false;

	let creatingNote = false;
	let updatingNote = false;

	$: currentWorkspace = $currentWorkspaceId;
	$: currentWorkspaceFromStore = $workspaceStore.currentWorkspace?.id;

	onMount(async () => {
		const workspaceId = currentWorkspace || currentWorkspaceFromStore;
		if (workspaceId) {
			log.info('onMount: Loading notes', { workspaceId });
			await loadNotes();
		} else {
			log.warn('onMount: No workspace ID available');
		}
	});

	$: {
		const workspaceId = currentWorkspace || currentWorkspaceFromStore;
		if (workspaceId) {
			log.info('Reactive: Loading notes', { workspaceId });
			loadNotes();
		}
	}

	$: if (notes.length >= 0) {
		filterNotes();
		updateAllTags();
	}

	function updateAllTags() {
		const tagSet = new Set<string>();
		notes.forEach(note => {
			note.tags?.forEach(tag => tagSet.add(tag));
		});
		allTags = Array.from(tagSet).sort();
	}

	function filterNotes() {
		if (!notes || notes.length === 0) {
			filteredNotes = [];
			return;
		}

		let filtered = [...notes]; // Create a copy to avoid mutating the original

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(note =>
				note.title.toLowerCase().includes(query) ||
				note.content?.toLowerCase().includes(query) ||
				(note.tags && note.tags.some(tag => tag.toLowerCase().includes(query)))
			);
		}

		// Filter by status
		if (selectedFilter === 'pinned') {
			filtered = filtered.filter(note => note.isPinned && !note.isArchived);
		} else if (selectedFilter === 'archived') {
			filtered = filtered.filter(note => note.isArchived);
		} else {
			filtered = filtered.filter(note => !note.isArchived);
		}

		// Filter by tags
		if (selectedTags.length > 0) {
			filtered = filtered.filter(note =>
				note.tags && note.tags.length > 0 && note.tags.some(tag => selectedTags.includes(tag))
			);
		}

		// Sort: pinned first, then by updated date
		filtered = filtered.sort((a, b) => {
			if (a.isPinned && !b.isPinned) return -1;
			if (!a.isPinned && b.isPinned) return 1;
			return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
		});

		filteredNotes = filtered;
		log.info('Notes filtered', { total: notes.length, filtered: filtered.length, searchQuery, selectedFilter, selectedTagsCount: selectedTags.length });
	}

	async function loadNotes() {
		const workspaceId = currentWorkspace || currentWorkspaceFromStore;
		if (!workspaceId) {
			log.warn('loadNotes: No workspace ID available', { currentWorkspace, currentWorkspaceFromStore });
			notes = [];
			loading = false;
			return;
		}

		loading = true;
		try {
			log.info('Loading notes', { workspaceId });
			notes = await NoteService.listByWorkspace(workspaceId);
			log.info('Notes loaded successfully', { count: notes.length, workspaceId, notes: notes.map(n => ({ id: n.id, title: n.title, isArchived: n.isArchived, isPinned: n.isPinned })) });
			// Explicitly trigger filtering after notes are loaded
			filterNotes();
		} catch (error) {
			log.error('Failed to load notes', error, { workspaceId });
			toast.error('Failed to load notes');
			notes = [];
			filteredNotes = [];
		} finally {
			loading = false;
		}
	}

	async function createNote() {
		const workspaceId = currentWorkspace || currentWorkspaceFromStore;
		if (!workspaceId || !newNoteTitle.trim()) {
			toast.error('Please enter a note title');
			return;
		}

		creatingNote = true;
		try {
			const data: CreateNoteData = {
				workspaceId,
				title: newNoteTitle.trim(),
				content: newNoteContent.trim() || undefined,
				tags: newNoteTags.length > 0 ? newNoteTags : undefined,
				color: newNoteColor || undefined,
				isPinned: newNoteIsPinned
			};

			log.info('Creating note', { data });
			const createdNote = await NoteService.create(data);
			log.info('Note created successfully', { noteId: createdNote.id, workspaceId });
			toast.success('Note created successfully');
			showCreateModal = false;
			resetCreateForm();
			await loadNotes();
		} catch (error: unknown) {
			log.error('Create note error', error, { workspaceId });
			toast.error('Failed to create note');
		} finally {
			creatingNote = false;
		}
	}

	async function updateNote() {
		if (!editingNote || !editNoteTitle.trim()) {
			return;
		}

		updatingNote = true;
		try {
			const data: UpdateNoteData = {
				title: editNoteTitle.trim(),
				content: editNoteContent.trim() || undefined,
				tags: editNoteTags.length > 0 ? editNoteTags : undefined,
				color: editNoteColor || undefined,
				isPinned: editNoteIsPinned
			};

			await NoteService.update(editingNote.id, data);
			toast.success('Note updated successfully');
			showEditModal = false;
			editingNote = null;
			await loadNotes();
		} catch (error: unknown) {
			log.error('Update note error', error, { noteId: editingNote?.id });
			toast.error('Failed to update note');
		} finally {
			updatingNote = false;
		}
	}

	function openDeleteModal(note: Note) {
		noteToDelete = note;
		showDeleteModal = true;
	}

	async function deleteNote() {
		if (!noteToDelete) return;

		try {
			await NoteService.delete(noteToDelete.id);
			toast.success('Note deleted successfully');
			showDeleteModal = false;
			noteToDelete = null;
			await loadNotes();
		} catch (error: unknown) {
			log.error('Delete note error', error, { noteId: noteToDelete.id });
			toast.error('Failed to delete note');
		}
	}

	async function togglePin(note: Note) {
		try {
			await NoteService.update(note.id, { isPinned: !note.isPinned });
			await loadNotes();
		} catch (error: unknown) {
			log.error('Toggle pin error', error, { noteId: note.id });
			toast.error('Failed to update note');
		}
	}

	async function toggleArchive(note: Note) {
		try {
			await NoteService.update(note.id, { isArchived: !note.isArchived });
			await loadNotes();
		} catch (error: unknown) {
			log.error('Toggle archive error', error, { noteId: note.id });
			toast.error('Failed to update note');
		}
	}

	function openEditModal(note: Note) {
		editingNote = note;
		editNoteTitle = note.title;
		editNoteContent = note.content || '';
		editNoteTags = note.tags || [];
		editNoteColor = note.color || '';
		editNoteIsPinned = note.isPinned;
		showEditModal = true;
	}

	function resetCreateForm() {
		newNoteTitle = '';
		newNoteContent = '';
		newNoteTags = [];
		newNoteColor = '';
		newNoteIsPinned = false;
	}

	function addTag(tag: string, isEdit = false) {
		const trimmedTag = tag.trim();
		if (!trimmedTag) return;

		if (isEdit) {
			if (!editNoteTags.includes(trimmedTag)) {
				editNoteTags = [...editNoteTags, trimmedTag];
			}
		} else {
			if (!newNoteTags.includes(trimmedTag)) {
				newNoteTags = [...newNoteTags, trimmedTag];
			}
		}
	}

	function removeTag(tag: string, isEdit = false) {
		if (isEdit) {
			editNoteTags = editNoteTags.filter(t => t !== tag);
		} else {
			newNoteTags = newNoteTags.filter(t => t !== tag);
		}
	}

	function toggleTagFilter(tag: string) {
		if (selectedTags.includes(tag)) {
			selectedTags = selectedTags.filter(t => t !== tag);
		} else {
			selectedTags = [...selectedTags, tag];
		}
	}
</script>

<svelte:head>
	<title>Notes - Kollab</title>
</svelte:head>

<div class="flex-1 p-6">
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Notes</h1>
			<p class="mt-1 text-sm text-muted-foreground">Quick notes and reminders for your workspace</p>
		</div>
		<Button 
			on:click={() => { showCreateModal = true; resetCreateForm(); }}
			class="w-full sm:w-auto"
		>
			<Plus class="mr-2 h-4 w-4" />
			New Note
		</Button>
	</div>

	<!-- Filters and Search -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex flex-1 items-center gap-2">
			<div class="relative flex-1">
				<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="text"
					placeholder="Search notes..."
					bind:value={searchQuery}
					class="pl-9"
				/>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<Button
				variant={selectedFilter === 'all' ? 'default' : 'outline'}
				size="sm"
				on:click={() => selectedFilter = 'all'}
			>
				All
			</Button>
			<Button
				variant={selectedFilter === 'pinned' ? 'default' : 'outline'}
				size="sm"
				on:click={() => selectedFilter = 'pinned'}
			>
				<Pin class="mr-1 h-3 w-3" />
				Pinned
			</Button>
			<Button
				variant={selectedFilter === 'archived' ? 'default' : 'outline'}
				size="sm"
				on:click={() => selectedFilter = 'archived'}
			>
				<Archive class="mr-1 h-3 w-3" />
				Archived
			</Button>
		</div>
	</div>

	<!-- Tags Filter -->
	{#if allTags.length > 0}
		<div class="mb-6 flex flex-wrap items-center gap-2">
			<span class="text-sm font-medium text-muted-foreground">Tags:</span>
			{#each allTags as tag}
				<Badge
					variant={selectedTags.includes(tag) ? 'default' : 'secondary'}
					class="cursor-pointer"
					on:click={() => toggleTagFilter(tag)}
				>
					<Tag class="mr-1 h-3 w-3" />
					{tag}
				</Badge>
			{/each}
			{#if selectedTags.length > 0}
				<Button
					variant="ghost"
					size="sm"
					on:click={() => selectedTags = []}
				>
					Clear
				</Button>
			{/if}
		</div>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
				<p class="mt-4 text-sm text-muted-foreground">Loading notes...</p>
			</div>
		</div>
	{:else if filteredNotes.length === 0}
		<Card class="p-16 text-center">
			<div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
				<StickyNote class="h-10 w-10 text-primary" />
			</div>
			<h3 class="mb-2 text-xl font-semibold">No notes found</h3>
			<p class="mb-6 text-sm text-muted-foreground">
				{searchQuery || selectedTags.length > 0 || selectedFilter !== 'all'
					? 'Try adjusting your filters'
					: 'Create your first note to get started'}
			</p>
			{#if !searchQuery && selectedTags.length === 0 && selectedFilter === 'all'}
				<Button on:click={() => { showCreateModal = true; resetCreateForm(); }}>
					<Plus class="mr-2 h-4 w-4" />
					Create Note
				</Button>
			{/if}
		</Card>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each filteredNotes as note}
				<Card class="group relative overflow-hidden border-2 transition-all duration-200 hover:border-primary/50 hover:shadow-lg">
					{#if note.color}
						<div
							class="absolute left-0 top-0 h-1 w-full"
							style="background-color: {note.color}"
						></div>
					{/if}
					
					<div class="p-6">
						<div class="mb-4 flex items-start justify-between">
							<div class="flex-1 min-w-0">
								<div class="mb-2 flex items-center gap-2">
									{#if note.isPinned}
										<Pin class="h-4 w-4 shrink-0 text-primary" />
									{/if}
									<h3 class="truncate text-lg font-semibold">{note.title}</h3>
								</div>
								{#if note.content}
									<p class="line-clamp-3 text-sm text-muted-foreground">{note.content}</p>
								{/if}
							</div>
						</div>

						{#if note.tags && note.tags.length > 0}
							<div class="mb-4 flex flex-wrap gap-1">
								{#each note.tags as tag}
									<Badge variant="secondary" class="text-xs">
										<Tag class="mr-1 h-3 w-3" />
										{tag}
									</Badge>
								{/each}
							</div>
						{/if}

						<div class="flex items-center justify-between border-t pt-4">
							<p class="text-xs text-muted-foreground">
								{new Date(note.updatedAt).toLocaleDateString()}
							</p>
							<div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									on:click={() => togglePin(note)}
									title={note.isPinned ? 'Unpin' : 'Pin'}
								>
									<Pin class="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									on:click={() => toggleArchive(note)}
									title={note.isArchived ? 'Unarchive' : 'Archive'}
								>
									<Archive class="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									on:click={() => openEditModal(note)}
									title="Edit"
								>
									<Edit class="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8 text-destructive hover:text-destructive"
									on:click={() => openDeleteModal(note)}
									title="Delete"
								>
									<Trash2 class="h-3.5 w-3.5" />
								</Button>
							</div>
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>

<!-- Create Note Modal -->
{#if showCreateModal}
	<div
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50"
		on:click={() => { showCreateModal = false; resetCreateForm(); }}
		on:keydown={(e) => e.key === 'Escape' && (showCreateModal = false) && resetCreateForm()}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-2xl rounded-lg bg-background p-6 shadow-lg"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="create-note-title"
			on:keydown={(e) => e.key === 'Escape' && (showCreateModal = false) && resetCreateForm()}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="create-note-title" class="text-xl font-semibold">Create New Note</h2>
				<Button
					variant="ghost"
					size="icon"
					on:click={() => { showCreateModal = false; resetCreateForm(); }}
					disabled={creatingNote}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<div>
					<Label for="note-title">Title *</Label>
					<Input
						id="note-title"
						bind:value={newNoteTitle}
						placeholder="Enter note title"
						disabled={creatingNote}
						autofocus
					/>
				</div>

				<div>
					<Label for="note-content">Content</Label>
					<Textarea
						id="note-content"
						bind:value={newNoteContent}
						placeholder="Enter note content..."
						disabled={creatingNote}
						rows={8}
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<Label for="note-color">Color</Label>
						<Input
							id="note-color"
							type="color"
							bind:value={newNoteColor}
							disabled={creatingNote}
							class="h-10 w-full"
						/>
					</div>
					<div class="flex items-end">
						<Label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={newNoteIsPinned}
								disabled={creatingNote}
								class="h-4 w-4"
							/>
							<span>Pin note</span>
						</Label>
					</div>
				</div>

				<div>
					<Label for="note-tags">Tags (press Enter to add)</Label>
					<Input
						id="note-tags"
						placeholder="Add tags..."
						disabled={creatingNote}
						on:keydown={(e) => {
							if (e.key === 'Enter' && e.currentTarget instanceof HTMLInputElement) {
								e.preventDefault();
								addTag(e.currentTarget.value);
								e.currentTarget.value = '';
							}
						}}
					/>
					{#if newNoteTags.length > 0}
						<div class="mt-2 flex flex-wrap gap-2">
							{#each newNoteTags as tag}
								<Badge variant="secondary" class="cursor-pointer" on:click={() => removeTag(tag)}>
									{tag}
									<X class="ml-1 h-3 w-3" />
								</Badge>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={() => { showCreateModal = false; resetCreateForm(); }}
					disabled={creatingNote}
				>
					Cancel
				</Button>
				<Button on:click={createNote} disabled={creatingNote || !newNoteTitle.trim()}>
					{#if creatingNote}
						Creating...
					{:else}
						<Plus class="mr-2 h-4 w-4" />
						Create
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Note Modal -->
{#if showEditModal && editingNote}
	<div
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50"
		on:click={() => { showEditModal = false; editingNote = null; }}
		on:keydown={(e) => e.key === 'Escape' && (showEditModal = false) && (editingNote = null)}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-2xl rounded-lg bg-background p-6 shadow-lg"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="edit-note-title"
			on:keydown={(e) => e.key === 'Escape' && (showEditModal = false) && (editingNote = null)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="edit-note-title" class="text-xl font-semibold">Edit Note</h2>
				<Button
					variant="ghost"
					size="icon"
					on:click={() => { showEditModal = false; editingNote = null; }}
					disabled={updatingNote}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<div>
					<Label for="edit-note-title-input">Title *</Label>
					<Input
						id="edit-note-title-input"
						bind:value={editNoteTitle}
						placeholder="Enter note title"
						disabled={updatingNote}
						autofocus
					/>
				</div>

				<div>
					<Label for="edit-note-content">Content</Label>
					<Textarea
						id="edit-note-content"
						bind:value={editNoteContent}
						placeholder="Enter note content..."
						disabled={updatingNote}
						rows={8}
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<Label for="edit-note-color">Color</Label>
						<Input
							id="edit-note-color"
							type="color"
							bind:value={editNoteColor}
							disabled={updatingNote}
							class="h-10 w-full"
						/>
					</div>
					<div class="flex items-end">
						<Label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={editNoteIsPinned}
								disabled={updatingNote}
								class="h-4 w-4"
							/>
							<span>Pin note</span>
						</Label>
					</div>
				</div>

				<div>
					<Label for="edit-note-tags">Tags (press Enter to add)</Label>
					<Input
						id="edit-note-tags"
						placeholder="Add tags..."
						disabled={updatingNote}
						on:keydown={(e) => {
							if (e.key === 'Enter' && e.currentTarget instanceof HTMLInputElement) {
								e.preventDefault();
								addTag(e.currentTarget.value, true);
								e.currentTarget.value = '';
							}
						}}
					/>
					{#if editNoteTags.length > 0}
						<div class="mt-2 flex flex-wrap gap-2">
							{#each editNoteTags as tag}
								<Badge variant="secondary" class="cursor-pointer" on:click={() => removeTag(tag, true)}>
									{tag}
									<X class="ml-1 h-3 w-3" />
								</Badge>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={() => { showEditModal = false; editingNote = null; }}
					disabled={updatingNote}
				>
					Cancel
				</Button>
				<Button on:click={updateNote} disabled={updatingNote || !editNoteTitle.trim()}>
					{#if updatingNote}
						Updating...
					{:else}
						<Edit class="mr-2 h-4 w-4" />
						Update
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Note Modal -->
{#if showDeleteModal && noteToDelete}
	<div
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50"
		on:click={() => { showDeleteModal = false; noteToDelete = null; }}
		on:keydown={(e) => e.key === 'Escape' && (showDeleteModal = false) && (noteToDelete = null)}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-note-title"
			on:keydown={(e) => e.key === 'Escape' && (showDeleteModal = false) && (noteToDelete = null)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="delete-note-title" class="text-xl font-semibold">Delete Note</h2>
				<Button
					variant="ghost"
					size="icon"
					on:click={() => { showDeleteModal = false; noteToDelete = null; }}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="mb-6">
				<p class="text-sm text-muted-foreground">
					Are you sure you want to delete "<span class="font-semibold text-foreground">{noteToDelete.title}</span>"? This action cannot be undone.
				</p>
			</div>

			<div class="flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={() => { showDeleteModal = false; noteToDelete = null; }}
				>
					Cancel
				</Button>
				<Button
					variant="destructive"
					on:click={deleteNote}
				>
					<Trash2 class="mr-2 h-4 w-4" />
					Delete
				</Button>
			</div>
		</div>
	</div>
{/if}
