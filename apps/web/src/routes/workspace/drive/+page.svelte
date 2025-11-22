<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Folder,
		FolderPlus,
		File,
		Upload,
		MoreVertical,
		Trash2,
		Download,
		ChevronRight,
		Home,
		Image,
		FileText,
		Video,
		Music,
		Archive as ArchiveIcon,
		X,
		Clock,
		User,
		ArrowUpDown
	} from 'lucide-svelte';
	import { DriveService, type DriveFolder, type DriveFile } from '$lib/services/drive-service';
	import { ProjectService, type Project } from '$lib/services/project-service';
	import { workspaceStore } from '$lib/stores/workspace';
	import { toast } from 'svelte-sonner';
	import { log } from '$lib/logger';

	export const data = $page.data;

	let workspaceId: string | null = data.workspaceId;
	let projectId: string | null = data.projectId || null;
	let currentFolderId: string | null = null;
	let folders: DriveFolder[] = [];
	let files: DriveFile[] = [];
	let projects: Project[] = [];
	let loading = true;
	let showCreateFolderModal = false;
	let showUploadModal = false;
	let newFolderName = '';
	let selectedFiles: FileList | null = null;
	let breadcrumbs: DriveFolder[] = [];
	let creatingFolder = false;
	let uploadingFiles = false;
	let isDragging = false;
	let dragCounter = 0;
	let isDraggingInModal = false;
	let dragCounterInModal = 0;

	onMount(async () => {
		const currentWorkspace = $workspaceStore.currentWorkspace;
		if (currentWorkspace && !workspaceId) {
			workspaceId = currentWorkspace.id;
		}
		if (workspaceId) {
			await loadDrive();
		}
	});

	$: {
		const currentWorkspace = $workspaceStore.currentWorkspace;
		if (currentWorkspace && !workspaceId) {
			workspaceId = currentWorkspace.id;
			if (workspaceId) {
				loadDrive();
			}
		}
	}

	async function loadDrive() {
		if (!workspaceId) return;
		loading = true;
		try {
			const params: any = { workspaceId };
			if (projectId) params.projectId = projectId;
			if (currentFolderId) params.parentId = currentFolderId;
			else params.parentId = null;

			const promises: Promise<any>[] = [
				DriveService.getFolders(params),
				DriveService.getFiles(params)
			];

			// Load projects only if we're at root level and not filtering by project
			if (!currentFolderId && !projectId) {
				promises.push(ProjectService.listByWorkspace(workspaceId));
			}

			const results = await Promise.all(promises);
			[folders, files] = results;
			if (results[2]) {
				projects = results[2];
			}

			// Build breadcrumbs
			if (currentFolderId) {
				await buildBreadcrumbs(currentFolderId);
			} else {
				breadcrumbs = [];
			}
		} catch (error: any) {
			log.error('Load drive error', error instanceof Error ? error : new Error(String(error)), { workspaceId, projectId, currentFolderId });
			toast.error(error?.message || 'Failed to load drive');
		} finally {
			loading = false;
		}
	}

	async function buildBreadcrumbs(folderId: string) {
		const crumbs: DriveFolder[] = [];
		let currentId: string | null = folderId;

		while (currentId) {
			try {
				const folder = await DriveService.getFolder(currentId);
				crumbs.unshift(folder);
				currentId = folder.parentId;
			} catch {
				break;
			}
		}

		breadcrumbs = crumbs;
	}

	async function navigateToFolder(folder: DriveFolder) {
		currentFolderId = folder.id;
		await loadDrive();
	}

	async function navigateToRoot() {
		currentFolderId = null;
		await loadDrive();
	}

	async function navigateToBreadcrumb(folder: DriveFolder) {
		currentFolderId = folder.id;
		await loadDrive();
	}

	async function createFolder() {
		if (!newFolderName.trim()) {
			toast.error('Please enter a folder name');
			return;
		}

		const currentWorkspaceId = workspaceId || $workspaceStore.currentWorkspace?.id;
		if (!currentWorkspaceId) {
			toast.error('No workspace selected');
			return;
		}

		creatingFolder = true;
		try {
			await DriveService.createFolder({
				workspaceId: currentWorkspaceId,
				projectId: projectId || undefined,
				parentId: currentFolderId || undefined,
				name: newFolderName.trim(),
				folderType: 'custom'
			});
			toast.success('Folder created successfully');
			newFolderName = '';
			showCreateFolderModal = false;
			await loadDrive();
		} catch (error: any) {
			log.error('Create folder error', error instanceof Error ? error : new Error(String(error)), { workspaceId, projectId, currentFolderId, newFolderName });
			toast.error(error?.message || 'Failed to create folder');
		} finally {
			creatingFolder = false;
		}
	}

	async function deleteFolder(folder: DriveFolder) {
		if (!confirm(`Delete folder "${folder.name}"? This will also delete all contents.`)) return;

		try {
			await DriveService.deleteFolder(folder.id);
			toast.success('Folder deleted successfully');
			await loadDrive();
		} catch (error: any) {
			log.error('Delete folder error', error instanceof Error ? error : new Error(String(error)), { folderId: folder.id });
			toast.error(error?.message || 'Failed to delete folder');
		}
	}

	async function handleFileUpload() {
		if (!selectedFiles || selectedFiles.length === 0) {
			toast.error('Please select at least one file');
			return;
		}

		const currentWorkspaceId = workspaceId || $workspaceStore.currentWorkspace?.id;
		if (!currentWorkspaceId) {
			toast.error('No workspace selected');
			return;
		}

		uploadingFiles = true;
		try {
			const uploadPromises = Array.from(selectedFiles).map((file) =>
				DriveService.uploadFile(file, {
					workspaceId: currentWorkspaceId,
					projectId: projectId || undefined,
					folderId: currentFolderId || undefined
				})
			);

			await Promise.all(uploadPromises);
			toast.success(`${selectedFiles.length} file(s) uploaded successfully`);
			selectedFiles = null;
			isDraggingInModal = false;
			dragCounterInModal = 0;
			showUploadModal = false;
			await loadDrive();
		} catch (error: any) {
			log.error('Upload files error', error instanceof Error ? error : new Error(String(error)), { workspaceId, projectId, currentFolderId, fileCount: selectedFiles?.length || 0 });
			toast.error(error?.message || 'Failed to upload files');
		} finally {
			uploadingFiles = false;
		}
	}

	async function deleteFile(file: DriveFile) {
		if (!confirm(`Delete file "${file.fileName}"?`)) return;

		try {
			await DriveService.deleteFile(file.id);
			toast.success('File deleted successfully');
			await loadDrive();
		} catch (error: any) {
			log.error('Delete file error', error instanceof Error ? error : new Error(String(error)), { fileId: file.id });
			toast.error(error?.message || 'Failed to delete file');
		}
	}

	function getFileIcon(file: DriveFile) {
		const icon = DriveService.getFileIcon(file.mimeType);
		switch (icon) {
			case 'image':
				return Image;
			case 'video':
				return Video;
			case 'audio':
				return Music;
			case 'file-text':
				return FileText;
			case 'archive':
				return ArchiveIcon;
			default:
				return File;
		}
	}

	function downloadFile(file: DriveFile) {
		window.open(file.fileUrl, '_blank');
	}

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragCounter++;
		if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
			isDragging = true;
		}
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragCounter--;
		if (dragCounter === 0) {
			isDragging = false;
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = false;
		dragCounter = 0;

		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			selectedFiles = files;
			showUploadModal = true;
		}
	}

	function formatFileSize(bytes: number | null | undefined): string {
		if (!bytes) return 'Unknown size';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	}

	function formatDate(date: string): string {
		const d = new Date(date);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return 'Today';
		} else if (diffDays === 1) {
			return 'Yesterday';
		} else if (diffDays < 7) {
			return `${diffDays} days ago`;
		} else {
			return d.toLocaleDateString('fr-FR', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		}
	}

	type SortField = 'name' | 'date' | 'size' | 'type';
	type SortDirection = 'asc' | 'desc';

	let sortField: SortField = 'name';
	let sortDirection: SortDirection = 'asc';
	let sortedFolders: DriveFolder[] = [];
	let sortedFiles: DriveFile[] = [];

	function handleSort(field: SortField) {
		if (sortField === field) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortDirection = 'asc';
		}
		sortItems();
	}

	function sortItems() {
		const allItems = [
			...folders.map((f) => ({ ...f, type: 'folder' as const, sortName: f.name.toLowerCase() })),
			...files.map((f) => ({ ...f, type: 'file' as const, sortName: f.fileName.toLowerCase() }))
		];

		allItems.sort((a, b) => {
			let comparison = 0;

			switch (sortField) {
				case 'name':
					comparison = a.sortName.localeCompare(b.sortName);
					break;
				case 'date': {
					const dateA = new Date(a.updatedAt || a.createdAt).getTime();
					const dateB = new Date(b.updatedAt || b.createdAt).getTime();
					comparison = dateA - dateB;
					break;
				}
				case 'size': {
					const sizeA = a.type === 'file' ? (a as DriveFile).fileSize || 0 : 0;
					const sizeB = b.type === 'file' ? (b as DriveFile).fileSize || 0 : 0;
					comparison = sizeA - sizeB;
					break;
				}
				case 'type':
					comparison = a.type.localeCompare(b.type);
					break;
			}

			return sortDirection === 'asc' ? comparison : -comparison;
		});

		// Separate back into folders and files
		sortedFolders = allItems.filter((item) => item.type === 'folder').map((item) => {
			const { type, sortName, ...folder } = item;
			return folder as DriveFolder;
		});
		sortedFiles = allItems.filter((item) => item.type === 'file').map((item) => {
			const { type, sortName, ...file } = item;
			return file as DriveFile;
		});
	}

	$: {
		if (folders.length > 0 || files.length > 0) {
			sortItems();
		} else {
			sortedFolders = [];
			sortedFiles = [];
		}
	}

	// Group folders by project
	$: foldersByProject = (() => {
		const grouped: Map<string | null, { project: Project | null; folders: DriveFolder[] }> = new Map();

		// Initialize with null (workspace-level folders)
		grouped.set(null, { project: null, folders: [] });

		// Group folders by projectId
		for (const folder of sortedFolders) {
			const key = folder.projectId || null;
			if (!grouped.has(key)) {
				const project = folder.projectId ? projects.find(p => p.id === folder.projectId) || null : null;
				grouped.set(key, { project, folders: [] });
			}
			grouped.get(key)!.folders.push(folder);
		}

		return Array.from(grouped.entries())
			.filter(([_, data]) => data.folders.length > 0)
			.sort(([a], [b]) => {
				// Workspace-level folders first
				if (a === null) return -1;
				if (b === null) return 1;
				// Then by project name
				const projectA = projects.find(p => p.id === a);
				const projectB = projects.find(p => p.id === b);
				if (!projectA) return 1;
				if (!projectB) return -1;
				return projectA.name.localeCompare(projectB.name);
			});
	})();
