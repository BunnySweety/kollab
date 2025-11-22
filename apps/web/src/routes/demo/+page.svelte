<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { FileText, Loader2, Rocket, Users, Zap } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { api, endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';

	// SvelteKit props - properly declared to avoid warnings
	export let data: any;

	let isLoading = false;
	let autoLogin = false;

	// Check if auto-login parameter is present
	onMount(() => {
		const urlParams = new URLSearchParams(window.location.search);
		autoLogin = urlParams.get('auto') === 'true';

		if (autoLogin) {
			handleDemoLogin();
		}
	});

	async function handleDemoLogin() {
		isLoading = true;

		try {
			// Try to login with demo credentials
			await api.post(endpoints.auth.login, {
				email: 'demo@kollab.app',
				password: 'Demo123456!'
			});

			toast.success('Welcome to Kollab Demo!');
			goto('/workspace');
		} catch (error) {
			// If demo user doesn't exist, create it
			if (error instanceof Error && error.message.includes('Invalid')) {
				try {
					await api.post(endpoints.auth.register, {
						name: 'Demo User',
						email: 'demo@kollab.app',
						password: 'Demo123456!'
					});

					toast.success('Demo account created! Welcome to Kollab!');
					goto('/workspace');
				} catch (registerError) {
					log.error('Demo registration error', registerError instanceof Error ? registerError : new Error(String(registerError)));
					toast.error('Failed to create demo account. Please try manual login.');
					goto('/login');
				}
			} else {
				log.error('Demo login error', error instanceof Error ? error : new Error(String(error)));
				toast.error('Failed to access demo. Please try again.');
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Demo - Kollab</title>
	<meta name="description" content="Try Kollab with a demo account" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
	<div class="w-full max-w-2xl">
		<div class="mb-8 text-center">
			<a href="/" class="inline-flex items-center justify-center space-x-2">
				<FileText class="h-12 w-12" />
				<span class="text-4xl font-bold">Kollab</span>
			</a>
		</div>

		{#if isLoading && autoLogin}
			<Card>
				<CardContent class="flex flex-col items-center justify-center py-16">
					<Loader2 class="h-12 w-12 animate-spin text-primary mb-4" />
					<p class="text-lg text-muted-foreground">Setting up your demo workspace...</p>
				</CardContent>
			</Card>
		{:else}
			<Card>
				<CardHeader class="text-center">
					<CardTitle class="text-3xl">Try Kollab Demo</CardTitle>
					<CardDescription class="text-base">
						Experience the power of collaborative workspaces with no signup required
					</CardDescription>
				</CardHeader>

				<CardContent class="space-y-8">
					<!-- Features Grid -->
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div class="flex flex-col items-center text-center p-4 rounded-lg border bg-card">
							<Rocket class="h-8 w-8 mb-3 text-primary" />
							<h3 class="font-semibold mb-2">Real-time Collaboration</h3>
							<p class="text-sm text-muted-foreground">
								Work together with your team in real-time
							</p>
						</div>

						<div class="flex flex-col items-center text-center p-4 rounded-lg border bg-card">
							<FileText class="h-8 w-8 mb-3 text-primary" />
							<h3 class="font-semibold mb-2">Rich Documents</h3>
							<p class="text-sm text-muted-foreground">
								Create beautiful docs with powerful editing
							</p>
						</div>

						<div class="flex flex-col items-center text-center p-4 rounded-lg border bg-card">
							<Zap class="h-8 w-8 mb-3 text-primary" />
							<h3 class="font-semibold mb-2">Fast & Secure</h3>
							<p class="text-sm text-muted-foreground">
								Built with performance and security in mind
							</p>
						</div>
					</div>

					<!-- Demo Info -->
					<div class="rounded-lg bg-muted p-6 space-y-3">
						<h3 class="font-semibold flex items-center gap-2">
							<Users class="h-5 w-5" />
							What's Included in the Demo
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground ml-7">
							<li>• Pre-configured demo workspace</li>
							<li>• Sample documents and templates</li>
							<li>• Full access to all features</li>
							<li>• Real-time collaboration (invite others with demo link)</li>
							<li>• Task management and project boards</li>
						</ul>
					</div>

					<!-- CTA Button -->
					<Button
						size="lg"
						class="w-full text-lg py-6"
						disabled={isLoading}
						on:click={handleDemoLogin}
					>
						{#if isLoading}
							<Loader2 class="mr-2 h-5 w-5 animate-spin" />
							Launching Demo...
						{:else}
							<Rocket class="mr-2 h-5 w-5" />
							Launch Demo Workspace
						{/if}
					</Button>

					<!-- Alternative Actions -->
					<div class="text-center space-y-2">
						<p class="text-sm text-muted-foreground">
							No credit card required • No signup needed
						</p>
						<div class="flex items-center justify-center gap-4 text-sm">
							<a href="/login" class="text-primary hover:underline">
								Sign in to your account
							</a>
							<span class="text-muted-foreground">•</span>
							<a href="/register" class="text-primary hover:underline">
								Create free account
							</a>
						</div>
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Footer Note -->
		<p class="mt-6 text-center text-sm text-muted-foreground">
			Demo data resets periodically. Create a free account to keep your work.
		</p>
	</div>
</div>
