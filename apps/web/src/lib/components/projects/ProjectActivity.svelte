<script lang="ts">
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Clock, User, FileText, CheckCircle2 } from 'lucide-svelte';
	import type { Project } from '$lib/services/project-service';

	export let project: Project;

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString('fr-FR', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getTimeAgo(date: string) {
		const now = new Date();
		const past = new Date(date);
		const diffMs = now.getTime() - past.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
		if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
		if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
		return formatDate(date);
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>Recent Activity</CardTitle>
		<CardDescription>Project timeline and updates</CardDescription>
	</CardHeader>
	<CardContent>
		<div class="space-y-4">
			<div class="flex items-start gap-3">
				<div class="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
					<CheckCircle2 class="h-4 w-4 text-primary" />
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium">Project created</p>
					<p class="text-xs text-muted-foreground mt-1">
						{getTimeAgo(project.createdAt)}
					</p>
				</div>
			</div>

			{#if project.updatedAt !== project.createdAt}
				<div class="flex items-start gap-3">
					<div class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
						<Clock class="h-4 w-4 text-blue-600 dark:text-blue-400" />
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium">Last updated</p>
						<p class="text-xs text-muted-foreground mt-1">
							{getTimeAgo(project.updatedAt)}
						</p>
					</div>
				</div>
			{/if}

			<div class="pt-4 border-t">
				<p class="text-xs text-muted-foreground text-center">
					Activity feed coming soon
				</p>
			</div>
		</div>
	</CardContent>
</Card>

