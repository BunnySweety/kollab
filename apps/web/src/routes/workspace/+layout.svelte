<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Menu, Search, Settings, Bell, UserCircle } from 'lucide-svelte';
	import { api, endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';

	// Accept SvelteKit props
	export let data: any;

	let sidebarOpen = true;
	let user: any = null;

	onMount(async () => {
		// Check authentication
		try {
			const data = await api.get(endpoints.auth.me);
			user = data.user;
		} catch (error) {
			log.error('Auth check failed', error instanceof Error ? error : new Error(String(error)));
			goto('/login');
		}
	});

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}
</script>

{#if user}
	<div class="flex h-screen bg-background">
		<!-- Sidebar -->
		<div
			class="sidebar-container transition-all duration-300 {sidebarOpen ? 'w-64' : 'w-0'}"
		>
			<Sidebar bind:open={sidebarOpen} {user} />
		</div>

		<!-- Main content -->
		<div class="flex flex-1 flex-col">
			<!-- Header -->
			<header class="flex h-14 items-center justify-between border-b px-6">
				<div class="flex items-center space-x-4">
					<Button
						size="icon"
						variant="ghost"
						on:click={toggleSidebar}
						title="Toggle sidebar"
					>
						<Menu class="h-5 w-5" />
					</Button>

					<Button size="icon" variant="ghost" title="Search (Cmd+K)">
						<Search class="h-5 w-5" />
					</Button>
				</div>

				<div class="flex items-center space-x-2">
					<NotificationCenter {user} />

					<Button size="icon" variant="ghost" title="Settings" on:click={() => goto('/workspace/settings')}>
						<Settings class="h-5 w-5" />
					</Button>

					<Button size="icon" variant="ghost" title="Profile">
						{#if user?.avatarUrl}
							<img src={user.avatarUrl} alt={user.name} class="h-8 w-8 rounded-full" />
						{:else}
							<UserCircle class="h-5 w-5" />
						{/if}
					</Button>
				</div>
			</header>

			<!-- Page content -->
			<main class="flex-1 overflow-auto">
				<slot />
			</main>
		</div>
	</div>
{:else}
	<!-- Loading state -->
	<div class="flex h-screen items-center justify-center">
		<div class="text-center">
			<div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
			<p class="mt-2 text-sm text-muted-foreground">Loading workspace...</p>
		</div>
	</div>
{/if}

<style>
	.sidebar-container {
		@apply border-r bg-background;
	}
</style>
