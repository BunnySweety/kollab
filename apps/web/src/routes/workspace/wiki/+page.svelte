<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { 
		Plus, 
		Search, 
		ChevronRight, 
		ChevronDown, 
		MoreHorizontal,
		Edit,
		Trash2,
		Star,
		StarOff,
		Copy,
		Eye,
		Clock,
		Users,
		FileText,
		X,
		Move,
		Smile,
		PanelLeftClose,
		PanelLeft,
		Home,
		Download,
		FileType,
		Link2,
		Activity,
		Command,
		Folder,
		FolderOpen
	} from 'lucide-svelte';
	import {
		WikiService,
		type WikiPage,
		type CreateWikiPageData,
		type UpdateWikiPageData
	} from '$lib/services/wiki-service';
	import { currentWorkspaceId } from '$lib/stores/workspace';
	import { toast } from 'svelte-sonner';
	import { log } from '$lib/logger';
	import Editor from '$lib/components/editor/Editor.svelte';
	import { commandPaletteStore } from '$lib/stores/commandPalette';
	import type { PageData } from '$lib/types';

	export const data: PageData = {};

	let pages: WikiPage[] = [];
	let filteredPages: WikiPage[] = [];
	let loading = true;
	let searchQuery = '';
	let selectedPage: WikiPage | null = null;
	let expandedPages: Set<string> = new Set();
	let showActionsMenu: string | null = null;

	let isEditing = false;
	let editContent: unknown = null;
	let isSaving = false;

	let showNewPageDialog = false;
	let newPageTitle = '';
	let newPageParentId: string | null = null;

	let showMovePageDialog = false;
	let pageToMove: WikiPage | null = null;
	let newParentForMove: string | null = null;

	let showIconPicker = false;
	let pageForIcon: WikiPage | null = null;
	let selectedIcon = '';

	let sidebarCollapsed = false;
	let recentPages: WikiPage[] = [];
	let starredPageIds: Set<string> = new Set();

	// Drag & drop state
	let draggedPage: WikiPage | null = null;
	let dragOverPageId: string | null = null;
	let dropPosition: 'before' | 'after' | 'inside' | null = null;

	let showQuickSwitcher = false;
	let quickSwitcherQuery = '';
	let quickSwitcherResults: WikiPage[] = [];
	let quickSwitcherSelectedIndex = 0;

	let showTemplateDialog = false;
	let selectedTemplate: string | null = null;

	let pageBacklinks: WikiPage[] = [];
	let pageAnalytics: { views: number; uniqueViewers: number; lastViewed: string | null } | null = null;

	let currentWorkspace: string | null = null;
	let lastWorkspaceLoaded: string | null = null;

	// Inline editing state
	let editingPageId: string | null = null;
	let editingPageTitle: string = '';
	let showQuickCreateInput = false;
	let quickCreateTitle = '';
	let quickCreateParentId: string | null = null;
	let quickCreateType: 'page' | 'folder' | 'template' = 'page';
	let editingHeaderTitle = false;
	let headerTitleInput: HTMLInputElement | null = null;
	let showInlineTemplateMenu = false;

	$: currentWorkspace = $currentWorkspaceId;
	
	// Quick switcher search
	$: if (quickSwitcherQuery) {
		const query = quickSwitcherQuery.toLowerCase();
		quickSwitcherResults = pages.filter(p => 
			p.title.toLowerCase().includes(query) ||
			p.excerpt?.toLowerCase().includes(query)
		).slice(0, 10);
		quickSwitcherSelectedIndex = 0;
	} else {
		quickSwitcherResults = recentPages.slice(0, 10);
	}

	// Keyboard shortcuts
	onMount(() => {
		const handleKeyboard = (e: KeyboardEvent) => {
			const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
			const modifier = isMac ? e.metaKey : e.ctrlKey;

			// Cmd/Ctrl + K - Open command palette
			if (modifier && e.key === 'k') {
				e.preventDefault();
				commandPaletteStore.open();
			}

			// Cmd/Ctrl + P - Quick switcher
			if (modifier && e.key === 'p') {
				e.preventDefault();
				showQuickSwitcher = true;
				quickSwitcherQuery = '';
			}

			// Cmd/Ctrl + N - New page
			if (modifier && e.key === 'n') {
				e.preventDefault();
				newPageParentId = null;
				showNewPageDialog = true;
			}

			// Cmd/Ctrl + E - Edit current page
			if (modifier && e.key === 'e' && selectedPage && !isEditing) {
				e.preventDefault();
				startEditing();
			}

			// Cmd/Ctrl + S - Save page
			if (modifier && e.key === 's' && isEditing) {
				e.preventDefault();
				savePage();
			}

			// Escape - Cancel editing or close dialogs
			if (e.key === 'Escape') {
				if (isEditing) {
					cancelEditing();
				} else if (showQuickSwitcher) {
					showQuickSwitcher = false;
					quickSwitcherQuery = '';
				} else if (showNewPageDialog) {
					showNewPageDialog = false;
					newPageTitle = '';
					newPageParentId = null;
				} else if (showTemplateDialog) {
					showTemplateDialog = false;
					selectedTemplate = null;
				} else if (showMovePageDialog) {
					showMovePageDialog = false;
					pageToMove = null;
					newParentForMove = null;
				} else if (showIconPicker) {
					showIconPicker = false;
					pageForIcon = null;
					selectedIcon = '';
				}
			}

			// Arrow keys in quick switcher
			if (showQuickSwitcher) {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					quickSwitcherSelectedIndex = Math.min(quickSwitcherSelectedIndex + 1, quickSwitcherResults.length - 1);
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					quickSwitcherSelectedIndex = Math.max(quickSwitcherSelectedIndex - 1, 0);
				} else if (e.key === 'Enter' && quickSwitcherResults[quickSwitcherSelectedIndex]) {
					e.preventDefault();
					selectPage(quickSwitcherResults[quickSwitcherSelectedIndex]);
					showQuickSwitcher = false;
					quickSwitcherQuery = '';
				}
			}

			// Cmd/Ctrl + B - Toggle sidebar
			if (modifier && e.key === 'b') {
				e.preventDefault();
				sidebarCollapsed = !sidebarCollapsed;
			}
		};

		window.addEventListener('keydown', handleKeyboard);
		
		// Close menus on click outside
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.group')) {
				showActionsMenu = null;
			}
		};
		
		window.addEventListener('click', handleClickOutside);
		
		return () => {
			window.removeEventListener('keydown', handleKeyboard);
			window.removeEventListener('click', handleClickOutside);
		};
	});

	onMount(async () => {
		if (currentWorkspace) {
			// Load starred pages from localStorage
			if (browser) {
				const stored = localStorage.getItem(`wiki_starred_${currentWorkspace}`);
				if (stored) {
					try {
						starredPageIds = new Set(JSON.parse(stored));
					} catch (e) {
						// Ignore
					}
				}
			}
			
			await loadPages();
			
			// Load recent pages after pages are loaded
			if (browser) {
				const storedRecent = localStorage.getItem(`wiki_recent_${currentWorkspace}`);
				if (storedRecent) {
					try {
						const recentIds = JSON.parse(storedRecent);
						recentPages = recentIds.map((id: string) => pages.find(p => p.id === id)).filter(Boolean);
					} catch (e) {
						// Ignore
					}
				}
			}
		}
	});

	$: if (currentWorkspace && currentWorkspace !== lastWorkspaceLoaded) {
		loadPages();
	}

	$: {
		const filtered = getFilteredPages(pages, searchQuery);
		filteredPages = filtered;
	}

	function getFilteredPages(list: WikiPage[], query: string) {
		let filtered = list.filter((page) => !page.isArchived);

		if (query.trim()) {
			const needle = query.toLowerCase();
			filtered = filtered.filter(
				(page) =>
					page.title.toLowerCase().includes(needle) ||
					page.excerpt?.toLowerCase().includes(needle) ||
					page.slug.toLowerCase().includes(needle)
			);
		}

		return filtered.sort((a, b) => {
			if (!a.parentId && b.parentId) return -1;
			if (a.parentId && !b.parentId) return 1;
			if (a.order !== b.order) return a.order - b.order;
			return a.title.localeCompare(b.title);
		});
	}

	function buildPageTree(list: WikiPage[]): (WikiPage & { children: WikiPage[] })[] {
		const map = new Map<string, WikiPage & { children: WikiPage[] }>();
		const tree: (WikiPage & { children: WikiPage[] })[] = [];

		list.forEach((page) => {
			map.set(page.id, { ...page, children: [] });
		});

		list.forEach((page) => {
			const node = map.get(page.id);
			if (!node) return;

			if (page.parentId) {
				const parent = map.get(page.parentId);
				if (parent) {
					parent.children.push(node);
				} else {
					tree.push(node);
				}
			} else {
				tree.push(node);
			}
		});

		return tree;
	}

	function togglePage(pageId: string) {
		if (expandedPages.has(pageId)) {
			expandedPages.delete(pageId);
		} else {
			expandedPages.add(pageId);
		}
		expandedPages = new Set(expandedPages);
	}

	function focusTextInput() {
		setTimeout(() => {
			const input = document.querySelector('input[type="text"]');
			if (input && 'focus' in input) {
				(input as HTMLInputElement).focus();
			}
		}, 0);
	}

	function generateSlug(title: string): string {
		return title
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	function cleanTipTapContent(content: unknown): unknown {
		if (!content || typeof content !== 'object') return content;
		
		// Helper to clean text nodes
		const cleanNode = (node: unknown): unknown => {
			if (!node || typeof node !== 'object') return node;
			const n = node as { type?: string; text?: string; content?: unknown[]; [key: string]: unknown };
			
			// Remove empty text nodes
			if (n.type === 'text' && n.text === '') {
				return null;
			}
			
			// Clean child content recursively
			if (Array.isArray(n.content)) {
				n.content = n.content.map(child => cleanNode(child)).filter(child => child !== null);
			}
			
			return n;
		};
		
		return cleanNode(content);
	}

	async function loadPages() {
		if (!currentWorkspace) {
			pages = [];
			loading = false;
			return;
		}

		loading = true;
		lastWorkspaceLoaded = currentWorkspace;

		try {
			log.info('Loading wiki pages', { workspaceId: currentWorkspace });
			const response = await WikiService.listByWorkspace(currentWorkspace);
			
			// Clean TipTap content to remove empty text nodes
			pages = response.map(page => ({
				...page,
				content: cleanTipTapContent(page.content)
			}));
			
			if (!selectedPage && pages.length > 0) {
				selectPage(pages[0]);
			}
		} catch (error) {
			log.error('Failed to load wiki pages', error, { workspaceId: currentWorkspace });
			toast.error('Échec du chargement des pages wiki');
			pages = [];
		} finally {
			loading = false;
		}
	}

	async function createPage(isFolder: boolean = false) {
		if (!currentWorkspace || !newPageTitle.trim()) {
			toast.error('Veuillez entrer un titre');
			return;
		}

		try {
			const slug = generateSlug(newPageTitle);
			const pageData: CreateWikiPageData = {
				workspaceId: currentWorkspace,
				title: newPageTitle.trim(),
				slug,
				content: isFolder ? null : { type: 'doc', content: [] },
				excerpt: isFolder ? 'Dossier' : undefined,
				parentId: newPageParentId || undefined
			};

			const page = await WikiService.create(pageData);
			toast.success(isFolder ? 'Dossier créé' : 'Page créée');
			
			await loadPages();
			if (!isFolder) {
				selectPage(page);
			}
			
			showNewPageDialog = false;
			newPageTitle = '';
			newPageParentId = null;
		} catch (error: unknown) {
			log.error('Create wiki page error', error, { workspaceId: currentWorkspace });
			toast.error('Échec de la création');
		}
	}

	async function quickCreatePage() {
		if (!currentWorkspace || !quickCreateTitle.trim()) {
			return;
		}

		try {
			const slug = generateSlug(quickCreateTitle);
			
			let content = null;
			let excerpt = undefined;
			
			// Determine content based on type
			if (quickCreateType === 'folder') {
				content = null;
				excerpt = 'Dossier';
			} else if (quickCreateType === 'template' && selectedTemplate) {
				content = getTemplateContent(selectedTemplate);
			} else {
				content = { type: 'doc', content: [] };
			}
			
			const pageData: CreateWikiPageData = {
				workspaceId: currentWorkspace,
				title: quickCreateTitle.trim(),
				slug,
				content,
				excerpt,
				parentId: quickCreateParentId || undefined
			};

			const page = await WikiService.create(pageData);
			
			const typeLabel = quickCreateType === 'folder' ? 'Dossier créé' : 
			                   quickCreateType === 'template' ? 'Page créée depuis template' : 
			                   'Page créée';
			toast.success(typeLabel);
			
			await loadPages();
			if (quickCreateType !== 'folder') {
				selectPage(page);
			}
			
			showQuickCreateInput = false;
			showInlineTemplateMenu = false;
			quickCreateTitle = '';
			quickCreateParentId = null;
			quickCreateType = 'page';
			selectedTemplate = null;
		} catch (error: unknown) {
			log.error('Quick create wiki page error', error, { workspaceId: currentWorkspace });
			toast.error('Échec de la création');
		}
	}

	function startEditingPageTitle(page: WikiPage, event?: Event) {
		event?.stopPropagation();
		editingPageId = page.id;
		editingPageTitle = page.title;
	}

	async function savePageTitle(pageId: string) {
		if (!editingPageTitle.trim() || editingPageTitle === pages.find(p => p.id === pageId)?.title) {
			editingPageId = null;
			return;
		}

		try {
			await WikiService.update(pageId, { 
				title: editingPageTitle.trim(),
				slug: generateSlug(editingPageTitle.trim())
			});
			toast.success('Titre modifié');
			await loadPages();
			editingPageId = null;
		} catch (error: unknown) {
			log.error('Update page title error', error, { pageId });
			toast.error('Échec de la modification');
		}
	}

	async function saveHeaderTitle() {
		if (!selectedPage || !editingPageTitle.trim() || editingPageTitle === selectedPage.title) {
			editingHeaderTitle = false;
			return;
		}

		try {
			await WikiService.update(selectedPage.id, { 
				title: editingPageTitle.trim(),
				slug: generateSlug(editingPageTitle.trim())
		});
		toast.success('Titre modifié');
		await loadPages();
		// Update selected page
		const updated = pages.find(p => p.id === selectedPage?.id);
		if (updated) {
			selectedPage = updated;
		}
		editingHeaderTitle = false;
		} catch (error: unknown) {
			log.error('Update header title error', error, { pageId: selectedPage.id });
			toast.error('Échec de la modification');
		}
	}

	function isFolder(page: WikiPage): boolean {
		return page.excerpt === 'Dossier' || (page.content === null);
	}

	// Drag & drop handlers
	function handleDragStart(e: DragEvent, page: WikiPage) {
		draggedPage = page;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', page.id);
		}
		// Add dragging class to element
		const target = e.currentTarget as HTMLElement;
		target.classList.add('opacity-50');
	}

	function handleDragEnd(e: DragEvent) {
		const target = e.currentTarget as HTMLElement;
		target.classList.remove('opacity-50');
		draggedPage = null;
		dragOverPageId = null;
		dropPosition = null;
	}

	function handleDragOver(e: DragEvent, page: WikiPage) {
		if (!draggedPage || draggedPage.id === page.id) return;
		
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}

		// Determine drop position based on mouse position
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const y = e.clientY - rect.top;
		const height = rect.height;

		dragOverPageId = page.id;

		// If it's a folder or has children, allow dropping inside
		if ((isFolder(page) || pages.some(p => p.parentId === page.id)) && y > height * 0.3 && y < height * 0.7) {
			dropPosition = 'inside';
		} else if (y < height * 0.3) {
			dropPosition = 'before';
		} else {
			dropPosition = 'after';
		}
	}

	function handleDragLeave() {
		dragOverPageId = null;
		dropPosition = null;
	}

	async function handleDrop(e: DragEvent, targetPage: WikiPage) {
		e.preventDefault();
		
		if (!draggedPage || draggedPage.id === targetPage.id) {
			draggedPage = null;
			dragOverPageId = null;
			dropPosition = null;
			return;
		}

		try {
			let updateData: UpdateWikiPageData = {};

			if (dropPosition === 'inside') {
				// Move inside the target (make it a child)
				updateData.parentId = targetPage.id;
			} else if (dropPosition === 'before' || dropPosition === 'after') {
				// Move to same level as target
				updateData.parentId = targetPage.parentId;
			}

			await WikiService.update(draggedPage.id, updateData);
			toast.success('Page déplacée');
			await loadPages();
		} catch (error: unknown) {
			log.error('Drop page error', error, { draggedPageId: draggedPage?.id, targetPageId: targetPage.id });
			toast.error('Échec du déplacement');
		} finally {
			draggedPage = null;
			dragOverPageId = null;
			dropPosition = null;
		}
	}

	async function savePage() {
		if (!selectedPage || !isEditing) return;

		isSaving = true;
		try {
			const updateData: UpdateWikiPageData = {
				content: editContent || undefined
			};

			const updated = await WikiService.update(selectedPage.id, updateData);
			selectedPage = updated;
			isEditing = false;
			editContent = null;
			toast.success('Page enregistrée');
			
			await loadPages();
		} catch (error: unknown) {
			log.error('Update wiki page error', error, { pageId: selectedPage?.id });
			toast.error('Échec de l\'enregistrement');
		} finally {
			isSaving = false;
		}
	}

	async function deletePage(page: WikiPage) {
		if (!confirm(`Supprimer "${page.title}" ?`)) return;

		try {
			await WikiService.delete(page.id);
			toast.success('Page supprimée');
			
			if (selectedPage?.id === page.id) {
				selectedPage = null;
			}
			
			await loadPages();
		} catch (error: unknown) {
			log.error('Delete wiki page error', error, { pageId: page.id });
			toast.error('Échec de la suppression');
		}
	}

	async function selectPage(page: WikiPage) {
		// If it's a folder, just toggle it instead of selecting
		if (isFolder(page)) {
			togglePage(page.id);
			return;
		}

		selectedPage = page;
		isEditing = false;
		editContent = null;
		showActionsMenu = null;
		
		// Add to recent pages
		recentPages = [page, ...recentPages.filter(p => p.id !== page.id)].slice(0, 5);
		
		// Save to localStorage
		if (browser) {
			localStorage.setItem(`wiki_recent_${currentWorkspace}`, JSON.stringify(recentPages.map(p => p.id)));
		}

		// Record view and load analytics
		WikiService.recordView(page.id).catch(() => {}); // Non-blocking
		loadPageBacklinks(page.id);
		loadPageAnalytics(page.id);
	}

	async function loadPageBacklinks(pageId: string) {
		try {
			pageBacklinks = await WikiService.getBacklinks(pageId);
		} catch (error: unknown) {
			log.error('Load backlinks error', error, { pageId });
			pageBacklinks = [];
		}
	}

	async function loadPageAnalytics(pageId: string) {
		try {
			const analytics = await WikiService.getAnalytics(pageId);
			pageAnalytics = {
				views: analytics.totalViews,
				uniqueViewers: analytics.uniqueViewers,
				lastViewed: analytics.lastViewed
			};
		} catch (error: unknown) {
			log.error('Load analytics error', error, { pageId });
			pageAnalytics = null;
		}
	}

	function startEditing() {
		if (!selectedPage) return;
		isEditing = true;
		editContent = structuredClone(selectedPage.content ?? { type: 'doc', content: [] });
	}

	function cancelEditing() {
		isEditing = false;
		editContent = null;
	}

	function toggleStarred(pageId: string) {
		if (starredPageIds.has(pageId)) {
			starredPageIds.delete(pageId);
		} else {
			starredPageIds.add(pageId);
		}
		starredPageIds = new Set(starredPageIds);
		
		// Save to localStorage
		if (browser) {
			localStorage.setItem(`wiki_starred_${currentWorkspace}`, JSON.stringify([...starredPageIds]));
		}
	}

	async function duplicatePage(page: WikiPage) {
		if (!currentWorkspace) return;

		try {
			const slug = generateSlug(page.title + '-copy');
			const pageData: CreateWikiPageData = {
				workspaceId: currentWorkspace,
				title: page.title + ' (copie)',
				slug,
				content: page.content,
				excerpt: page.excerpt || undefined,
				parentId: page.parentId || undefined
			};

			const newPage = await WikiService.create(pageData);
			toast.success('Page dupliquée');
			
			await loadPages();
			selectPage(newPage);
		} catch (error: unknown) {
			log.error('Duplicate wiki page error', error, { pageId: page.id });
			toast.error('Échec de la duplication');
		}
	}

	async function movePage() {
		if (!pageToMove) return;

		try {
			const updateData: UpdateWikiPageData = {
				parentId: newParentForMove
			};

			await WikiService.update(pageToMove.id, updateData);
			toast.success('Page déplacée');
			
			showMovePageDialog = false;
			pageToMove = null;
			newParentForMove = null;
			
			await loadPages();
		} catch (error: unknown) {
			log.error('Move wiki page error', error, { pageId: pageToMove?.id });
			toast.error('Échec du déplacement');
		}
	}

	async function updatePageIcon() {
		if (!pageForIcon || !selectedIcon) return;

		try {
			const updateData: UpdateWikiPageData = {
				icon: selectedIcon
			};

			await WikiService.update(pageForIcon.id, updateData);
			
			if (selectedPage?.id === pageForIcon.id) {
				selectedPage.icon = selectedIcon;
			}
			
			showIconPicker = false;
			pageForIcon = null;
			selectedIcon = '';
			
			await loadPages();
			toast.success('Icône mise à jour');
		} catch (error: unknown) {
			log.error('Update page icon error', error, { pageId: pageForIcon?.id });
			toast.error('Échec de la mise à jour');
		}
	}

	function copyPageLink(page: WikiPage) {
		if (!browser) return;
		
		const url = `${window.location.origin}/workspace/wiki?page=${page.id}`;
		navigator.clipboard.writeText(url).then(() => {
			toast.success('Lien copié');
		}).catch(() => {
			toast.error('Échec de la copie');
		});
	}

	function getBreadcrumbs(page: WikiPage): Array<{ id: string; title: string }> {
		const breadcrumbs: Array<{ id: string; title: string }> = [];
		let currentPageId: string | null = page.parentId;
		
		while (currentPageId) {
			const parentPage = pages.find(p => p.id === currentPageId);
			if (!parentPage) break;
			
			breadcrumbs.unshift({ id: parentPage.id, title: parentPage.title });
			currentPageId = parentPage.parentId;
		}
		
		return breadcrumbs;
	}

	async function exportAsMarkdown() {
		if (!selectedPage) return;

		try {
			const markdown = convertToMarkdown(selectedPage);
			const blob = new Blob([markdown], { type: 'text/markdown' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${selectedPage.slug}.md`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success('Page exportée en Markdown');
		} catch (error: unknown) {
			log.error('Export markdown error', error, { pageId: selectedPage?.id });
			toast.error('Échec de l\'export');
		}
	}

	function convertToMarkdown(page: WikiPage): string {
		let markdown = `# ${page.title}\n\n`;
		
		if (page.excerpt) {
			markdown += `> ${page.excerpt}\n\n`;
		}
		
		// Basic conversion from TipTap JSON to Markdown
		// This is a simplified version - you might want a more robust converter
		if (page.content && typeof page.content === 'object' && 'content' in page.content) {
			const content = page.content as { content?: Array<{ type: string; content?: unknown; text?: string }> };
			if (content.content) {
				for (const node of content.content) {
					if (node.type === 'paragraph' && node.content) {
						const paragraphContent = node.content as Array<{ text?: string }>;
						const text = paragraphContent.map(n => n.text || '').join('');
						markdown += `${text}\n\n`;
					} else if (node.type === 'heading' && node.content) {
						const headingContent = node.content as Array<{ text?: string }>;
						const text = headingContent.map(n => n.text || '').join('');
						markdown += `## ${text}\n\n`;
					}
				}
			}
		}
		
		return markdown;
	}

	function getTemplateContent(template: string): unknown {
		const templates: Record<string, unknown> = {
			blank: { 
				type: 'doc', 
				content: [] 
			},
			meeting: {
				type: 'doc',
				content: [
						{ 
							type: 'heading', 
							attrs: { level: 2 }, 
							content: [{ type: 'text', text: '📅 Informations générales' }] 
						},
						{ 
							type: 'paragraph', 
							content: [
								{ type: 'text', marks: [{ type: 'bold' }], text: 'Date : ' },
								{ type: 'text', text: new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }
							] 
						},
						{ 
							type: 'paragraph', 
							content: [
								{ type: 'text', marks: [{ type: 'bold' }], text: 'Heure : ' }
							] 
						},
						{ 
							type: 'paragraph', 
							content: [
								{ type: 'text', marks: [{ type: 'bold' }], text: 'Lieu : ' }
							] 
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '👥 Participants' }] },
						{ 
							type: 'bulletList', 
							content: [
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[Nom] - [Rôle]' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[Nom] - [Rôle]' }] }] }
							] 
						},
						{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Absents excusés : ' }] },
						{ type: 'paragraph' },
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📋 Ordre du jour' }] },
						{ 
							type: 'orderedList', 
							content: [
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Point 1 : ' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Point 2 : ' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Point 3 : ' }] }] }
							] 
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📝 Notes et discussions' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Point 1' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Discussion et décisions...' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Point 2' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Discussion et décisions...' }] },
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '✅ Actions et décisions' }] },
						{ 
							type: 'table',
							content: [
								{
									type: 'tableRow',
									content: [
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Action' }] }] },
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Responsable' }] }] },
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Échéance' }] }] }
									]
								},
								{
									type: 'tableRow',
									content: [
										{ type: 'tableCell', content: [{ type: 'paragraph' }] },
										{ type: 'tableCell', content: [{ type: 'paragraph' }] },
										{ type: 'tableCell', content: [{ type: 'paragraph' }] }
									]
								}
							]
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📅 Prochaine réunion' }] },
						{ 
							type: 'paragraph', 
							content: [
								{ type: 'text', marks: [{ type: 'bold' }], text: 'Date proposée : ' }
							] 
						}
					]
			},
			project: {
				type: 'doc',
				content: [
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🎯 Vue d\'ensemble' }] },
						{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Nom du projet : ' }] },
						{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Statut : ' }, { type: 'text', text: '🔵 En cours' }] },
						{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Date de début : ' }] },
						{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Date de fin prévue : ' }] },
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '💡 Objectifs' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Objectif principal' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Décrire l\'objectif principal du projet...' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Objectifs secondaires' }] },
						{ 
							type: 'bulletList', 
							content: [
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Objectif 1' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Objectif 2' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Objectif 3' }] }] }
							] 
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📖 Contexte et enjeux' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Expliquer le contexte dans lequel s\'inscrit ce projet, les problématiques à résoudre et les enjeux stratégiques...' }] },
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '👥 Équipe projet' }] },
						{
							type: 'table',
							content: [
								{
									type: 'tableRow',
									content: [
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nom' }] }] },
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rôle' }] }] },
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Responsabilités' }] }] }
									]
								},
								{
									type: 'tableRow',
									content: [
										{ type: 'tableCell', content: [{ type: 'paragraph' }] },
										{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chef de projet' }] }] },
										{ type: 'tableCell', content: [{ type: 'paragraph' }] }
									]
								}
							]
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📅 Planning et jalons' }] },
						{ 
							type: 'bulletList', 
							content: [
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Phase 1 : ' }, { type: 'text', text: 'Description - Date' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Phase 2 : ' }, { type: 'text', text: 'Description - Date' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Phase 3 : ' }, { type: 'text', text: 'Description - Date' }] }] }
							] 
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '💰 Budget' }] },
						{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Budget alloué : ' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Détails des postes de dépenses...' }] },
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📊 Indicateurs de succès' }] },
						{ 
							type: 'bulletList', 
							content: [
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'KPI 1 : ' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'KPI 2 : ' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'KPI 3 : ' }] }] }
							] 
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '⚠️ Risques et contraintes' }] },
						{
							type: 'table',
							content: [
								{
									type: 'tableRow',
									content: [
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Risque' }] }] },
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Impact' }] }] },
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mitigation' }] }] }
									]
								},
								{
									type: 'tableRow',
									content: [
										{ type: 'tableCell', content: [{ type: 'paragraph' }] },
										{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Faible/Moyen/Fort' }] }] },
										{ type: 'tableCell', content: [{ type: 'paragraph' }] }
									]
								}
							]
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📎 Ressources et liens' }] },
						{ 
							type: 'bulletList', 
							content: [
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lien vers ressource 1' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lien vers ressource 2' }] }] }
							] 
						}
					]
			},
			documentation: {
				type: 'doc',
				content: [
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📘 Introduction' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Brève description de ce que couvre cette documentation...' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'À propos' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Contexte et objectif de cette documentation.' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Public cible' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Cette documentation s\'adresse à...' }] },
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '✅ Prérequis' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Avant de commencer, assurez-vous d\'avoir :' }] },
						{ 
							type: 'bulletList', 
							content: [
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Prérequis technique 1' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Prérequis technique 2' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Connaissances requises' }] }] }
							] 
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '⚙️ Installation' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Étape 1 : Configuration initiale' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Description détaillée de la première étape...' }] },
						{ type: 'codeBlock', attrs: { language: 'bash' }, content: [{ type: 'text', text: '# Exemple de commande\nnpm install package-name' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Étape 2 : Configuration' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Instructions de configuration...' }] },
						{ type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: '// Exemple de configuration\nconst config = {\n  option1: true,\n  option2: "value"\n};' }] },
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🚀 Démarrage rapide' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Pour démarrer rapidement :' }] },
						{ 
							type: 'orderedList', 
							content: [
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Étape 1 de démarrage' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Étape 2 de démarrage' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Étape 3 de démarrage' }] }] }
							] 
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📖 Utilisation' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Fonctionnalité principale' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Description détaillée de l\'utilisation...' }] },
						{ type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: '// Exemple d\'utilisation\nfunction example() {\n  // votre code ici\n}' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Options avancées' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Pour des utilisations plus avancées...' }] },
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🔧 Référence API' }] },
						{
							type: 'table',
							content: [
								{
									type: 'tableRow',
									content: [
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Méthode' }] }] },
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Description' }] }] },
										{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Paramètres' }] }] }
									]
								},
								{
									type: 'tableRow',
									content: [
										{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'method()' }] }] },
										{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Description' }] }] },
										{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'params' }] }] }
									]
								}
							]
						},
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '❓ FAQ' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Question fréquente 1 ?' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Réponse détaillée...' }] },
						{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Question fréquente 2 ?' }] },
						{ type: 'paragraph', content: [{ type: 'text', text: 'Réponse détaillée...' }] },
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🐛 Résolution de problèmes' }] },
						{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Problème : ' }, { type: 'text', text: 'Description du problème courant' }] },
						{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Solution : ' }, { type: 'text', text: 'Étapes pour résoudre...' }] },
						{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📚 Ressources complémentaires' }] },
						{ 
							type: 'bulletList', 
							content: [
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lien vers documentation officielle' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tutoriels vidéo' }] }] },
								{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Communauté et support' }] }] }
							] 
						}
					]
			}
		};

		return templates[template] || templates.blank;
	}

	async function createFromTemplate() {
		if (!currentWorkspace || !selectedTemplate) return;

		const templateData: Record<string, { title: string; excerpt: string }> = {
			meeting: {
				title: 'Réunion - ' + new Date().toLocaleDateString('fr-FR'),
				excerpt: 'Notes de réunion structurées'
			},
			project: {
				title: 'Nouveau Projet',
				excerpt: 'Documentation complète de projet'
			},
			documentation: {
				title: 'Documentation',
				excerpt: 'Guide complet de documentation'
			},
			blank: {
				title: 'Nouvelle page',
				excerpt: ''
			}
		};

		const template = templateData[selectedTemplate];
		if (!template) return;

		try {
			const slug = generateSlug(template.title);
			const pageData: CreateWikiPageData = {
				workspaceId: currentWorkspace,
				title: template.title,
				slug,
				content: getTemplateContent(selectedTemplate),
				excerpt: template.excerpt || undefined,
				parentId: newPageParentId || undefined
			};

			const newPage = await WikiService.create(pageData);
			toast.success('Page créée à partir du template');
			
			showTemplateDialog = false;
			selectedTemplate = null;
			
			await loadPages();
			selectPage(newPage);
			
			// Start editing immediately
			startEditing();
		} catch (error: unknown) {
			log.error('Create from template error', error, { template: selectedTemplate });
			toast.error('Échec de la création');
		}
	}

	function getOutlineFromContent(content?: unknown) {
		if (!content || typeof content !== 'object' || !('content' in content)) {
			return [];
		}
		
		const sections: Array<{ id: string; text: string; level: number }> = [];
		const nodes = (content as { content?: Array<{ type?: string; attrs?: { level?: number }; content?: Array<{ text?: string }> }> }).content || [];
		
		nodes.forEach((node) => {
			if (!node || typeof node !== 'object') return;
			if (node.type === 'heading' && Array.isArray(node.content)) {
				const text = node.content.map((c) => c?.text ?? '').join('').trim();
				if (text.length > 0) {
					sections.push({
						id: generateSlug(text),
						text,
						level: node.attrs?.level || 1
					});
				}
			}
		});
		
		return sections;
	}

	function renderPageWithChildren(
		pageNode: WikiPage & { children: WikiPage[] },
		level: number = 0
	): Array<{ page: WikiPage; level: number; hasChildren: boolean; isExpanded: boolean }> {
		const hasChildren = pageNode.children && pageNode.children.length > 0;
		const isExpanded = expandedPages.has(pageNode.id);
		
		const result: Array<{ page: WikiPage; level: number; hasChildren: boolean; isExpanded: boolean }> = [
			{ page: pageNode, level, hasChildren, isExpanded }
		];

		if (isExpanded && hasChildren) {
			pageNode.children.forEach((child) => {
				result.push(...renderPageWithChildren(child as WikiPage & { children: WikiPage[] }, level + 1));
			});
		}

		return result;
	}

	$: pageTree = buildPageTree(filteredPages);
	// Force reactivity by including expandedPages.size in the expression
	$: flatTree = expandedPages.size >= 0 ? pageTree.flatMap((node) => renderPageWithChildren(node)) : [];
	$: outlineSections = selectedPage ? getOutlineFromContent(selectedPage.content) : [];
	$: breadcrumbs = selectedPage ? getBreadcrumbs(selectedPage) : [];
	$: starredPages = pages.filter(p => starredPageIds.has(p.id) && !isFolder(p));
	$: recentPagesFiltered = recentPages.filter(p => !isFolder(p));
