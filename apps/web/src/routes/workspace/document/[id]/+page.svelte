<script lang="ts">
	import { page } from "$app/stores";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import Editor from "$lib/components/editor/Editor.svelte";
	import ExportMenu from "$lib/components/ExportMenu.svelte";
	import { Button } from "$lib/components/ui/button";
	import { MoreHorizontal, Download, Share2, Star, Clock, Trash2 } from "lucide-svelte";
	import { api, endpoints } from "$lib/api-client";
	import { log } from "$lib/logger";

	// Accept SvelteKit props to avoid warnings
	export let data: any;

	let document: any = null;
	let loading = true;
	let saving = false;
	let showExportMenu = false;
	let showMoreMenu = false;

	$: documentId = $page.params.id;

	onMount(() => {
		loadDocument();
	});

	async function loadDocument() {
		loading = true;
		try {
			const data = await api.get(endpoints.documents.get(documentId));
			document = data.document;
		} catch (error) {
			log.error("Load document error", error instanceof Error ? error : new Error(String(error)), { documentId });
			toast.error("Failed to load document");
			goto("/workspace");
		} finally {
			loading = false;
		}
	}
</script>

{#if loading}
	<div class="flex h-full items-center justify-center">
		<div class="text-center">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
			<p class="mt-2 text-sm text-muted-foreground">Loading document...</p>
		</div>
	</div>
{:else if document}
	<div class="flex h-full flex-col">
		<!-- Document Header -->
		<header class="border-b px-6 py-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<h1 class="text-2xl font-bold">{document.title}</h1>
				</div>
				<Button variant="outline" size="sm" on:click={() => showExportMenu = true}>
					<Download class="h-4 w-4 mr-2" />
					Export
				</Button>
			</div>
		</header>
		<!-- Editor -->
		<div class="flex-1 overflow-auto p-6">
			<Editor content={document.content} placeholder="Start typing..." />
		</div>
	</div>
	<ExportMenu bind:isOpen={showExportMenu} {documentId} documentTitle={document.title} />
{/if}
