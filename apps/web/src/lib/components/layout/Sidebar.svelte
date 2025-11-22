<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
import {
	ChevronDown,
	ChevronRight,
	Plus,
	FileText,
	Hash,
	Users,
	Settings,
	Trash2,
	LogOut,
	Calendar,
	CheckSquare,
	Database,
	Search,
	Layout,
	Check,
	FolderKanban,
	Folder,
	StickyNote,
	BookOpen,
	Home
} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import { api, endpoints } from '$lib/api-client';
	import { workspaceStore } from '$lib/stores/workspace';
	import { log } from '$lib/logger';

	export let open = true;
	export let user: any;

	let documents: any[] = [];
	let expandedDocs: Set<string> = new Set();
	let showWorkspaceDropdown = false;
	let showCreateWorkspace = false;
	let newWorkspaceName = '';
	let newWorkspaceDescription = '';
	let creatingWorkspace = false;

	// Subscribe to workspace store
	$: workspaces = $workspaceStore.workspaces;
	$: currentWorkspace = $workspaceStore.currentWorkspace;

	$: if (user) {
		workspaceStore.loadWorkspaces();
	}

	// Load documents when workspace changes
	$: if (currentWorkspace) {
		loadDocuments();
	} else {
		documents = [];
	}

	async function selectWorkspace(workspace: any) {
		if (!workspace || !workspace.id) return;
		await workspaceStore.selectWorkspace(workspace.id);
	}

	async function loadDocuments() {
		if (!currentWorkspace) {
			documents = [];
			return;
		}

		try {
			const data = await api.get(endpoints.documents.listByWorkspace(currentWorkspace.id));
			documents = buildDocumentTree(data.documents || []);
		} catch (error) {
			log.error('Load documents error', error, { workspaceId: currentWorkspace?.id });
			// If it's a 403, the user doesn't have access to this workspace
			// Clear the current workspace and reload workspaces
			if (error instanceof Error && error.message.includes('Access denied')) {
				toast.error('You do not have access to this workspace. Please select a different workspace.');
				workspaceStore.clearWorkspace();
				documents = [];
				// Reload workspaces to get the correct list
				await workspaceStore.loadWorkspaces();
			} else {
				toast.error('Failed to load documents');
				documents = [];
			}
		}
	}

	function buildDocumentTree(docs: any[]) {
		const tree: any[] = [];
		const map = new Map();

		// First pass: create map
		docs.forEach(doc => {
			map.set(doc.id, { ...doc, children: [] });
		});

		// Second pass: build tree
		docs.forEach(doc => {
			if (doc.parentId) {
				const parent = map.get(doc.parentId);
				if (parent) {
					parent.children.push(map.get(doc.id));
				}
			} else {
				tree.push(map.get(doc.id));
			}
		});

		return tree;
	}

	function toggleDocument(docId: string) {
		if (expandedDocs.has(docId)) {
			expandedDocs.delete(docId);
		} else {
			expandedDocs.add(docId);
		}
		expandedDocs = expandedDocs;
	}

	async function createDocument(parentId?: string) {
		const title = prompt('Document title:');
		if (!title) return;

		try {
			const data = await api.post(endpoints.documents.create, {
				workspaceId: currentWorkspace.id,
				parentId,
				title
			});

			toast.success('Document created');
			await loadDocuments();
			goto(`/workspace/document/${data.document.id}`);
		} catch (error) {
			log.error('Create document error', error, { workspaceId: $workspaceStore.currentWorkspace?.id });
			toast.error('Failed to create document');
		}
	}

	async function handleLogout() {
		try {
			await api.post(endpoints.auth.logout);
			// Reset workspace store on logout
			workspaceStore.reset();
			goto('/login');
		} catch (error) {
			log.error('Logout error', error);
		}
	}

	function renderDocumentTree(docs: any[], level = 0) {
		return docs;
	}

	function generateSlug(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)+/g, '');
	}

	async function createWorkspace() {
		if (!newWorkspaceName.trim()) {
			toast.error('Please enter a workspace name');
			return;
		}

		creatingWorkspace = true;
		const slug = generateSlug(newWorkspaceName);

		try {
			const data = await api.post(endpoints.workspaces.create, {
				name: newWorkspaceName,
				description: newWorkspaceDescription,
				slug: slug
			});

			toast.success('Workspace created successfully');

			// Reset form and close modal
			newWorkspaceName = '';
			newWorkspaceDescription = '';
			showCreateWorkspace = false;

			// Reload workspaces and select the new one
			await workspaceStore.loadWorkspaces();
			await workspaceStore.selectWorkspace(data.workspace.id);
		} catch (error) {
			log.error('Create workspace error', error);
			toast.error(error.message || 'Failed to create workspace');
		} finally {
			creatingWorkspace = false;
		}
	}