</script>

<svelte:head>
	<title>Drive - Kollab</title>
</svelte:head>

<div class="flex-1 flex flex-col h-screen overflow-hidden">
	<div class="border-b bg-background p-4">
		<div class="flex items-center justify-between mb-4">
			<div>
				<h1 class="text-2xl font-bold">Drive</h1>
				<p class="text-sm text-muted-foreground">Manage all project files</p>
			</div>
			<div class="flex gap-2">
				<Button size="sm" on:click={() => showCreateFolderModal = true}>
					<FolderPlus class="h-4 w-4 mr-2" />
					New Folder
				</Button>
				<Button size="sm" on:click={() => showUploadModal = true}>
					<Upload class="h-4 w-4 mr-2" />
					Upload
				</Button>
			</div>
		</div>

		{#if breadcrumbs.length > 0 || currentFolderId}
			<div class="flex items-center gap-2 text-sm">
				<button
					class="flex items-center gap-1 text-muted-foreground hover:text-foreground"
					on:click={navigateToRoot}
				>
					<Home class="h-4 w-4" />
					<span>Root</span>
				</button>
				{#each breadcrumbs as crumb}
					<ChevronRight class="h-4 w-4 text-muted-foreground" />
					<button
						class="text-muted-foreground hover:text-foreground"
						on:click={() => navigateToBreadcrumb(crumb)}
					>
						{crumb.name}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div
		class="flex-1 overflow-auto p-6 relative transition-colors {isDragging ? 'bg-primary/5 border-2 border-dashed border-primary' : ''}"
		on:dragenter={handleDragEnter}
		on:dragleave={handleDragLeave}
		on:dragover={handleDragOver}
		on:drop={handleDrop}
	>
		{#if isDragging}
			<div class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
				<div class="text-center">
					<Upload class="h-16 w-16 text-primary mx-auto mb-4" />
					<p class="text-lg font-semibold">Drop files here to upload</p>
					<p class="text-sm text-muted-foreground mt-2">Release to upload multiple files</p>
				</div>
			</div>
		{/if}

		{#if loading}
			<div class="space-y-2">
				{#each Array(5) as _}
					<Skeleton class="h-12 w-full" />
				{/each}
			</div>
		{:else}
			<div class="border rounded-lg overflow-hidden">
				<!-- Table Header -->
				<div class="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 border-b text-sm font-medium text-muted-foreground">
					<div class="col-span-5 flex items-center gap-2">
						<button
							class="flex items-center gap-1 hover:text-foreground transition-colors"
							on:click={() => handleSort('name')}
						>
							Name
							<ArrowUpDown class="h-3 w-3 {sortField === 'name' ? 'text-foreground' : ''}" />
						</button>
					</div>
					<div class="col-span-2 flex items-center gap-2">
						<button
							class="flex items-center gap-1 hover:text-foreground transition-colors"
							on:click={() => handleSort('type')}
						>
							Type
							<ArrowUpDown class="h-3 w-3 {sortField === 'type' ? 'text-foreground' : ''}" />
						</button>
					</div>
					<div class="col-span-2 hidden md:flex items-center gap-2">
						<button
							class="flex items-center gap-1 hover:text-foreground transition-colors"
							on:click={() => handleSort('date')}
						>
							<Clock class="h-3 w-3" />
							Modified
							<ArrowUpDown class="h-3 w-3 {sortField === 'date' ? 'text-foreground' : ''}" />
						</button>
					</div>
					<div class="col-span-2 hidden lg:flex items-center gap-2">
						<button
							class="flex items-center gap-1 hover:text-foreground transition-colors"
							on:click={() => handleSort('size')}
						>
							Size
							<ArrowUpDown class="h-3 w-3 {sortField === 'size' ? 'text-foreground' : ''}" />
						</button>
					</div>
					<div class="col-span-1 text-right">Actions</div>
				</div>

				<!-- Table Body -->
				<div class="divide-y">
					{#if currentFolderId || projectId}
						<!-- Show folders in a flat list when inside a folder or filtering by project -->
						{#each sortedFolders as folder}
							<div
								class="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer group"
								on:click={() => navigateToFolder(folder)}
							>
								<div class="col-span-5 flex items-center gap-3 min-w-0">
									<Folder class="h-5 w-5 text-blue-500 flex-shrink-0" />
									<span class="font-medium truncate" title={folder.name}>{folder.name}</span>
								</div>
								<div class="col-span-2 flex items-center">
									<span class="text-sm text-muted-foreground capitalize">{folder.folderType}</span>
								</div>
								<div class="col-span-2 hidden md:flex items-center gap-2">
									<Clock class="h-3 w-3 text-muted-foreground" />
									<span class="text-sm text-muted-foreground">{formatDate(folder.updatedAt)}</span>
								</div>
								<div class="col-span-2 hidden lg:flex items-center">
									<span class="text-sm text-muted-foreground">—</span>
								</div>
								<div class="col-span-1 flex items-center justify-end">
									<button
										class="p-1.5 hover:bg-accent rounded opacity-0 group-hover:opacity-100 transition-opacity"
										on:click|stopPropagation={() => deleteFolder(folder)}
										title="Delete folder"
									>
										<Trash2 class="h-4 w-4 text-destructive" />
									</button>
								</div>
							</div>
						{/each}
					{:else}
						<!-- Group folders by project at root level -->
						{#each foldersByProject as [projectIdKey, { project, folders: projectFolders }]}
							{#if projectFolders.length > 0}
								<!-- Project Header -->
								<div class="bg-muted/30 px-4 py-2 border-b">
									<div class="flex items-center gap-2">
										{#if project}
											<div class="h-2 w-2 rounded-full" style="background-color: {project.color || '#6366f1'};"></div>
											<span class="font-semibold text-sm">{project.name}</span>
										{:else}
											<span class="font-semibold text-sm text-muted-foreground">Workspace</span>
										{/if}
										<span class="text-xs text-muted-foreground">({projectFolders.length} folder{projectFolders.length > 1 ? 's' : ''})</span>
									</div>
								</div>

								<!-- Project Folders -->
								{#each projectFolders as folder}
									<div
										class="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer group"
										on:click={() => navigateToFolder(folder)}
									>
										<div class="col-span-5 flex items-center gap-3 min-w-0">
											<Folder class="h-5 w-5 text-blue-500 flex-shrink-0" />
											<span class="font-medium truncate" title={folder.name}>{folder.name}</span>
										</div>
										<div class="col-span-2 flex items-center">
											<span class="text-sm text-muted-foreground capitalize">{folder.folderType}</span>
										</div>
										<div class="col-span-2 hidden md:flex items-center gap-2">
											<Clock class="h-3 w-3 text-muted-foreground" />
											<span class="text-sm text-muted-foreground">{formatDate(folder.updatedAt)}</span>
										</div>
										<div class="col-span-2 hidden lg:flex items-center">
											<span class="text-sm text-muted-foreground">—</span>
										</div>
										<div class="col-span-1 flex items-center justify-end">
											<button
												class="p-1.5 hover:bg-accent rounded opacity-0 group-hover:opacity-100 transition-opacity"
												on:click|stopPropagation={() => deleteFolder(folder)}
												title="Delete folder"
											>
												<Trash2 class="h-4 w-4 text-destructive" />
											</button>
										</div>
									</div>
								{/each}
							{/if}
						{/each}
					{/if}

					{#each sortedFiles as file}
						<div
							class="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/50 transition-colors group"
						>
							<div class="col-span-5 flex items-center gap-3 min-w-0">
								<svelte:component this={getFileIcon(file)} class="h-5 w-5 text-muted-foreground flex-shrink-0" />
								<span class="font-medium truncate cursor-pointer" title={file.fileName} on:click={() => downloadFile(file)}>
									{file.fileName}
								</span>
							</div>
							<div class="col-span-2 flex items-center">
								<span class="text-sm text-muted-foreground capitalize">{file.fileType || 'general'}</span>
							</div>
							<div class="col-span-2 hidden md:flex items-center gap-2">
								<Clock class="h-3 w-3 text-muted-foreground" />
								<span class="text-sm text-muted-foreground">{formatDate(file.updatedAt)}</span>
							</div>
							<div class="col-span-2 hidden lg:flex items-center">
								<span class="text-sm text-muted-foreground">{formatFileSize(file.fileSize)}</span>
							</div>
							<div class="col-span-1 flex items-center justify-end gap-1">
								<button
									class="p-1.5 hover:bg-accent rounded opacity-0 group-hover:opacity-100 transition-opacity"
									on:click={() => downloadFile(file)}
									title="Download"
								>
									<Download class="h-4 w-4" />
								</button>
								<button
									class="p-1.5 hover:bg-accent rounded opacity-0 group-hover:opacity-100 transition-opacity"
									on:click={() => deleteFile(file)}
									title="Delete"
								>
									<Trash2 class="h-4 w-4 text-destructive" />
								</button>
							</div>
						</div>
					{/each}
				</div>

				{#if folders.length === 0 && files.length === 0}
					<div class="text-center py-12">
						<Folder class="h-16 w-16 text-muted-foreground mx-auto mb-4" />
						<p class="text-muted-foreground">No folders or files yet</p>
						<p class="text-sm text-muted-foreground mt-2">Create a folder or upload files to get started</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if showCreateFolderModal}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
		on:click={() => showCreateFolderModal = false}
		on:keydown={(e) => e.key === 'Escape' && (showCreateFolderModal = false)}
	>
		<div
			class="bg-background rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
			role="dialog"
			aria-modal="true"
			on:click|stopPropagation
		>
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-2xl font-bold">Create Folder</h2>
				<button
					class="p-2 hover:bg-accent rounded-lg"
					on:click={() => showCreateFolderModal = false}
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="space-y-4">
				<div>
					<Label for="folder-name">Folder Name</Label>
					<Input
						id="folder-name"
						bind:value={newFolderName}
						placeholder="Enter folder name"
						on:keydown={(e) => e.key === 'Enter' && createFolder()}
					/>
				</div>

				<div class="flex gap-2 pt-4">
					<Button
						variant="outline"
						class="flex-1"
						on:click={() => showCreateFolderModal = false}
						disabled={creatingFolder}
					>
						Cancel
					</Button>
					<Button
						class="flex-1"
						on:click={createFolder}
						disabled={!newFolderName.trim() || creatingFolder}
					>
						{creatingFolder ? 'Creating...' : 'Create'}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if showUploadModal}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
		on:click={() => {
			selectedFiles = null;
			isDraggingInModal = false;
			dragCounterInModal = 0;
			showUploadModal = false;
		}}
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				selectedFiles = null;
				isDraggingInModal = false;
				dragCounterInModal = 0;
				showUploadModal = false;
			}
		}}
	>
		<div
			class="bg-background rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
			role="dialog"
			aria-modal="true"
			on:click|stopPropagation
		>
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-2xl font-bold">Upload Files</h2>
				<button
					class="p-2 hover:bg-accent rounded-lg"
					on:click={() => {
						selectedFiles = null;
						isDraggingInModal = false;
						dragCounterInModal = 0;
						showUploadModal = false;
					}}
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="space-y-4">
				<div
					class="border-2 border-dashed rounded-lg p-8 text-center transition-colors {isDraggingInModal ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}"
					on:dragenter={(e) => {
						e.preventDefault();
						e.stopPropagation();
						dragCounterInModal++;
						if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
							isDraggingInModal = true;
						}
					}}
					on:dragleave={(e) => {
						e.preventDefault();
						e.stopPropagation();
						dragCounterInModal--;
						if (dragCounterInModal === 0) {
							isDraggingInModal = false;
						}
					}}
					on:dragover={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
					on:drop={(e) => {
						e.preventDefault();
						e.stopPropagation();
						isDraggingInModal = false;
						dragCounterInModal = 0;
						const files = e.dataTransfer?.files;
						if (files && files.length > 0) {
							selectedFiles = files;
						}
					}}
				>
					<Upload class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
					<p class="text-sm font-medium mb-2">
						Drag and drop files here, or click to select
					</p>
					<p class="text-xs text-muted-foreground mb-4">
						Multiple files supported (max 100MB per file)
					</p>
					<Label for="file-upload">
						<Button variant="outline" size="sm" type="button">
							Select Files
						</Button>
					</Label>
					<Input
						id="file-upload"
						type="file"
						multiple
						class="hidden"
						on:change={(e) => {
							const target = e.target;
							if (target && target instanceof HTMLInputElement) {
								selectedFiles = target.files;
							}
						}}
					/>
				</div>

				{#if selectedFiles && selectedFiles.length > 0}
					<div class="space-y-2">
						<div class="text-sm font-medium">
							{selectedFiles.length} file(s) selected
						</div>
						<div class="max-h-48 overflow-y-auto space-y-2 border rounded-lg p-3">
							{#each Array.from(selectedFiles) as file}
								<div class="flex items-center justify-between text-sm">
									<div class="flex-1 min-w-0">
										<p class="truncate font-medium">{file.name}</p>
										<p class="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
									</div>
									<button
										class="ml-2 p-1 hover:bg-accent rounded"
										on:click={() => {
											if (selectedFiles) {
												const dt = new DataTransfer();
												Array.from(selectedFiles).forEach((f) => {
													if (f !== file) {
														dt.items.add(f);
													}
												});
												selectedFiles = dt.files.length > 0 ? dt.files : null;
											}
										}}
										title="Remove file"
									>
										<X class="h-4 w-4 text-destructive" />
									</button>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<div class="flex gap-2 pt-4">
					<Button
						variant="outline"
						class="flex-1"
						on:click={() => {
							selectedFiles = null;
							isDraggingInModal = false;
							dragCounterInModal = 0;
							showUploadModal = false;
						}}
						disabled={uploadingFiles}
					>
						Cancel
					</Button>
					<Button
						class="flex-1"
						on:click={handleFileUpload}
						disabled={!selectedFiles || selectedFiles.length === 0 || uploadingFiles}
					>
						{uploadingFiles ? 'Uploading...' : 'Upload'}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