</script>

<svelte:head>
	<title>Wiki - Kollab</title>
</svelte:head>

<div class="flex h-screen bg-background">
	<!-- Sidebar -->
	{#if !sidebarCollapsed}
		<aside class="w-64 border-r flex flex-col overflow-hidden" transition:fly={{ x: -260, duration: 200 }}>
			<!-- Header -->
			<div class="p-4 border-b flex items-center justify-between">
				<h2 class="font-semibold text-lg">Wiki</h2>
				<Button
					size="sm"
					variant="ghost"
					class="h-8 w-8 p-0"
					on:click={() => sidebarCollapsed = true}
					title="Masquer la sidebar (Cmd+B)"
				>
					<PanelLeftClose class="h-4 w-4" />
				</Button>
									</div>

			<!-- Search -->
			<div class="p-3 border-b">
				<div class="relative">
					<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
										<Input
						type="text"
						placeholder="Rechercher..."
						bind:value={searchQuery}
						class="pl-9 h-9"
					/>
									</div>
			</div>

			<!-- Pages tree -->
			<div class="flex-1 overflow-y-auto p-2">
				{#if loading}
					<div class="flex items-center justify-center p-8 text-sm text-muted-foreground">
						Chargement...
								</div>
							{:else}
					<!-- Starred pages -->
					{#if starredPages.length > 0}
						<div class="mb-4">
							<div class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
								Favoris
								</div>
							<div class="space-y-0.5">
								{#each starredPages as page}
									<div class="group relative">
										<button
											class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors"
											class:bg-accent={selectedPage?.id === page.id}
											class:font-medium={selectedPage?.id === page.id}
											on:click={() => selectPage(page)}
											on:contextmenu={(e) => {
												e.preventDefault();
												showActionsMenu = page.id;
											}}
										>
										{#if page.icon}
											<span class="text-base leading-none">{page.icon}</span>
										{:else}
											<FileText class="h-4 w-4 text-muted-foreground" />
								{/if}
										{#if editingPageId === page.id}
											<input
												type="text"
												class="flex-1 bg-transparent border-b border-primary focus:outline-none px-1"
												bind:value={editingPageTitle}
												on:blur={() => savePageTitle(page.id)}
												on:keydown={(e) => {
													if (e.key === 'Enter') {
														savePageTitle(page.id);
													} else if (e.key === 'Escape') {
														editingPageId = null;
													}
											}}
											on:click|stopPropagation
										/>
									{:else}
										<span 
											role="button"
											tabindex="0"
											class="flex-1 text-left truncate cursor-pointer"
											on:dblclick={(e) => startEditingPageTitle(page, e)}
											on:keydown={(e) => {
												if (e.key === 'Enter') {
													startEditingPageTitle(page, e);
												}
											}}
										>
											{page.title}
										</span>
						{/if}
									<Star class="h-3 w-3 fill-current text-yellow-500" />
										</button>
						</div>
								{/each}
						</div>
					</div>
					{/if}

					<!-- Recent pages -->
					{#if recentPagesFiltered.length > 0}
						<div class="mb-4">
							<div class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
								Récents
							</div>
							<div class="space-y-0.5">
								{#each recentPagesFiltered as page}
									<div class="group relative">
										<button
											class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors"
											class:bg-accent={selectedPage?.id === page.id}
											class:font-medium={selectedPage?.id === page.id}
											on:click={() => selectPage(page)}
											on:contextmenu={(e) => {
												e.preventDefault();
												showActionsMenu = page.id;
											}}
										>
										{#if page.icon}
											<span class="text-base leading-none">{page.icon}</span>
										{:else}
											<FileText class="h-4 w-4 text-muted-foreground" />
					{/if}
										{#if editingPageId === page.id}
											<input
												type="text"
												class="flex-1 bg-transparent border-b border-primary focus:outline-none px-1"
												bind:value={editingPageTitle}
												on:blur={() => savePageTitle(page.id)}
												on:keydown={(e) => {
													if (e.key === 'Enter') {
														savePageTitle(page.id);
													} else if (e.key === 'Escape') {
														editingPageId = null;
													}
											}}
											on:click|stopPropagation
										/>
									{:else}
										<span 
											role="button"
											tabindex="0"
											class="flex-1 text-left truncate cursor-pointer"
											on:dblclick={(e) => startEditingPageTitle(page, e)}
											on:keydown={(e) => {
												if (e.key === 'Enter') {
													startEditingPageTitle(page, e);
												}
											}}
										>
											{page.title}
										</span>
									{/if}
									<Clock class="h-3 w-3 text-muted-foreground" />
										</button>
							</div>
								{/each}
								</div>
							</div>
									{/if}

					<!-- All pages -->
					{#if flatTree.length === 0}
						<div class="flex flex-col items-center justify-center p-8 text-center">
							<FileText class="h-12 w-12 text-muted-foreground/50 mb-3" />
							<p class="text-sm text-muted-foreground">Aucune page</p>
							<Button
								size="sm"
								variant="outline"
								class="mt-3"
								on:click={() => {
									newPageParentId = null;
									showNewPageDialog = true;
								}}
							>
								<Plus class="h-4 w-4 mr-2" />
								Créer une page
								</Button>
						</div>
					{:else}
						<div class="mb-2">
							<div class="flex items-center justify-between px-2 py-1">
								<div class="text-xs font-semibold text-muted-foreground uppercase">
									Toutes les pages
						</div>
								<div class="flex items-center gap-1">
									<Button
										size="sm"
										variant="ghost"
										class="h-5 w-5 p-0"
										on:click={() => {
											showQuickCreateInput = true;
											quickCreateType = 'page';
											quickCreateParentId = null;
										}}
										title="Nouvelle page"
									>
										<Plus class="h-3.5 w-3.5" />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										class="h-5 w-5 p-0"
										on:click={() => {
											showQuickCreateInput = true;
											quickCreateType = 'folder';
											quickCreateParentId = null;
											quickCreateTitle = 'Nouveau dossier';
										}}
										title="Nouveau dossier"
									>
										<Folder class="h-3.5 w-3.5" />
									</Button>
								<Button
									size="sm"
									variant="ghost"
									class="h-5 w-5 p-0"
									on:click={() => {
										if (!showQuickCreateInput) {
											showQuickCreateInput = true;
											quickCreateType = 'template';
											quickCreateParentId = null;
											showInlineTemplateMenu = true;
											selectedTemplate = null;
										}
									}}
									title="Depuis template"
								>
									<FileType class="h-3.5 w-3.5" />
								</Button>
				</div>
			</div>
							
						{#if showQuickCreateInput}
							<div class="px-2 mb-2" transition:fly={{ y: -5, duration: 200 }}>
								<!-- Template selection -->
								{#if showInlineTemplateMenu}
									<div class="p-2 mb-2 bg-muted/30 rounded-md border">
										<div class="text-xs font-medium text-muted-foreground mb-2">Choisir un template</div>
										<div class="grid grid-cols-2 gap-2">
											<button
												class="px-3 py-2 text-xs font-medium rounded border bg-background hover:bg-accent hover:border-primary transition-colors text-left"
											on:click={() => {
												selectedTemplate = 'blank';
												showInlineTemplateMenu = false;
												quickCreateTitle = 'Page vierge';
												focusTextInput();
											}}
											>
												📄 Vierge
											</button>
											<button
												class="px-3 py-2 text-xs font-medium rounded border bg-background hover:bg-accent hover:border-primary transition-colors text-left"
											on:click={() => {
												selectedTemplate = 'meeting';
												showInlineTemplateMenu = false;
												quickCreateTitle = 'Réunion';
												focusTextInput();
											}}
											>
												🤝 Réunion
											</button>
											<button
												class="px-3 py-2 text-xs font-medium rounded border bg-background hover:bg-accent hover:border-primary transition-colors text-left"
											on:click={() => {
												selectedTemplate = 'project';
												showInlineTemplateMenu = false;
												quickCreateTitle = 'Projet';
												focusTextInput();
											}}
											>
												🚀 Projet
											</button>
											<button
												class="px-3 py-2 text-xs font-medium rounded border bg-background hover:bg-accent hover:border-primary transition-colors text-left"
											on:click={() => {
												selectedTemplate = 'documentation';
												showInlineTemplateMenu = false;
												quickCreateTitle = 'Documentation';
												focusTextInput();
											}}
											>
												📚 Doc
											</button>
				</div>
			</div>
								{:else}
									<!-- Title input with icon (only shown when not selecting template) -->
									<div class="flex items-center gap-2">
										<div class="flex-shrink-0">
											{#if quickCreateType === 'folder'}
												<Folder class="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
											{:else if quickCreateType === 'template' && selectedTemplate}
												<FileType class="h-4 w-4 text-primary" />
											{:else}
												<FileText class="h-4 w-4 text-muted-foreground" />
											{/if}
			</div>
										<input
											type="text"
											class="flex-1 px-2 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
											placeholder={quickCreateType === 'folder' ? 'Nom du dossier...' : 'Nom de la page...'}
											bind:value={quickCreateTitle}
											on:keydown={(e) => {
												if (e.key === 'Enter') {
													quickCreatePage();
												} else if (e.key === 'Escape') {
													showQuickCreateInput = false;
													showInlineTemplateMenu = false;
													quickCreateTitle = '';
													quickCreateType = 'page';
													selectedTemplate = null;
												}
											}}
											on:blur={() => {
												if (!quickCreateTitle.trim()) {
													setTimeout(() => {
														showQuickCreateInput = false;
														quickCreateType = 'page';
														selectedTemplate = null;
														showInlineTemplateMenu = false;
													}, 200);
												}
											}}
										/>
		</div>
									
									<!-- Create button for templates -->
									{#if quickCreateType === 'template' && selectedTemplate}
			<Button
											size="sm"
											class="w-full mt-2"
											on:click={quickCreatePage}
										>
											Créer la page
			</Button>
									{/if}
								{/if}
			</div>
						{/if}
						</div>
						<div class="space-y-0.5">
							{#each flatTree as { page, level, hasChildren, isExpanded }}
								<div
									class="group relative"
									style="padding-left: {level * 16}px"
								>
								<div
									role="listitem"
									draggable="true"
									class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors cursor-move"
									class:bg-accent={selectedPage?.id === page.id}
									class:font-medium={selectedPage?.id === page.id}
									class:border-t-2={dragOverPageId === page.id && dropPosition === 'before'}
									class:border-b-2={dragOverPageId === page.id && dropPosition === 'after'}
									class:ring-2={dragOverPageId === page.id && dropPosition === 'inside'}
									class:ring-primary={dragOverPageId === page.id && dropPosition === 'inside'}
									class:border-primary={dragOverPageId === page.id}
									on:contextmenu={(e) => {
										e.preventDefault();
										showActionsMenu = page.id;
									}}
									on:dragstart={(e) => handleDragStart(e, page)}
									on:dragend={handleDragEnd}
									on:dragover={(e) => handleDragOver(e, page)}
									on:dragleave={handleDragLeave}
									on:drop={(e) => handleDrop(e, page)}
								>
							{#if hasChildren}
								<button
												class="p-0.5 hover:bg-accent-foreground/10 rounded"
												on:click|stopPropagation={() => togglePage(page.id)}
											>
												{#if isExpanded}
													<ChevronDown class="h-3.5 w-3.5" />
												{:else}
													<ChevronRight class="h-3.5 w-3.5" />
												{/if}
								</button>
							{:else}
											<div class="w-4" />
							{/if}
										
								{#if isFolder(page)}
									{#if hasChildren && isExpanded}
										<FolderOpen class="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
									{:else}
										<Folder class="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
									{/if}
								{:else if page.icon}
									<span class="text-base leading-none">{page.icon}</span>
								{:else}
									<FileText class="h-4 w-4 text-muted-foreground" />
								{/if}
								
								{#if editingPageId === page.id}
									<input
										type="text"
										class="flex-1 bg-transparent border-b-2 border-primary focus:outline-none focus:ring-0 px-1 py-0.5 text-sm min-w-0"
										bind:value={editingPageTitle}
										on:blur={() => savePageTitle(page.id)}
									on:keydown={(e) => {
										if (e.key === 'Enter') {
											savePageTitle(page.id);
										} else if (e.key === 'Escape') {
											editingPageId = null;
										}
									}}
									on:click|stopPropagation
								/>
								{:else}
						<button
										class="flex-1 text-left truncate min-w-0"
							on:click|stopPropagation={() => selectPage(page)}
										on:dblclick={(e) => {
											e.stopPropagation();
											startEditingPageTitle(page, e);
										}}
									>
										{page.title}
									</button>
								{/if}
								</div>

									<!-- Actions menu -->
									<div class="absolute right-2 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
								<Button
											size="sm"
									variant="ghost"
											class="h-6 w-6 p-0"
											on:click={(e) => {
												e.stopPropagation();
												showActionsMenu = showActionsMenu === page.id ? null : page.id;
											}}
										>
											<MoreHorizontal class="h-3.5 w-3.5" />
								</Button>
									</div>
									
									{#if showActionsMenu === page.id}
										<div 
											class="absolute right-2 top-8 w-56 rounded-md border bg-popover shadow-lg z-50"
											transition:fade={{ duration: 100 }}
										>
											<div class="p-1">
												<button
													class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded"
													on:click={() => {
														toggleStarred(page.id);
														showActionsMenu = null;
													}}
												>
													{#if starredPageIds.has(page.id)}
														<StarOff class="h-4 w-4" />
														Retirer des favoris
													{:else}
														<Star class="h-4 w-4" />
														Ajouter aux favoris
													{/if}
												</button>
												<button
													class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded"
													on:click={() => {
														pageForIcon = page;
														showIconPicker = true;
														showActionsMenu = null;
													}}
												>
													<Smile class="h-4 w-4" />
													Changer l'icône
												</button>
												<button
													class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded"
													on:click={() => {
														copyPageLink(page);
														showActionsMenu = null;
													}}
												>
													<Copy class="h-4 w-4" />
													Copier le lien
												</button>
												<div class="border-t my-1"></div>
												<button
													class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded"
													on:click={() => {
														newPageParentId = page.id;
														showNewPageDialog = true;
														showActionsMenu = null;
													}}
												>
													<Plus class="h-4 w-4" />
													Nouvelle sous-page
												</button>
												<button
													class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded"
													on:click={async () => {
														newPageParentId = page.id;
														newPageTitle = 'Nouveau dossier';
														await createPage(true);
														showActionsMenu = null;
													}}
												>
													<Folder class="h-4 w-4" />
													Nouveau sous-dossier
												</button>
												<button
													class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded"
													on:click={() => {
														duplicatePage(page);
														showActionsMenu = null;
													}}
												>
													<Copy class="h-4 w-4" />
													Dupliquer
												</button>
												<button
													class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded"
													on:click={() => {
														pageToMove = page;
														newParentForMove = page.parentId;
														showMovePageDialog = true;
														showActionsMenu = null;
													}}
												>
													<Move class="h-4 w-4" />
													Déplacer
												</button>
												<div class="border-t my-1"></div>
												<button
													class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded text-destructive"
													on:click={() => {
														deletePage(page);
														showActionsMenu = null;
													}}
												>
													<Trash2 class="h-4 w-4" />
													Supprimer
												</button>
							</div>
						</div>
				{/if}
			</div>
							{/each}
						</div>
					{/if}
				{/if}
		</div>
	</aside>
	{/if}

	<!-- Main content -->
	<main class="flex-1 flex overflow-hidden">
		{#if selectedPage}
			<div class="flex-1 flex flex-col overflow-hidden">
				<!-- Page header -->
				<header class="border-b px-24 py-6 flex flex-col gap-4">
					<!-- Top bar -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3 flex-1 min-w-0">
							<!-- Show sidebar button -->
							{#if sidebarCollapsed}
						<Button
									size="sm"
									variant="ghost"
									class="h-8 w-8 p-0"
									on:click={() => sidebarCollapsed = false}
									title="Afficher la sidebar (Cmd+B)"
								>
									<PanelLeft class="h-4 w-4" />
						</Button>
			{/if}

							<!-- Breadcrumbs -->
							{#if breadcrumbs.length > 0}
								<nav class="flex items-center gap-2 text-sm text-muted-foreground">
									<button 
										class="hover:text-foreground transition-colors"
										on:click={() => {
											selectedPage = null;
											isEditing = false;
										}}
									>
										<Home class="h-4 w-4" />
									</button>
									{#each breadcrumbs as crumb}
										<ChevronRight class="h-3.5 w-3.5" />
										<button
											class="hover:text-foreground transition-colors truncate max-w-[200px]"
											on:click={() => {
												const page = pages.find(p => p.id === crumb.id);
												if (page) selectPage(page);
											}}
										>
											{crumb.title}
										</button>
				{/each}
					</nav>
						{/if}
					</div>
						
						<div class="flex items-center gap-2 flex-shrink-0">
							{#if pageAnalytics}
								<div class="flex items-center gap-4 text-sm text-muted-foreground mr-4">
									<div class="flex items-center gap-1" title="Nombre de vues">
										<Eye class="h-3.5 w-3.5" />
										<span>{pageAnalytics.views}</span>
				</div>
									<div class="flex items-center gap-1" title="Lecteurs uniques">
										<Users class="h-3.5 w-3.5" />
										<span>{pageAnalytics.uniqueViewers}</span>
									</div>
							</div>
							{/if}
							
							{#if !isEditing}
								<Button
									size="sm"
									variant="ghost"
									on:click={exportAsMarkdown}
									title="Exporter en Markdown"
								>
									<Download class="h-4 w-4" />
								</Button>
								<Button
									size="sm"
									variant="outline"
									on:click={startEditing}
									title="Modifier (Cmd+E)"
								>
									<Edit class="h-4 w-4 mr-2" />
									Modifier
								</Button>
							{:else}
								<Button
									size="sm"
									variant="ghost"
									on:click={cancelEditing}
									disabled={isSaving}
									title="Annuler (Escape)"
								>
									Annuler
								</Button>
								<Button
									size="sm"
									on:click={savePage}
									disabled={isSaving}
									title="Enregistrer (Cmd+S)"
								>
									{isSaving ? 'Enregistrement...' : 'Enregistrer'}
								</Button>
							{/if}
							</div>
						</div>

				<!-- Page title -->
				<div class="flex items-center gap-4 flex-1">
					{#if selectedPage.icon}
						<span class="text-4xl leading-none">{selectedPage.icon}</span>
					{/if}
					{#if editingHeaderTitle}
						<input
							type="text"
							bind:this={headerTitleInput}
							class="text-4xl font-bold bg-transparent border-b-2 border-primary focus:outline-none flex-1"
							bind:value={editingPageTitle}
							on:blur={saveHeaderTitle}
							on:keydown={(e) => {
								if (e.key === 'Enter') {
									saveHeaderTitle();
								} else if (e.key === 'Escape') {
									editingHeaderTitle = false;
								}
							}}
						/>
				{:else}
					<button 
						class="text-4xl font-bold cursor-text hover:text-primary/80 transition-colors text-left"
						on:click={() => {
							editingHeaderTitle = true;
							editingPageTitle = selectedPage?.title || '';
							setTimeout(() => headerTitleInput?.focus(), 0);
						}}
						title="Cliquer pour modifier"
					>
						{selectedPage?.title}
					</button>
				{/if}
								</div>
				</header>

				<!-- Content -->
				<div class="flex-1 overflow-y-auto">
					<div class="px-24 py-12 max-w-full">
						{#if selectedPage.excerpt}
							<p class="text-muted-foreground mb-8 text-lg">{selectedPage.excerpt}</p>
						{/if}

						{#if isEditing}
							<div class="w-full">
									<Editor
										documentId={selectedPage.id}
									bind:content={editContent}
									editable={true}
									/>
								</div>
										{:else}
							<div class="prose prose-xl dark:prose-invert max-w-none">
								<Editor
									documentId={selectedPage.id}
									content={selectedPage.content}
									editable={false}
								/>
							</div>
						{/if}
					</div>
					</div>
				</div>

			<!-- Right sidebar - Backlinks & TOC -->
			{#if (pageBacklinks.length > 0 || outlineSections.length > 0) && !isEditing}
				<aside class="w-64 border-l p-6 overflow-y-auto space-y-8">
					<!-- Backlinks -->
					{#if pageBacklinks.length > 0}
						<div>
							<h3 class="text-xs font-semibold uppercase text-muted-foreground mb-4 flex items-center gap-2">
								<Link2 class="h-3.5 w-3.5" />
								Backlinks ({pageBacklinks.length})
							</h3>
							<div class="space-y-2">
								{#each pageBacklinks as backlink}
									<button
										class="block w-full text-left text-sm hover:bg-accent p-2 rounded transition-colors"
										on:click={() => selectPage(backlink)}
									>
										<div class="flex items-center gap-2">
											{#if backlink.icon}
												<span class="text-base">{backlink.icon}</span>
						{:else}
												<FileText class="h-3.5 w-3.5 text-muted-foreground" />
											{/if}
											<span class="truncate">{backlink.title}</span>
										</div>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Table of contents -->
					{#if outlineSections.length > 0}
						<div>
							<h3 class="text-xs font-semibold uppercase text-muted-foreground mb-4">
								Table des matières
							</h3>
							<nav class="space-y-2">
								{#each outlineSections as section}
										<button
										class="block w-full text-left text-sm hover:text-foreground transition-colors"
										class:text-muted-foreground={true}
										class:pl-0={section.level === 1}
										class:pl-3={section.level === 2}
										class:pl-6={section.level === 3}
											on:click={() => {
												const element = document.getElementById(section.id);
												if (element) {
													element.scrollIntoView({ behavior: 'smooth', block: 'start' });
												}
											}}
										>
												{section.text}
										</button>
								{/each}
							</nav>
						</div>
						{/if}
				</aside>
			{/if}
		{:else}
			<div class="flex-1 flex items-center justify-center">
				<div class="text-center">
					<FileText class="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
					<h3 class="text-lg font-semibold mb-2">Aucune page sélectionnée</h3>
					<p class="text-sm text-muted-foreground mb-4">
						Sélectionnez une page ou créez-en une nouvelle
					</p>
					<Button
						on:click={() => {
							newPageParentId = null;
							showNewPageDialog = true;
						}}
					>
						<Plus class="h-4 w-4 mr-2" />
						Créer une page
					</Button>
				</div>
			</div>
		{/if}
	</main>
					</div>

<!-- New page dialog -->
{#if showNewPageDialog}
	<div
		role="button"
		tabindex="-1"
		class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center"
		transition:fade={{ duration: 200 }}
		on:click={(e) => {
			if (e.target === e.currentTarget) {
				showNewPageDialog = false;
				newPageTitle = '';
				newPageParentId = null;
			}
		}}
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				showNewPageDialog = false;
				newPageTitle = '';
				newPageParentId = null;
			}
		}}
	>
		<div
			role="dialog"
			aria-modal="true"
			class="bg-background border rounded-lg shadow-lg w-full max-w-md p-6"
			transition:fly={{ y: 20, duration: 200, easing: cubicOut }}
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-lg font-semibold">Nouvelle page</h3>
				<Button
					size="sm"
					variant="ghost"
					class="h-8 w-8 p-0"
					on:click={() => {
						showNewPageDialog = false;
						newPageTitle = '';
						newPageParentId = null;
					}}
				>
					<X class="h-4 w-4" />
				</Button>
						</div>

			<div class="space-y-4">
											<div>
					<label for="new-page-title-input" class="text-sm font-medium mb-2 block">
						Titre
					</label>
					<Input
						id="new-page-title-input"
						type="text"
						placeholder="Titre de la page"
						bind:value={newPageTitle}
						on:keydown={(e) => {
							if (e.key === 'Enter') createPage();
						}}
					/>
											</div>

				<div class="flex justify-end gap-2">
					<Button
						variant="ghost"
						on:click={() => {
							showNewPageDialog = false;
							newPageTitle = '';
							newPageParentId = null;
						}}
				>
					Annuler
				</Button>
				<Button
					on:click={() => createPage()}
					disabled={!newPageTitle.trim()}
				>
					Créer
				</Button>
										</div>
									</div>
							</div>
					</div>
{/if}

<!-- Move page dialog -->
{#if showMovePageDialog && pageToMove}
	<div
		role="button"
		tabindex="-1"
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
		on:click={(e) => {
			if (e.target === e.currentTarget) {
				showMovePageDialog = false;
				pageToMove = null;
				newParentForMove = null;
			}
		}}
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				showMovePageDialog = false;
				pageToMove = null;
				newParentForMove = null;
			}
		}}
	>
		<div
			role="dialog"
			aria-modal="true"
			class="bg-background border rounded-lg shadow-lg w-full max-w-md p-6"
			transition:fly={{ y: 20, duration: 200, easing: cubicOut }}
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-lg font-semibold">Déplacer la page</h3>
				<Button
					size="sm"
					variant="ghost"
					class="h-8 w-8 p-0"
					on:click={() => {
						showMovePageDialog = false;
						pageToMove = null;
						newParentForMove = null;
					}}
				>
					<X class="h-4 w-4" />
				</Button>
						</div>

			<div class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Déplacer "{pageToMove.title}" vers :
				</p>

				<div>
					<Label for="parent-select">Page parente</Label>
					<select
						id="parent-select"
				class="w-full px-3 py-2 border rounded-md bg-background"
				bind:value={newParentForMove}
			>
				<option value={null}>Racine (aucun parent)</option>
				{#each pages.filter(p => p.id !== pageToMove?.id) as page}
					<option value={page.id}>
						{page.icon ? page.icon + ' ' : ''}{page.title}
					</option>
				{/each}
			</select>
					</div>

				<div class="flex justify-end gap-2">
					<Button
						variant="ghost"
						on:click={() => {
							showMovePageDialog = false;
							pageToMove = null;
							newParentForMove = null;
						}}
					>
						Annuler
					</Button>
					<Button on:click={movePage}>
						Déplacer
					</Button>
						</div>
			</div>
		</div>
	</div>
{/if}

<!-- Icon picker dialog -->
{#if showIconPicker && pageForIcon}
	<div
		role="button"
		tabindex="-1"
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
		on:click={(e) => {
			if (e.target === e.currentTarget) {
				showIconPicker = false;
				pageForIcon = null;
				selectedIcon = '';
			}
		}}
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				showIconPicker = false;
				pageForIcon = null;
				selectedIcon = '';
			}
		}}
	>
		<div
			role="dialog"
			aria-modal="true"
			class="bg-background border rounded-lg shadow-lg w-full max-w-lg p-6"
			transition:fly={{ y: 20, duration: 200, easing: cubicOut }}
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-lg font-semibold">Choisir une icône</h3>
				<Button
					size="sm"
					variant="ghost"
					class="h-8 w-8 p-0"
					on:click={() => {
						showIconPicker = false;
						pageForIcon = null;
						selectedIcon = '';
					}}
				>
					<X class="h-4 w-4" />
									</Button>
								</div>

			<div class="space-y-4">
				<Input
					type="text"
					placeholder="Rechercher un emoji..."
					class="mb-4"
				/>

				<div class="grid grid-cols-8 gap-2 max-h-80 overflow-y-auto">
					{#each ['📄', '📝', '📋', '📊', '📈', '📉', '🗂️', '📁', '📂', '🗃️', '📚', '📖', '📕', '📗', '📘', '📙', '📓', '📔', '📒', '🗒️', '📰', '🗞️', '💼', '📦', '🎯', '🔖', '🏷️', '✏️', '✒️', '🖊️', '🖋️', '🖍️', '📌', '📍', '🧷', '🔗', '📎', '🖇️', '💡', '🔎', '🔍', '🔬', '🔭', '📡', '🎓', '🏆', '🎨', '🎭', '🎪', '🎬', '🎮', '🎯', '🚀', '⚡', '🔥', '💎', '⭐', '🌟', '✨', '💫', '🔷', '🔶', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '⚪', '⚫', '🟠', '🟡', '🟢', '🟣', '🟤'] as emoji}
						<button
							class="text-2xl p-2 hover:bg-accent rounded transition-colors"
							class:bg-accent={selectedIcon === emoji}
							on:click={() => selectedIcon = emoji}
						>
							{emoji}
						</button>
					{/each}
											</div>

				<div class="flex justify-end gap-2">
												<Button
													variant="ghost"
						on:click={() => {
							showIconPicker = false;
							pageForIcon = null;
							selectedIcon = '';
						}}
					>
						Annuler
												</Button>
												<Button
						on:click={updatePageIcon}
						disabled={!selectedIcon}
					>
						Appliquer
												</Button>
											</div>
										</div>
		</div>
	</div>
										{/if}

<!-- Quick switcher -->
{#if showQuickSwitcher}
	<div
		role="button"
		tabindex="-1"
		class="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-32"
		on:click={(e) => {
			if (e.target === e.currentTarget) {
				showQuickSwitcher = false;
				quickSwitcherQuery = '';
			}
		}}
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				showQuickSwitcher = false;
				quickSwitcherQuery = '';
			}
		}}
	>
		<div
			role="dialog"
			aria-modal="true"
			class="bg-background border rounded-lg shadow-2xl w-full max-w-2xl"
			transition:fly={{ y: -20, duration: 200, easing: cubicOut }}
		>
			<!-- Search input -->
			<div class="p-4 border-b flex items-center gap-3">
				<Command class="h-5 w-5 text-muted-foreground" />
				<Input
					type="text"
					placeholder="Rechercher une page..."
					bind:value={quickSwitcherQuery}
					class="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-lg p-0 h-auto"
				/>
			</div>

			<!-- Results -->
			<div class="max-h-96 overflow-y-auto">
				{#if quickSwitcherResults.length === 0}
					<div class="p-8 text-center text-sm text-muted-foreground">
						Aucune page trouvée
					</div>
				{:else}
					<div class="p-2">
						{#each quickSwitcherResults as page, index}
							<button
								class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors"
								class:bg-accent={index === quickSwitcherSelectedIndex}
								on:click={() => {
									selectPage(page);
									showQuickSwitcher = false;
									quickSwitcherQuery = '';
								}}
								on:mouseenter={() => quickSwitcherSelectedIndex = index}
							>
								{#if page.icon}
									<span class="text-xl">{page.icon}</span>
								{:else}
									<FileText class="h-5 w-5 text-muted-foreground" />
								{/if}
								<div class="flex-1 min-w-0">
									<div class="font-medium truncate">{page.title}</div>
									{#if page.excerpt}
										<div class="text-xs text-muted-foreground truncate">{page.excerpt}</div>
							{/if}
						</div>
								{#if index === quickSwitcherSelectedIndex}
									<div class="text-xs text-muted-foreground">
										↵
					</div>
								{/if}
							</button>
						{/each}
			</div>
				{/if}
			</div>

			<!-- Footer hint -->
			<div class="p-3 border-t bg-muted/50 text-xs text-muted-foreground flex items-center justify-between">
				<span>Utilisez ↑ ↓ pour naviguer</span>
				<span>Entrée pour sélectionner • Escape pour fermer</span>
			</div>
				</div>
			</div>
		{/if}

<!-- Template selection dialog -->
{#if showTemplateDialog}
	<div
		role="button"
		tabindex="-1"
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
		on:click={(e) => {
			if (e.target === e.currentTarget) {
				showTemplateDialog = false;
				selectedTemplate = null;
			}
		}}
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				showTemplateDialog = false;
				selectedTemplate = null;
			}
		}}
	>
		<div
			role="dialog"
			aria-modal="true"
			class="bg-background border rounded-lg shadow-lg w-full max-w-2xl p-6"
			transition:fly={{ y: 20, duration: 200, easing: cubicOut }}
		>
			<div class="flex items-center justify-between mb-6">
				<h3 class="text-lg font-semibold">Choisir un template</h3>
				<Button
					size="sm"
					variant="ghost"
					class="h-8 w-8 p-0"
					on:click={() => {
						showTemplateDialog = false;
						selectedTemplate = null;
					}}
				>
					<X class="h-4 w-4" />
				</Button>
</div>

			<div class="grid grid-cols-2 gap-4 mb-6">
				<button
					class="p-4 border-2 rounded-lg text-left hover:border-primary transition-colors"
					class:border-primary={selectedTemplate === 'meeting'}
					class:bg-accent={selectedTemplate === 'meeting'}
					on:click={() => selectedTemplate = 'meeting'}
				>
					<div class="text-3xl mb-2">📝</div>
					<div class="font-semibold mb-1">Réunion</div>
					<div class="text-xs text-muted-foreground">
						Notes de réunion avec participants, ordre du jour et actions
					</div>
				</button>

				<button
					class="p-4 border-2 rounded-lg text-left hover:border-primary transition-colors"
					class:border-primary={selectedTemplate === 'project'}
					class:bg-accent={selectedTemplate === 'project'}
					on:click={() => selectedTemplate = 'project'}
				>
					<div class="text-3xl mb-2">🎯</div>
					<div class="font-semibold mb-1">Projet</div>
					<div class="text-xs text-muted-foreground">
						Documentation projet avec objectifs, équipe et planning
</div>
				</button>

				<button
					class="p-4 border-2 rounded-lg text-left hover:border-primary transition-colors"
					class:border-primary={selectedTemplate === 'documentation'}
					class:bg-accent={selectedTemplate === 'documentation'}
					on:click={() => selectedTemplate = 'documentation'}
				>
					<div class="text-3xl mb-2">📚</div>
					<div class="font-semibold mb-1">Documentation</div>
					<div class="text-xs text-muted-foreground">
						Guide ou documentation technique structurée
					</div>
				</button>

				<button
					class="p-4 border-2 rounded-lg text-left hover:border-primary transition-colors"
					class:border-primary={selectedTemplate === 'blank'}
					class:bg-accent={selectedTemplate === 'blank'}
					on:click={() => selectedTemplate = 'blank'}
				>
					<div class="text-3xl mb-2">📄</div>
					<div class="font-semibold mb-1">Page vierge</div>
					<div class="text-xs text-muted-foreground">
						Commencer avec une page complètement vide
					</div>
				</button>
			</div>

			<div class="flex justify-end gap-2">
				<Button
					variant="ghost"
					on:click={() => {
						showTemplateDialog = false;
						selectedTemplate = null;
					}}
				>
					Annuler
				</Button>
				<Button
					on:click={createFromTemplate}
					disabled={!selectedTemplate}
				>
					Créer
				</Button>
			</div>
		</div>
	</div>
{/if}
