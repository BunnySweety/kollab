<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/stores';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { User, Bell, Shield, Palette, Database, LogOut } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { api, endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';

	// Accept SvelteKit props to avoid warnings
	export let data: any;

	const settingsSections = [
		{
			id: 'profile',
			title: 'Profile',
			description: 'Manage your personal information',
			icon: User,
			href: '/workspace/settings/profile'
		},
		{
			id: 'notifications',
			title: 'Notifications',
			description: 'Configure how you receive updates',
			icon: Bell,
			href: '/workspace/settings/notifications'
		},
		{
			id: 'security',
			title: 'Security',
			description: 'Password and authentication settings',
			icon: Shield,
			href: '/workspace/settings/security'
		},
		{
			id: 'appearance',
			title: 'Appearance',
			description: 'Customize your workspace look',
			icon: Palette,
			href: '/workspace/settings/appearance'
		},
		{
			id: 'data',
			title: 'Data & Privacy',
			description: 'Export data and manage privacy',
			icon: Database,
			href: '/workspace/settings/data'
		}
	];

	async function handleLogout() {
		try {
			await api.post(endpoints.auth.logout);
			goto('/login');
		} catch (error) {
			log.error('Logout error', error instanceof Error ? error : new Error(String(error)));
		}
	}
</script>

<div class="container max-w-6xl p-6">
	<div class="mb-8">
		<h1 class="text-3xl font-bold">Settings</h1>
		<p class="text-muted-foreground">Manage your account and workspace preferences</p>
	</div>

	<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
		{#each settingsSections as section}
			<Card class="cursor-pointer hover:shadow-md transition-shadow" on:click={() => goto(section.href)}>
				<CardHeader>
					<div class="flex items-start justify-between">
						<svelte:component this={section.icon} class="h-6 w-6 text-primary" />
					</div>
					<CardTitle class="text-lg">{section.title}</CardTitle>
					<CardDescription>{section.description}</CardDescription>
				</CardHeader>
			</Card>
		{/each}

		<!-- Logout Card -->
		<Card class="cursor-pointer hover:shadow-md transition-shadow border-destructive/50" on:click={handleLogout}>
			<CardHeader>
				<div class="flex items-start justify-between">
					<LogOut class="h-6 w-6 text-destructive" />
				</div>
				<CardTitle class="text-lg text-destructive">Sign Out</CardTitle>
				<CardDescription>Sign out of your account</CardDescription>
			</CardHeader>
		</Card>
	</div>

	<!-- Quick Actions -->
	<Card class="mt-8">
		<CardHeader>
			<CardTitle>Quick Actions</CardTitle>
		</CardHeader>
		<CardContent class="space-y-2">
			<Button variant="outline" class="w-full justify-start" on:click={() => goto('/workspace/settings/profile')}>
				<User class="mr-2 h-4 w-4" />
				Edit Profile
			</Button>
			<Button variant="outline" class="w-full justify-start" on:click={() => goto('/workspace/settings/security')}>
				<Shield class="mr-2 h-4 w-4" />
				Change Password
			</Button>
			<Button variant="outline" class="w-full justify-start" on:click={() => goto('/workspace/settings/notifications')}>
				<Bell class="mr-2 h-4 w-4" />
				Notification Preferences
			</Button>
		</CardContent>
	</Card>
</div>
