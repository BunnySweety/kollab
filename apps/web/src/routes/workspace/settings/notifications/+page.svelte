<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Bell, Mail, Volume2, Smartphone } from 'lucide-svelte';
	import { api, endpoints } from '$lib/api-client';
	import { notificationStore } from '$lib/stores/notifications';
	import { log } from '$lib/logger';

	// Accept SvelteKit props to avoid warnings
	export let data: any;

	let preferences = {
		emailEnabled: true,
		emailMentions: true,
		emailComments: true,
		emailTasks: true,
		emailDigest: 'daily',
		inAppMentions: true,
		inAppComments: true,
		inAppTasks: true,
		inAppDocuments: true,
		pushEnabled: false,
		soundEnabled: true
	};

	let loading = false;
	let saving = false;

	onMount(async () => {
		await loadPreferences();
	});

	async function loadPreferences() {
		loading = true;
		try {
			const data = await api.get(endpoints.notifications.preferences);
			preferences = data.preferences;
		} catch (error) {
			log.error('Load preferences error', error instanceof Error ? error : new Error(String(error)));
			toast.error('Failed to load notification preferences');
		} finally {
			loading = false;
		}
	}

	async function savePreferences() {
		saving = true;
		try {
			await api.put(endpoints.notifications.preferences, preferences);
			toast.success('Notification preferences saved');
		} catch (error) {
			log.error('Save preferences error', error instanceof Error ? error : new Error(String(error)), { preferences });
			toast.error('Failed to save preferences');
		} finally {
			saving = false;
		}
	}

	async function requestPushPermission() {
		if (!('Notification' in window)) {
			toast.error('Your browser does not support notifications');
			return;
		}

		// Check current permission status
		const currentStatus = notificationStore.getPermissionStatus();
		if (currentStatus === 'denied') {
			toast.error('Notification permission was denied. Please enable it in your browser settings.');
			return;
		}

		if (currentStatus === 'granted') {
			preferences.pushEnabled = true;
			await savePreferences();
			toast.success('Push notifications enabled');
			return;
		}

		// Request permission using the store method (which handles denied state)
		const granted = await notificationStore.requestPermission();
		if (granted) {
			preferences.pushEnabled = true;
			await savePreferences();
			toast.success('Push notifications enabled');
		} else {
			toast.error('Push notification permission denied');
		}
	}
</script>

<div class="mx-auto max-w-4xl p-6">
	<h1 class="mb-6 text-2xl font-bold">Notification Settings</h1>

	{#if loading}
		<div class="flex justify-center py-12">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
		</div>
	{:else}
		<div class="space-y-8">
			<!-- In-App Notifications -->
			<div class="rounded-lg border p-6">
				<div class="mb-4 flex items-center gap-3">
					<Bell class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-semibold">In-App Notifications</h2>
				</div>

				<div class="space-y-4">
					<label class="flex items-center justify-between">
						<span>Mentions</span>
						<input
							type="checkbox"
							bind:checked={preferences.inAppMentions}
							class="rounded border-gray-300"
						/>
					</label>

					<label class="flex items-center justify-between">
						<span>Comments on your documents</span>
						<input
							type="checkbox"
							bind:checked={preferences.inAppComments}
							class="rounded border-gray-300"
						/>
					</label>

					<label class="flex items-center justify-between">
						<span>Task assignments</span>
						<input
							type="checkbox"
							bind:checked={preferences.inAppTasks}
							class="rounded border-gray-300"
						/>
					</label>

					<label class="flex items-center justify-between">
						<span>Document sharing</span>
						<input
							type="checkbox"
							bind:checked={preferences.inAppDocuments}
							class="rounded border-gray-300"
						/>
					</label>
				</div>
			</div>

			<!-- Email Notifications -->
			<div class="rounded-lg border p-6">
				<div class="mb-4 flex items-center gap-3">
					<Mail class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-semibold">Email Notifications</h2>
				</div>

				<div class="space-y-4">
					<label class="flex items-center justify-between">
						<span>Enable email notifications</span>
						<input
							type="checkbox"
							bind:checked={preferences.emailEnabled}
							class="rounded border-gray-300"
						/>
					</label>

					{#if preferences.emailEnabled}
						<div class="ml-6 space-y-4">
							<label class="flex items-center justify-between">
								<span>Mentions</span>
								<input
									type="checkbox"
									bind:checked={preferences.emailMentions}
									class="rounded border-gray-300"
								/>
							</label>

							<label class="flex items-center justify-between">
								<span>Comments</span>
								<input
									type="checkbox"
									bind:checked={preferences.emailComments}
									class="rounded border-gray-300"
								/>
							</label>

							<label class="flex items-center justify-between">
								<span>Task assignments</span>
								<input
									type="checkbox"
									bind:checked={preferences.emailTasks}
									class="rounded border-gray-300"
								/>
							</label>

							<label class="flex flex-col gap-2">
								<span>Email digest frequency</span>
								<select
									bind:value={preferences.emailDigest}
									class="rounded border bg-background px-3 py-2"
								>
									<option value="none">No digest</option>
									<option value="daily">Daily</option>
									<option value="weekly">Weekly</option>
								</select>
							</label>
						</div>
					{/if}
				</div>
			</div>

			<!-- Sound & Push Notifications -->
			<div class="rounded-lg border p-6">
				<div class="mb-4 flex items-center gap-3">
					<Volume2 class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-semibold">Sound & Push</h2>
				</div>

				<div class="space-y-4">
					<label class="flex items-center justify-between">
						<span>Play sound for notifications</span>
						<input
							type="checkbox"
							bind:checked={preferences.soundEnabled}
							class="rounded border-gray-300"
						/>
					</label>

					<div class="flex items-center justify-between">
						<div>
							<p>Browser push notifications</p>
							<p class="text-sm text-muted-foreground">
								Get notified even when the app is not open
							</p>
						</div>
						{#if preferences.pushEnabled}
							<span class="text-sm text-green-600">Enabled</span>
						{:else}
							<Button size="sm" on:click={requestPushPermission}>
								Enable
							</Button>
						{/if}
					</div>
				</div>
			</div>

			<!-- Save Button -->
			<div class="flex justify-end gap-4">
				<Button variant="outline" on:click={loadPreferences}>
					Cancel
				</Button>
				<Button on:click={savePreferences} disabled={saving}>
					{saving ? 'Saving...' : 'Save Preferences'}
				</Button>
			</div>
		</div>
	{/if}
</div>