</script>

{#if open}
	<aside class="flex h-full w-64 flex-col bg-background">
		<!-- Workspace selector -->
		<div class="border-b p-4 relative">
			<Button
				variant="ghost"
				class="w-full justify-between"
				on:click={() => showWorkspaceDropdown = !showWorkspaceDropdown}
			>
				<span class="flex items-center gap-2">
					<div class="h-6 w-6 rounded bg-primary/10 flex items-center justify-center">
						{currentWorkspace?.name?.[0] || 'W'}
					</div>
					<span class="truncate">{currentWorkspace?.name || 'Select workspace'}</span>
				</span>
				<ChevronDown class="h-4 w-4" />
			</Button>

			{#if showWorkspaceDropdown}
				<div class="absolute top-full left-4 right-4 z-50 mt-1 rounded-md border bg-popover shadow-md">
					{#each workspaces as ws}
						<button
							class="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
							on:click={() => {
								selectWorkspace(ws.workspace);
								showWorkspaceDropdown = false;
							}}
						>
							<div class="h-5 w-5 rounded bg-primary/10 flex items-center justify-center text-xs">
								{ws.workspace.name?.[0] || 'W'}
							</div>
							<span class="truncate">{ws.workspace.name}</span>
							{#if currentWorkspace?.id === ws.workspace.id}
								<Check class="ml-auto h-4 w-4" />
							{/if}
						</button>
					{/each}
					<div class="border-t p-2">
						<button
							class="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded"
							on:click={() => {
								showWorkspaceDropdown = false;
								showCreateWorkspace = true;
							}}
						>
							<Plus class="h-4 w-4" />
							Create workspace
						</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- User section -->
		<div class="border-b p-4">
			<div class="flex items-center gap-3">
				<div class="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
					{user?.name?.[0] || 'U'}
				</div>
				<div class="flex-1 truncate">
					<p class="text-sm font-medium">{user?.name}</p>
					<p class="text-xs text-muted-foreground truncate">{user?.email}</p>
				</div>
			</div>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 overflow-y-auto p-2">
			<div class="space-y-1">
				<Button
					variant={$page.url.pathname === '/workspace' ? 'secondary' : 'ghost'}
					class="w-full justify-start"
					on:click={() => goto('/workspace')}
				>
					<Home class="mr-2 h-4 w-4" />
					Home
				</Button>

				<Button
					variant="ghost"
					class="w-full justify-start"
					on:click={() => goto('/workspace/search')}
				>
					<Search class="mr-2 h-4 w-4" />
					Quick Search
				</Button>

				<Button
					variant="ghost"
					class="w-full justify-start"
					on:click={() => goto('/workspace/projects')}
				>
					<FolderKanban class="mr-2 h-4 w-4" />
					Projects
				</Button>

				<Button
					variant="ghost"
					class="w-full justify-start"
					on:click={() => goto('/workspace/teams')}
				>
					<Users class="mr-2 h-4 w-4" />
					Teams
				</Button>

				<Button
					variant="ghost"
					class="w-full justify-start"
					on:click={() => goto('/workspace/tasks')}
				>
					<CheckSquare class="mr-2 h-4 w-4" />
					All Tasks
				</Button>

				<Button
					variant="ghost"
					class="w-full justify-start"
					on:click={() => goto('/workspace/calendar')}
				>
					<Calendar class="mr-2 h-4 w-4" />
					Calendar
				</Button>

				<Button
					variant="ghost"
					class="w-full justify-start"
					on:click={() => {
						if (currentWorkspace) {
							goto(`/workspace/drive?workspaceId=${currentWorkspace.id}`);
						}
					}}
				>
					<Folder class="mr-2 h-4 w-4" />
					Drive
				</Button>

				<Button
					variant="ghost"
					class="w-full justify-start"
					on:click={() => goto('/workspace/notes')}
				>
					<StickyNote class="mr-2 h-4 w-4" />
					Notes
				</Button>

				<Button
					variant="ghost"
					class="w-full justify-start"
					on:click={() => goto('/workspace/wiki')}
				>
					<BookOpen class="mr-2 h-4 w-4" />
					Wiki
				</Button>

				<Button
					variant="ghost"
					class="w-full justify-start"
					on:click={() => goto('/workspace/databases')}
				>
					<Database class="mr-2 h-4 w-4" />
					Databases
				</Button>

				<Button
					variant="ghost"
					class="w-full justify-start"
					on:click={() => goto('/workspace/templates')}
				>
					<Layout class="mr-2 h-4 w-4" />
					Templates
				</Button>
			</div>

			<!-- Documents section -->
			<div class="mt-6">
				<div class="mb-2 flex items-center justify-between px-2">
					<span class="text-xs font-semibold text-muted-foreground">DOCUMENTS</span>
					<Button
						size="icon"
						variant="ghost"
						class="h-5 w-5"
						on:click={() => createDocument()}
					>
						<Plus class="h-4 w-4" />
					</Button>
				</div>

				<div class="space-y-0.5">
					{#each renderDocumentTree(documents) as doc}
						<div>
							<Button
								variant={$page.params.id === doc.id ? 'secondary' : 'ghost'}
								class="w-full justify-start pl-{2 + doc.level * 4}"
								on:click={() => goto(`/workspace/document/${doc.id}`)}
							>
								{#if doc.children?.length > 0}
									<button
										class="mr-1"
										on:click|stopPropagation={() => toggleDocument(doc.id)}
									>
										{#if expandedDocs.has(doc.id)}
											<ChevronDown class="h-3 w-3" />
										{:else}
											<ChevronRight class="h-3 w-3" />
										{/if}
									</button>
								{:else}
									<span class="mr-1 w-3" />
								{/if}
								<FileText class="mr-2 h-4 w-4" />
								<span class="truncate">{doc.title}</span>
							</Button>

							{#if expandedDocs.has(doc.id) && doc.children?.length > 0}
								<div class="ml-3">
									{#each renderDocumentTree(doc.children, doc.level + 1) as child}
										<Button
											variant={$page.params.id === child.id ? 'secondary' : 'ghost'}
											class="w-full justify-start pl-{2 + child.level * 4}"
											on:click={() => goto(`/workspace/document/${child.id}`)}
										>
											<FileText class="mr-2 h-4 w-4" />
											<span class="truncate">{child.title}</span>
										</Button>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Private section -->
			<div class="mt-6">
				<div class="mb-2 px-2">
					<span class="text-xs font-semibold text-muted-foreground">PRIVATE</span>
				</div>
				<div class="space-y-1">
					<Button
						variant="ghost"
						class="w-full justify-start"
						on:click={() => goto('/workspace/trash')}
					>
						<Trash2 class="mr-2 h-4 w-4" />
						Trash
					</Button>
				</div>
			</div>
		</nav>

		<!-- Bottom section -->
		<div class="border-t p-2">
			<div class="mb-2 flex items-center justify-between px-2">
				<span class="text-xs font-semibold text-muted-foreground">APPEARANCE</span>
				<ThemeSwitcher />
			</div>
			<Button
				variant="ghost"
				class="w-full justify-start"
				on:click={() => goto('/workspace/settings')}
			>
				<Settings class="mr-2 h-4 w-4" />
				Settings & Members
			</Button>
			<Button
				variant="ghost"
				class="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
				on:click={handleLogout}
			>
				<LogOut class="mr-2 h-4 w-4" />
				Log out
			</Button>
		</div>
	</aside>

	<!-- Create Workspace Modal -->
	{#if showCreateWorkspace}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
				<h2 class="mb-4 text-xl font-semibold">Create New Workspace</h2>

				<div class="space-y-4">
					<div>
						<label for="workspace-name" class="mb-1 block text-sm font-medium">
							Workspace Name *
						</label>
						<input
							id="workspace-name"
							type="text"
							bind:value={newWorkspaceName}
							placeholder="My Workspace"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
							disabled={creatingWorkspace}
						/>
						{#if newWorkspaceName}
							<p class="mt-1 text-xs text-muted-foreground">
								URL: /{generateSlug(newWorkspaceName)}
							</p>
						{/if}
					</div>

					<div>
						<label for="workspace-description" class="mb-1 block text-sm font-medium">
							Description (Optional)
						</label>
						<textarea
							id="workspace-description"
							bind:value={newWorkspaceDescription}
							placeholder="Describe your workspace..."
							rows="3"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
							disabled={creatingWorkspace}
						/>
					</div>
				</div>

				<div class="mt-6 flex gap-2">
					<Button
						variant="outline"
						on:click={() => {
							showCreateWorkspace = false;
							newWorkspaceName = '';
							newWorkspaceDescription = '';
						}}
						disabled={creatingWorkspace}
					>
						Cancel
					</Button>
					<Button
						on:click={createWorkspace}
						disabled={creatingWorkspace || !newWorkspaceName.trim()}
					>
						{#if creatingWorkspace}
							Creating...
						{:else}
							Create Workspace
						{/if}
					</Button>
				</div>
			</div>
		</div>
	{/if}
{/if}