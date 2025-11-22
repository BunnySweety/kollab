<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { Bell, Check, CheckCheck, X, Settings, Volume2, VolumeX } from 'lucide-svelte';
	import { notificationStore, unreadNotifications } from '$lib/stores/notifications';
	import { Button } from '$lib/components/ui/button';
	import { formatDistanceToNow } from 'date-fns';
	import { api, endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';

	export let user: any;

	let isOpen = false;
	let showSettings = false;
	let soundEnabled = true;

	$: unreadCount = $notificationStore.unreadCount;

	onMount(() => {
		if (user) {
			// Connect to WebSocket for real-time notifications
			notificationStore.connect(user.id);

			// Load existing notifications
			notificationStore.loadNotifications();

			// Request notification permission
			notificationStore.requestPermission();
		}
	});

	onDestroy(() => {
		notificationStore.disconnect();
	});

	function toggleNotifications() {
		isOpen = !isOpen;
		if (isOpen && unreadCount > 0) {
			// Mark visible notifications as read after a delay
			setTimeout(() => {
				$unreadNotifications.slice(0, 5).forEach(n => {
					if (!n.isRead) {
						notificationStore.markAsRead(n.id);
					}
				});
			}, 2000);
		}
	}

	function handleNotificationClick(notification: any) {
		// Mark as read
		if (!notification.isRead) {
			notificationStore.markAsRead(notification.id);
		}

		// Navigate if action URL exists
		if (notification.actionUrl) {
			goto(notification.actionUrl);
			isOpen = false;
		}
	}

	function getNotificationIcon(type: string) {
		switch (type) {
			case 'mention': return '@';
			case 'comment': return '💬';
			case 'task-assigned': return '✅';
			case 'document-shared': return '📄';
			default: return '🔔';
		}
	}

	async function updateSoundPreference(enabled: boolean) {
		soundEnabled = enabled;

		try {
			await api.put(endpoints.notifications.preferences, {
				soundEnabled: enabled
			});
		} catch (error) {
			log.error('Failed to update sound preference', error instanceof Error ? error : new Error(String(error)), { enabled });
		}
	}
</script>

<div class="relative">
	<!-- Notification Bell -->
	<Button
		variant="ghost"
		size="icon"
		on:click={toggleNotifications}
		class="relative"
		aria-label="Notifications"
	>
		<Bell class="h-5 w-5" />
		{#if unreadCount > 0}
			<span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
				{unreadCount > 9 ? '9+' : unreadCount}
			</span>
		{/if}
	</Button>

	<!-- Notification Dropdown -->
	{#if isOpen}
		<div class="absolute right-0 mt-2 w-96 max-h-[600px] bg-popover border rounded-lg shadow-xl z-50 flex flex-col">
			<!-- Header -->
			<div class="p-4 border-b flex items-center justify-between">
				<h3 class="font-semibold">Notifications</h3>
				<div class="flex items-center gap-2">
					{#if $notificationStore.notifications.length > 0}
						<Button
							size="icon"
							variant="ghost"
							on:click={() => notificationStore.markAllAsRead()}
							title="Mark all as read"
						>
							<CheckCheck class="h-4 w-4" />
						</Button>
					{/if}
					<Button
						size="icon"
						variant="ghost"
						on:click={() => showSettings = !showSettings}
						title="Settings"
					>
						<Settings class="h-4 w-4" />
					</Button>
					<Button
						size="icon"
						variant="ghost"
						on:click={() => isOpen = false}
					>
						<X class="h-4 w-4" />
					</Button>
				</div>
			</div>

			<!-- Settings Panel -->
			{#if showSettings}
				<div class="p-4 border-b bg-secondary/50">
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-sm">Sound notifications</span>
							<Button
								size="icon"
								variant={soundEnabled ? 'default' : 'ghost'}
								on:click={() => updateSoundPreference(!soundEnabled)}
							>
								{#if soundEnabled}
									<Volume2 class="h-4 w-4" />
								{:else}
									<VolumeX class="h-4 w-4" />
								{/if}
							</Button>
						</div>
						<Button
							variant="outline"
							size="sm"
							class="w-full"
							on:click={() => {
								goto('/workspace/settings/notifications');
								isOpen = false;
							}}
						>
							All notification settings
						</Button>
					</div>
				</div>
			{/if}

			<!-- Notifications List -->
			<div class="flex-1 overflow-y-auto">
				{#if $notificationStore.loading}
					<div class="p-8 text-center">
						<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
					</div>
				{:else if $notificationStore.notifications.length === 0}
					<div class="p-8 text-center text-muted-foreground">
						<Bell class="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p>No notifications yet</p>
						<p class="text-sm mt-2">We'll notify you when something important happens</p>
					</div>
				{:else}
					<div class="divide-y">
						{#each $notificationStore.notifications as notification}
							<button
								class="w-full p-4 hover:bg-accent transition-colors text-left {notification.isRead ? 'opacity-75' : ''}"
								on:click={() => handleNotificationClick(notification)}
							>
								<div class="flex gap-3">
									<!-- Icon -->
									<div class="flex-shrink-0 text-lg">
										{getNotificationIcon(notification.type)}
									</div>

									<!-- Content -->
									<div class="flex-1 min-w-0">
										<div class="flex items-start justify-between gap-2">
											<div class="flex-1">
												<p class="font-medium text-sm {notification.isRead ? '' : 'text-primary'}">
													{notification.title}
												</p>
												{#if notification.message}
													<p class="text-sm text-muted-foreground mt-1 line-clamp-2">
														{notification.message}
													</p>
												{/if}
												<p class="text-xs text-muted-foreground mt-2">
													{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
												</p>
											</div>

											<!-- Unread indicator -->
											{#if !notification.isRead}
												<div class="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2"></div>
											{/if}
										</div>
									</div>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			{#if $notificationStore.notifications.length > 0}
				<div class="p-3 border-t">
					<Button
						variant="ghost"
						class="w-full"
						on:click={() => {
							goto('/workspace/notifications');
							isOpen = false;
						}}
					>
						View all notifications
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Click outside to close -->
{#if isOpen}
	<button
		class="fixed inset-0 z-40"
		on:click={() => isOpen = false}
		aria-label="Close notifications"
	/>
{/if}

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>