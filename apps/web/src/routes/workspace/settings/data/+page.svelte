<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/stores';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { ChevronLeft, Download, Trash2, Database, Shield, AlertCircle, Archive, FileDown } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	// Accept SvelteKit props to avoid warnings
	export let data: any;

	let analyticsEnabled = true;
	let crashReportsEnabled = true;
	let marketingEmails = false;
	let exporting = false;
	let deleting = false;

	const exportOptions = [
		{
			id: 'all',
			title: 'All Data',
			description: 'Export all your documents, tasks, and settings',
			size: '~25 MB'
		},
		{
			id: 'documents',
			title: 'Documents Only',
			description: 'Export all your documents and pages',
			size: '~20 MB'
		},
		{
			id: 'tasks',
			title: 'Tasks Only',
			description: 'Export all your tasks and projects',
			size: '~5 MB'
		}
	];

	async function exportData(type: string) {
		exporting = true;
		try {
			// Simulate export
			await new Promise(resolve => setTimeout(resolve, 2000));
			toast.success(`Export started. You'll receive an email when your ${type} export is ready.`);
		} catch (error) {
			toast.error('Failed to start export');
		} finally {
			exporting = false;
		}
	}

	async function deleteAccount() {
		const confirmed = confirm('Are you sure you want to delete your account? This action cannot be undone.');
		if (!confirmed) return;

		deleting = true;
		try {
			// Simulate deletion
			await new Promise(resolve => setTimeout(resolve, 2000));
			toast.success('Account deletion requested. You will receive a confirmation email.');
		} catch (error) {
			toast.error('Failed to delete account');
		} finally {
			deleting = false;
		}
	}

	function updatePrivacySetting(setting: string, value: boolean) {
		toast.success('Privacy settings updated');
	}
</script>

<div class="container max-w-4xl p-6">
	<div class="mb-6">
		<Button variant="ghost" size="sm" on:click={() => goto('/workspace/settings')}>
			<ChevronLeft class="mr-2 h-4 w-4" />
			Back to Settings
		</Button>
	</div>

	<div class="mb-8">
		<h1 class="text-3xl font-bold">Data & Privacy</h1>
		<p class="text-muted-foreground">Manage your data and privacy preferences</p>
	</div>

	<div class="grid gap-6">
		<!-- Privacy Settings -->
		<Card>
			<CardHeader>
				<CardTitle>
					<div class="flex items-center gap-2">
						<Shield class="h-5 w-5" />
						Privacy Settings
					</div>
				</CardTitle>
				<CardDescription>Control how we collect and use your data</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="flex items-center justify-between">
					<div class="space-y-1">
						<Label for="analytics">Usage Analytics</Label>
						<p class="text-sm text-muted-foreground">
							Help us improve Kollab by sharing anonymous usage data
						</p>
					</div>
					<Switch
						id="analytics"
						checked={analyticsEnabled}
						onCheckedChange={(value) => {
							analyticsEnabled = value;
							updatePrivacySetting('analytics', value);
						}}
					/>
				</div>

				<div class="flex items-center justify-between">
					<div class="space-y-1">
						<Label for="crash">Crash Reports</Label>
						<p class="text-sm text-muted-foreground">
							Automatically send crash reports to help us fix issues
						</p>
					</div>
					<Switch
						id="crash"
						checked={crashReportsEnabled}
						onCheckedChange={(value) => {
							crashReportsEnabled = value;
							updatePrivacySetting('crashReports', value);
						}}
					/>
				</div>

				<div class="flex items-center justify-between">
					<div class="space-y-1">
						<Label for="marketing">Marketing Communications</Label>
						<p class="text-sm text-muted-foreground">
							Receive tips, updates, and offers from Kollab
						</p>
					</div>
					<Switch
						id="marketing"
						checked={marketingEmails}
						onCheckedChange={(value) => {
							marketingEmails = value;
							updatePrivacySetting('marketing', value);
						}}
					/>
				</div>
			</CardContent>
		</Card>

		<!-- Export Data -->
		<Card>
			<CardHeader>
				<CardTitle>
					<div class="flex items-center gap-2">
						<Database class="h-5 w-5" />
						Export Your Data
					</div>
				</CardTitle>
				<CardDescription>Download a copy of your Kollab data</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				{#each exportOptions as option}
					<div class="flex items-center justify-between rounded-lg border p-4">
						<div class="space-y-1">
							<p class="font-medium">{option.title}</p>
							<p class="text-sm text-muted-foreground">{option.description}</p>
							<p class="text-xs text-muted-foreground">Estimated size: {option.size}</p>
						</div>
						<Button
							variant="outline"
							on:click={() => exportData(option.id)}
							disabled={exporting}
						>
							{#if exporting}
								Preparing...
							{:else}
								<Download class="mr-2 h-4 w-4" />
								Export
							{/if}
						</Button>
					</div>
				{/each}

				<Alert>
					<FileDown class="h-4 w-4" />
					<AlertTitle>Export Format</AlertTitle>
					<AlertDescription>
						Your data will be exported in standard formats: Markdown for documents, JSON for structured data, and CSV for tables.
					</AlertDescription>
				</Alert>
			</CardContent>
		</Card>

		<!-- Data Retention -->
		<Card>
			<CardHeader>
				<CardTitle>
					<div class="flex items-center gap-2">
						<Archive class="h-5 w-5" />
						Data Retention
					</div>
				</CardTitle>
				<CardDescription>How long we keep your data</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				<div class="space-y-2">
					<div class="flex justify-between text-sm">
						<span>Active documents</span>
						<span class="text-muted-foreground">Kept indefinitely</span>
					</div>
					<div class="flex justify-between text-sm">
						<span>Deleted items</span>
						<span class="text-muted-foreground">30 days in trash</span>
					</div>
					<div class="flex justify-between text-sm">
						<span>Version history</span>
						<span class="text-muted-foreground">90 days</span>
					</div>
					<div class="flex justify-between text-sm">
						<span>Activity logs</span>
						<span class="text-muted-foreground">180 days</span>
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Delete Account -->
		<Card class="border-destructive/50">
			<CardHeader>
				<CardTitle class="text-destructive">
					<div class="flex items-center gap-2">
						<Trash2 class="h-5 w-5" />
						Delete Account
					</div>
				</CardTitle>
				<CardDescription>Permanently delete your account and all data</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<Alert variant="destructive">
					<AlertCircle class="h-4 w-4" />
					<AlertTitle>Warning</AlertTitle>
					<AlertDescription>
						Deleting your account is permanent and cannot be undone. All your documents, tasks, and settings will be permanently removed.
					</AlertDescription>
				</Alert>

				<div class="space-y-2 text-sm text-muted-foreground">
					<p>When you delete your account:</p>
					<ul class="ml-6 list-disc space-y-1">
						<li>All your documents and data will be permanently deleted</li>
						<li>You'll lose access to all shared workspaces</li>
						<li>Your username will become available to others</li>
						<li>This action cannot be reversed</li>
					</ul>
				</div>

				<Button
					variant="destructive"
					on:click={deleteAccount}
					disabled={deleting}
				>
					{#if deleting}
						Processing...
					{:else}
						Delete My Account
					{/if}
				</Button>
			</CardContent>
		</Card>
	</div>
</div>
