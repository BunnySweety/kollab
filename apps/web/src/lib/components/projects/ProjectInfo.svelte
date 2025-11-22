<script lang="ts">
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Calendar, Clock } from 'lucide-svelte';
	import type { Project } from '$lib/services/project-service';

	export let project: Project;

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString('fr-FR', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>Project Information</CardTitle>
		<CardDescription>Details and configuration of this project</CardDescription>
	</CardHeader>
	<CardContent class="space-y-6">
		<div class="space-y-2">
			<label class="text-sm font-semibold text-muted-foreground">Name</label>
			<p class="text-base font-semibold">{project.name}</p>
		</div>

		{#if project.description}
			<div class="space-y-2">
				<label class="text-sm font-semibold text-muted-foreground">Description</label>
				<p class="text-sm whitespace-pre-wrap leading-relaxed">{project.description}</p>
			</div>
		{:else}
			<div class="space-y-2">
				<label class="text-sm font-semibold text-muted-foreground">Description</label>
				<p class="text-sm text-muted-foreground italic">No description provided</p>
			</div>
		{/if}

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div class="space-y-2">
				<label class="text-sm font-semibold text-muted-foreground flex items-center gap-2">
					<Calendar class="h-4 w-4" />
					Created
				</label>
				<p class="text-sm">{formatDate(project.createdAt)}</p>
			</div>

			<div class="space-y-2">
				<label class="text-sm font-semibold text-muted-foreground flex items-center gap-2">
					<Clock class="h-4 w-4" />
					Last Updated
				</label>
				<p class="text-sm">{formatDate(project.updatedAt)}</p>
			</div>
		</div>

		{#if project.isArchived}
			<div class="pt-4 border-t">
				<span class="text-xs px-2.5 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 rounded-full font-medium">
					Archived Project
				</span>
			</div>
		{/if}
	</CardContent>
</Card>
