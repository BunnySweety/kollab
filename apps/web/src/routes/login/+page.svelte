<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { FileText, Loader2 } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { api, endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';

	// SvelteKit props - properly declared to avoid warnings
	export let data: any;

	let email = '';
	let password = '';
	let isLoading = false;

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!email || !password) {
			toast.error('Please fill in all fields');
			return;
		}

		isLoading = true;

		try {
			await api.post(endpoints.auth.login, { email, password });
			toast.success('Welcome back!');
			goto('/workspace');
		} catch (error) {
			log.error('Login error', error instanceof Error ? error : new Error(String(error)), { email });
			toast.error(error instanceof Error ? error.message : 'Login failed');
		} finally {
			isLoading = false;
		}
	}

	async function handleDemoLogin() {
		email = 'demo@kollab.app';
		password = 'Demo123456!';
		await handleSubmit(new Event('submit'));
	}
</script>

<svelte:head>
	<title>Login - Kollab</title>
	<meta name="description" content="Login to your Kollab workspace" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<a href="/" class="inline-flex items-center justify-center space-x-2">
				<FileText class="h-10 w-10" />
				<span class="text-3xl font-bold">Kollab</span>
			</a>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Welcome back</CardTitle>
				<CardDescription>
					Enter your email and password to access your workspace
				</CardDescription>
			</CardHeader>
			<form on:submit={handleSubmit}>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<label for="email" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
							Email
						</label>
						<input
							id="email"
							type="email"
							bind:value={email}
							placeholder="you@example.com"
							required
							disabled={isLoading}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						/>
					</div>

					<div class="space-y-2">
						<label for="password" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
							Password
						</label>
						<input
							id="password"
							type="password"
							bind:value={password}
							placeholder="••••••••"
							required
							disabled={isLoading}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						/>
					</div>

					<div class="flex items-center justify-between">
						<label class="flex items-center space-x-2">
							<input type="checkbox" class="h-4 w-4 rounded border-gray-300" />
							<span class="text-sm text-muted-foreground">Remember me</span>
						</label>
						<a href="/forgot-password" class="text-sm text-primary hover:underline">
							Forgot password?
						</a>
					</div>
				</CardContent>

				<CardFooter class="flex flex-col space-y-4">
					<Button type="submit" class="w-full" disabled={isLoading}>
						{#if isLoading}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Signing in...
						{:else}
							Sign In
						{/if}
					</Button>

					<div class="relative w-full">
						<div class="absolute inset-0 flex items-center">
							<span class="w-full border-t" />
						</div>
						<div class="relative flex justify-center text-xs uppercase">
							<span class="bg-background px-2 text-muted-foreground">Or continue with</span>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<Button variant="outline" disabled={isLoading}>
							<svg class="mr-2 h-4 w-4" viewBox="0 0 24 24">
								<path
									fill="currentColor"
									d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
								/>
								<path
									fill="currentColor"
									d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
								/>
								<path
									fill="currentColor"
									d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
								/>
								<path
									fill="currentColor"
									d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
								/>
							</svg>
							Google
						</Button>

						<Button variant="outline" disabled={isLoading}>
							<svg class="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
							</svg>
							GitHub
						</Button>
					</div>

					<Button variant="outline" class="w-full" on:click={handleDemoLogin} disabled={isLoading}>
						Try Demo Account
					</Button>
				</CardFooter>
			</form>
		</Card>

		<p class="mt-6 text-center text-sm text-muted-foreground">
			Don't have an account?
			<a href="/register" class="font-medium text-primary hover:underline">
				Sign up for free
			</a>
		</p>
	</div>
</div>
