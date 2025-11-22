<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/stores';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { FileText, Users, CheckSquare, Zap, Shield, Globe } from 'lucide-svelte';

	// SvelteKit props - properly declared to avoid warnings
	export let data: any;
</script>

<svelte:head>
	<title>Kollab - Where Teams Connect, Create & Conquer</title>
	<meta name="description" content="Open-source collaborative workspace combining powerful task management, documentation, and real-time collaboration. Self-hostable alternative to Notion." />
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-background to-muted">
	<!-- Hero Section -->
	<header class="container mx-auto px-4 py-16">
		<nav class="mb-16 flex items-center justify-between">
			<div class="flex items-center space-x-2">
				<div class="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
					<span class="text-white font-bold text-xl">K</span>
				</div>
				<span class="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Kollab</span>
			</div>
			<div class="flex items-center space-x-4">
				<Button variant="ghost" href="/login">Sign In</Button>
				<Button href="/register">Get Started</Button>
			</div>
		</nav>

		<div class="mx-auto max-w-4xl text-center">
			<h1 class="mb-6 text-5xl font-bold tracking-tight lg:text-6xl">
				Your All-in-One Collaborative Workspace
			</h1>
			<p class="mb-10 text-xl text-muted-foreground">
				Combine documents, tasks, and databases in one powerful open-source platform.
				Built with modern technologies for teams who value privacy and control.
			</p>
			<div class="flex justify-center space-x-4">
				<Button size="lg" href="/register">
					Start Free
				</Button>
				<Button size="lg" variant="outline" href="/demo">
					View Demo
				</Button>
			</div>
		</div>
	</header>

	<!-- Features Section -->
	<section class="container mx-auto px-4 py-16">
		<div class="mx-auto max-w-6xl">
			<h2 class="mb-12 text-center text-3xl font-bold">Everything you need to stay organized</h2>

			<div class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
				<Card>
					<CardHeader>
						<FileText class="mb-2 h-8 w-8 text-primary" />
						<CardTitle>Rich Documents</CardTitle>
					</CardHeader>
					<CardContent>
						<CardDescription>
							Create beautiful documents with a powerful editor. Support for markdown,
							real-time collaboration, and block-based content.
						</CardDescription>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CheckSquare class="mb-2 h-8 w-8 text-primary" />
						<CardTitle>Task Management</CardTitle>
					</CardHeader>
					<CardContent>
						<CardDescription>
							Organize your work with kanban boards, calendars, and lists.
							Track progress and collaborate with your team.
						</CardDescription>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<Users class="mb-2 h-8 w-8 text-primary" />
						<CardTitle>Team Collaboration</CardTitle>
					</CardHeader>
					<CardContent>
						<CardDescription>
							Work together in real-time. See live cursors, comments,
							and get instant notifications.
						</CardDescription>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<Zap class="mb-2 h-8 w-8 text-primary" />
						<CardTitle>Lightning Fast</CardTitle>
					</CardHeader>
					<CardContent>
						<CardDescription>
							Built with SvelteKit and optimized for performance.
							Experience instant page loads and smooth interactions.
						</CardDescription>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<Shield class="mb-2 h-8 w-8 text-primary" />
						<CardTitle>Privacy First</CardTitle>
					</CardHeader>
					<CardContent>
						<CardDescription>
							Self-host on your infrastructure. Your data stays yours
							with enterprise-grade security.
						</CardDescription>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<Globe class="mb-2 h-8 w-8 text-primary" />
						<CardTitle>Open Source</CardTitle>
					</CardHeader>
					<CardContent>
						<CardDescription>
							100% open source with MIT license. Contribute, customize,
							and build upon our platform.
						</CardDescription>
					</CardContent>
				</Card>
			</div>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="container mx-auto px-4 py-16">
		<Card class="mx-auto max-w-2xl text-center">
			<CardHeader>
				<CardTitle class="text-3xl">Ready to get started?</CardTitle>
				<CardDescription class="text-lg">
					Join thousands of teams already using Kollab to organize their work.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button size="lg" href="/register">
					Create Free Account
				</Button>
			</CardContent>
		</Card>
	</section>

	<!-- Footer -->
	<footer class="border-t">
		<div class="container mx-auto px-4 py-8">
			<div class="flex flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
				<div class="flex items-center space-x-2">
					<div class="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
						<span class="text-white font-bold">K</span>
					</div>
					<span class="font-semibold">Kollab</span>
				</div>
				<div class="flex space-x-6 text-sm text-muted-foreground">
					<a href="/privacy" class="hover:text-foreground">Privacy</a>
					<a href="/terms" class="hover:text-foreground">Terms</a>
					<a href="https://github.com/kollab-io/kollab" class="hover:text-foreground">GitHub</a>
					<a href="/docs" class="hover:text-foreground">Documentation</a>
				</div>
			</div>
		</div>
	</footer>
</div>
