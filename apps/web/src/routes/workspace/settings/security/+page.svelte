<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/stores';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { ChevronLeft, Shield, Key, Smartphone, History, AlertTriangle } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	// Accept SvelteKit props to avoid warnings
	export let data: any;

	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
	let twoFactorEnabled = false;
	let saving = false;

	const loginHistory = [
		{ id: 1, device: 'Chrome on Windows', location: 'San Francisco, CA', time: '2 hours ago', current: true },
		{ id: 2, device: 'Safari on iPhone', location: 'San Francisco, CA', time: '1 day ago' },
		{ id: 3, device: 'Firefox on MacOS', location: 'New York, NY', time: '3 days ago' }
	];

	async function updatePassword() {
		if (newPassword !== confirmPassword) {
			toast.error('Passwords do not match');
			return;
		}

		saving = true;
		try {
			// Simulate API call
			await new Promise(resolve => setTimeout(resolve, 1000));
			toast.success('Password updated successfully');
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch (error) {
			toast.error('Failed to update password');
		} finally {
			saving = false;
		}
	}

	function toggleTwoFactor() {
		if (!twoFactorEnabled) {
			toast.info('Two-factor authentication setup coming soon');
		}
		twoFactorEnabled = !twoFactorEnabled;
	}

	function revokeSession(id: number) {
		toast.success('Session revoked successfully');
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
		<h1 class="text-3xl font-bold">Security Settings</h1>
		<p class="text-muted-foreground">Manage your account security and authentication</p>
	</div>

	<div class="grid gap-6">
		<!-- Change Password -->
		<Card>
			<CardHeader>
				<CardTitle>
					<div class="flex items-center gap-2">
						<Key class="h-5 w-5" />
						Change Password
					</div>
				</CardTitle>
				<CardDescription>Update your password regularly to keep your account secure</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-2">
					<Label for="current-password">Current Password</Label>
					<Input
						id="current-password"
						type="password"
						bind:value={currentPassword}
					/>
				</div>
				<div class="space-y-2">
					<Label for="new-password">New Password</Label>
					<Input
						id="new-password"
						type="password"
						bind:value={newPassword}
					/>
					<p class="text-sm text-muted-foreground">
						Must be at least 8 characters with uppercase, lowercase, and numbers
					</p>
				</div>
				<div class="space-y-2">
					<Label for="confirm-password">Confirm New Password</Label>
					<Input
						id="confirm-password"
						type="password"
						bind:value={confirmPassword}
					/>
				</div>
				<Button on:click={updatePassword} disabled={saving || !currentPassword || !newPassword}>
					{saving ? 'Updating...' : 'Update Password'}
				</Button>
			</CardContent>
		</Card>

		<!-- Two-Factor Authentication -->
		<Card>
			<CardHeader>
				<CardTitle>
					<div class="flex items-center gap-2">
						<Smartphone class="h-5 w-5" />
						Two-Factor Authentication
					</div>
				</CardTitle>
				<CardDescription>
					Add an extra layer of security to your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex items-center justify-between">
					<div class="space-y-1">
						<p class="text-sm font-medium">Enable Two-Factor Authentication</p>
						<p class="text-sm text-muted-foreground">
							Require a verification code in addition to your password
						</p>
					</div>
					<Switch checked={twoFactorEnabled} onCheckedChange={toggleTwoFactor} />
				</div>
			</CardContent>
		</Card>

		<!-- Login History -->
		<Card>
			<CardHeader>
				<CardTitle>
					<div class="flex items-center gap-2">
						<History class="h-5 w-5" />
						Login History
					</div>
				</CardTitle>
				<CardDescription>Recent login activity on your account</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="space-y-4">
					{#each loginHistory as session}
						<div class="flex items-center justify-between border-b pb-4 last:border-0">
							<div class="space-y-1">
								<p class="text-sm font-medium">
									{session.device}
									{#if session.current}
										<span class="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
											Current
										</span>
									{/if}
								</p>
								<p class="text-sm text-muted-foreground">
									{session.location} • {session.time}
								</p>
							</div>
							{#if !session.current}
								<Button
									variant="ghost"
									size="sm"
									on:click={() => revokeSession(session.id)}
								>
									Revoke
								</Button>
							{/if}
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>

		<!-- Security Recommendations -->
		<Card>
			<CardHeader>
				<CardTitle>
					<div class="flex items-center gap-2">
						<Shield class="h-5 w-5" />
						Security Recommendations
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				<div class="flex items-start gap-3">
					<AlertTriangle class="mt-0.5 h-4 w-4 text-yellow-600 dark:text-yellow-400" />
					<div class="space-y-1">
						<p class="text-sm font-medium">Use a strong password</p>
						<p class="text-sm text-muted-foreground">
							Mix uppercase, lowercase, numbers, and symbols
						</p>
					</div>
				</div>
				<div class="flex items-start gap-3">
					<Shield class="mt-0.5 h-4 w-4 text-green-600 dark:text-green-400" />
					<div class="space-y-1">
						<p class="text-sm font-medium">Enable two-factor authentication</p>
						<p class="text-sm text-muted-foreground">
							Add an extra layer of security
						</p>
					</div>
				</div>
				<div class="flex items-start gap-3">
					<History class="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
					<div class="space-y-1">
						<p class="text-sm font-medium">Review login history regularly</p>
						<p class="text-sm text-muted-foreground">
							Check for any suspicious activity
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	</div>
</div>
