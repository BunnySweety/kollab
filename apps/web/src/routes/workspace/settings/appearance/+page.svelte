<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/stores';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { ChevronLeft, Sun, Moon, Monitor, Palette, Type, Layout } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	// Accept SvelteKit props to avoid warnings
	export let data: any;

	let theme = 'system';
	let accentColor = 'blue';
	let fontSize = 'medium';
	let density = 'normal';
	let reducedMotion = false;
	let sidebarCollapsed = false;
	let saving = false;

	const accentColors = [
		{ value: 'blue', label: 'Blue', class: 'bg-blue-500' },
		{ value: 'green', label: 'Green', class: 'bg-green-500' },
		{ value: 'purple', label: 'Purple', class: 'bg-purple-500' },
		{ value: 'orange', label: 'Orange', class: 'bg-orange-500' },
		{ value: 'red', label: 'Red', class: 'bg-red-500' },
		{ value: 'pink', label: 'Pink', class: 'bg-pink-500' }
	];

	async function saveAppearance() {
		saving = true;
		try {
			// Simulate API call
			await new Promise(resolve => setTimeout(resolve, 1000));
			toast.success('Appearance settings saved');
		} catch (error) {
			toast.error('Failed to save appearance settings');
		} finally {
			saving = false;
		}
	}

	function resetToDefaults() {
		theme = 'system';
		accentColor = 'blue';
		fontSize = 'medium';
		density = 'normal';
		reducedMotion = false;
		sidebarCollapsed = false;
		toast.success('Reset to default settings');
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
		<h1 class="text-3xl font-bold">Appearance Settings</h1>
		<p class="text-muted-foreground">Customize how Kollab looks and feels</p>
	</div>

	<div class="grid gap-6">
		<!-- Theme Selection -->
		<Card>
			<CardHeader>
				<CardTitle>
					<div class="flex items-center gap-2">
						<Palette class="h-5 w-5" />
						Theme
					</div>
				</CardTitle>
				<CardDescription>Choose your preferred color scheme</CardDescription>
			</CardHeader>
			<CardContent>
				<RadioGroup bind:value={theme} class="grid grid-cols-3 gap-4">
					<div>
						<RadioGroupItem value="light" id="light" class="peer sr-only" />
						<Label
							for="light"
							class="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
						>
							<Sun class="mb-2 h-6 w-6" />
							Light
						</Label>
					</div>
					<div>
						<RadioGroupItem value="dark" id="dark" class="peer sr-only" />
						<Label
							for="dark"
							class="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
						>
							<Moon class="mb-2 h-6 w-6" />
							Dark
						</Label>
					</div>
					<div>
						<RadioGroupItem value="system" id="system" class="peer sr-only" />
						<Label
							for="system"
							class="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
						>
							<Monitor class="mb-2 h-6 w-6" />
							System
						</Label>
					</div>
				</RadioGroup>
			</CardContent>
		</Card>

		<!-- Accent Color -->
		<Card>
			<CardHeader>
				<CardTitle>Accent Color</CardTitle>
				<CardDescription>Choose your preferred accent color</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid grid-cols-6 gap-4">
					{#each accentColors as color}
						<button
							on:click={() => accentColor = color.value}
							class="flex h-10 w-10 items-center justify-center rounded-full {color.class} {accentColor === color.value ? 'ring-2 ring-offset-2 ring-offset-background' : ''}"
							aria-label={color.label}
						>
							{#if accentColor === color.value}
								<svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			</CardContent>
		</Card>

		<!-- Typography -->
		<Card>
			<CardHeader>
				<CardTitle>
					<div class="flex items-center gap-2">
						<Type class="h-5 w-5" />
						Typography
					</div>
				</CardTitle>
				<CardDescription>Adjust text size and spacing</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-2">
					<Label for="font-size">Font Size</Label>
					<Select bind:value={fontSize}>
						<SelectTrigger id="font-size">
							<SelectValue placeholder="Select font size" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="small">Small</SelectItem>
							<SelectItem value="medium">Medium (Default)</SelectItem>
							<SelectItem value="large">Large</SelectItem>
							<SelectItem value="extra-large">Extra Large</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</CardContent>
		</Card>

		<!-- Layout -->
		<Card>
			<CardHeader>
				<CardTitle>
					<div class="flex items-center gap-2">
						<Layout class="h-5 w-5" />
						Layout
					</div>
				</CardTitle>
				<CardDescription>Configure layout preferences</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-2">
					<Label for="density">Interface Density</Label>
					<Select bind:value={density}>
						<SelectTrigger id="density">
							<SelectValue placeholder="Select density" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="compact">Compact</SelectItem>
							<SelectItem value="normal">Normal (Default)</SelectItem>
							<SelectItem value="comfortable">Comfortable</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div class="flex items-center justify-between">
					<div class="space-y-1">
						<Label for="sidebar">Collapsed Sidebar by Default</Label>
						<p class="text-sm text-muted-foreground">Start with the sidebar minimized</p>
					</div>
					<Switch id="sidebar" bind:checked={sidebarCollapsed} />
				</div>
			</CardContent>
		</Card>

		<!-- Accessibility -->
		<Card>
			<CardHeader>
				<CardTitle>Accessibility</CardTitle>
				<CardDescription>Make Kollab easier to use</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex items-center justify-between">
					<div class="space-y-1">
						<Label for="motion">Reduce Motion</Label>
						<p class="text-sm text-muted-foreground">Minimize animations and transitions</p>
					</div>
					<Switch id="motion" bind:checked={reducedMotion} />
				</div>
			</CardContent>
		</Card>

		<!-- Save Button -->
		<div class="flex justify-between">
			<Button variant="outline" on:click={resetToDefaults}>
				Reset to Defaults
			</Button>
			<Button on:click={saveAppearance} disabled={saving}>
				{saving ? 'Saving...' : 'Save Changes'}
			</Button>
		</div>
	</div>
</div>
