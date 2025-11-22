<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/stores';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { ChevronLeft, Upload, Save } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	// Accept SvelteKit props to avoid warnings
	export let data: any;

	let profile = {
		name: 'John Doe',
		email: 'john@example.com',
		bio: 'Product designer and developer',
		company: 'Acme Corp',
		location: 'San Francisco, CA',
		website: 'https://johndoe.com',
		avatar: ''
	};

	let saving = false;

	async function saveProfile() {
		saving = true;
		try {
			// Simulate API call
			await new Promise(resolve => setTimeout(resolve, 1000));
			toast.success('Profile updated successfully');
		} catch (error) {
			toast.error('Failed to update profile');
		} finally {
			saving = false;
		}
	}

	function handleAvatarUpload() {
		// Handle avatar upload
		toast.info('Avatar upload not implemented yet');
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
		<h1 class="text-3xl font-bold">Profile Settings</h1>
		<p class="text-muted-foreground">Manage your personal information and preferences</p>
	</div>

	<div class="grid gap-6">
		<!-- Avatar Section -->
		<Card>
			<CardHeader>
				<CardTitle>Profile Picture</CardTitle>
				<CardDescription>Update your avatar and display name</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex items-center gap-6">
					<Avatar class="h-24 w-24">
						<AvatarImage src={profile.avatar} alt={profile.name} />
						<AvatarFallback>{profile.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
					</Avatar>
					<div class="space-y-2">
						<Button variant="outline" on:click={handleAvatarUpload}>
							<Upload class="mr-2 h-4 w-4" />
							Upload New Picture
						</Button>
						<p class="text-sm text-muted-foreground">JPG, PNG or GIF. Max 5MB.</p>
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Personal Information -->
		<Card>
			<CardHeader>
				<CardTitle>Personal Information</CardTitle>
				<CardDescription>Update your personal details</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<Label for="name">Full Name</Label>
						<Input id="name" bind:value={profile.name} />
					</div>
					<div class="space-y-2">
						<Label for="email">Email Address</Label>
						<Input id="email" type="email" bind:value={profile.email} />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="bio">Bio</Label>
					<Textarea
						id="bio"
						bind:value={profile.bio}
						placeholder="Tell us about yourself"
						class="min-h-[100px]"
					/>
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<Label for="company">Company</Label>
						<Input id="company" bind:value={profile.company} />
					</div>
					<div class="space-y-2">
						<Label for="location">Location</Label>
						<Input id="location" bind:value={profile.location} />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="website">Website</Label>
					<Input id="website" type="url" bind:value={profile.website} />
				</div>
			</CardContent>
		</Card>

		<!-- Save Button -->
		<div class="flex justify-end">
			<Button on:click={saveProfile} disabled={saving}>
				{#if saving}
					Saving...
				{:else}
					<Save class="mr-2 h-4 w-4" />
					Save Changes
				{/if}
			</Button>
		</div>
	</div>
</div>
