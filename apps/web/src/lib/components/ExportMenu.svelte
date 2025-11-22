<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { FileText, FileCode, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';

	export let documentId: string;
	export let documentTitle: string = 'Document';
	export let isOpen = false;

	const dispatch = createEventDispatcher();

	let exporting = false;
	let selectedFormat: 'markdown' | 'pdf' | null = null;

	async function exportDocument(format: 'markdown' | 'pdf') {
		if (exporting) return;

		selectedFormat = format;
		exporting = true;

		try {
			const endpoint = format === 'markdown' 
				? endpoints.export.markdown(documentId)
				: endpoints.export.pdf(documentId);
			
			const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
			const response = await fetch(`${apiBaseUrl}${endpoint}`, {
				credentials: 'include'
			});

			if (!response.ok) {
				throw new Error('Export failed');
			}

			// Get filename from Content-Disposition header
			const contentDisposition = response.headers.get('Content-Disposition');
			const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
			const filename = filenameMatch ? filenameMatch[1] : `${documentTitle}.${format === 'pdf' ? 'pdf' : 'md'}`;

			// Download the file
			const blob = await response.blob();
			const blobUrl = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.style.display = 'none';
			a.href = blobUrl;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(blobUrl);
			document.body.removeChild(a);

			toast.success(`Document exported as ${format.toUpperCase()}`);
			close();
		} catch (error) {
			log.error('Export error', error instanceof Error ? error : new Error(String(error)), { documentId, format });
			toast.error(`Failed to export document as ${format.toUpperCase()}`);
		} finally {
			exporting = false;
			selectedFormat = null;
		}
	}

	function close() {
		isOpen = false;
		dispatch('close');
	}
</script>

{#if isOpen}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
		on:click={close}
		aria-label="Close export menu"
	/>

	<!-- Export Dialog -->
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-4">
		<div class="rounded-lg border bg-popover shadow-lg">
			<!-- Header -->
			<div class="flex items-center justify-between border-b p-4">
				<h3 class="text-lg font-semibold">Export Document</h3>
				<Button
					size="icon"
					variant="ghost"
					on:click={close}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<!-- Content -->
			<div class="p-4">
				<p class="mb-4 text-sm text-muted-foreground">
					Choose a format to export "{documentTitle}"
				</p>

				<div class="space-y-3">
					<!-- Markdown Export -->
					<button
						class="w-full rounded-lg border p-4 text-left hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						on:click={() => exportDocument('markdown')}
						disabled={exporting}
					>
						<div class="flex items-start gap-3">
							<div class="flex-shrink-0">
								{#if exporting && selectedFormat === 'markdown'}
									<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
								{:else}
									<FileCode class="h-5 w-5 text-primary" />
								{/if}
							</div>
							<div class="flex-1">
								<h4 class="font-medium">Markdown</h4>
								<p class="text-sm text-muted-foreground mt-1">
									Export as Markdown file (.md) for use in other apps or version control
								</p>
							</div>
						</div>
					</button>

					<!-- PDF Export -->
					<button
						class="w-full rounded-lg border p-4 text-left hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						on:click={() => exportDocument('pdf')}
						disabled={exporting}
					>
						<div class="flex items-start gap-3">
							<div class="flex-shrink-0">
								{#if exporting && selectedFormat === 'pdf'}
									<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
								{:else}
									<FileText class="h-5 w-5 text-primary" />
								{/if}
							</div>
							<div class="flex-1">
								<h4 class="font-medium">PDF</h4>
								<p class="text-sm text-muted-foreground mt-1">
									Export as PDF document for printing or sharing
								</p>
							</div>
						</div>
					</button>
				</div>

				<!-- Additional Options -->
				<div class="mt-6 pt-4 border-t">
					<h4 class="text-sm font-medium mb-2">Export Options</h4>
					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<input type="checkbox" checked class="rounded" />
							<span class="text-sm">Include metadata (creation date, etc.)</span>
						</label>
						<label class="flex items-center gap-2">
							<input type="checkbox" checked class="rounded" />
							<span class="text-sm">Include document styling</span>
						</label>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="flex justify-end gap-2 border-t p-4">
				<Button variant="outline" on:click={close} disabled={exporting}>
					Cancel
				</Button>
			</div>
		</div>
	</div>
{/if}