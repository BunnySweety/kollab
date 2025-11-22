<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ChevronLeft, ChevronRight, Plus } from 'lucide-svelte';

	export let entries: any[] = [];
	export let properties: Record<string, any> = {};
	export let datePropertyKey: string = '';
	export let displayMode: 'month' | 'week' | 'day' = 'month';
	export let onEntryClick: (entry: any) => void = () => {};
	export let onEntryEdit: (entry: any) => void = () => {};
	export let onEntryDelete: (entry: any) => void = () => {};

	let currentDate = new Date();

	function getPropertyValue(entry: any, propertyName: string): any {
		if (!entry.data || typeof entry.data !== 'object') {
			return null;
		}
		return entry.data[propertyName] || null;
	}

	function getTitleProperty(entry: any): string {
		const titleProp = Object.entries(properties).find(([_, prop]: [string, any]) => prop.type === 'title');
		if (titleProp) {
			const [key] = titleProp;
			return getPropertyValue(entry, key) || 'Untitled';
		}
		return 'Untitled';
	}

	function getEntriesForDate(date: Date): any[] {
		if (!datePropertyKey) return [];
		
		const dateStr = date.toISOString().split('T')[0];
		return entries.filter(entry => {
			const entryDate = getPropertyValue(entry, datePropertyKey);
			if (!entryDate) return false;
			const entryDateStr = new Date(entryDate).toISOString().split('T')[0];
			return entryDateStr === dateStr;
		});
	}

	function getMonthDays(year: number, month: number): Date[] {
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const days: Date[] = [];
		
		// Add days from previous month to fill the first week
		const startDay = firstDay.getDay();
		for (let i = startDay - 1; i >= 0; i--) {
			const date = new Date(year, month, -i);
			days.push(date);
		}
		
		// Add days of current month
		for (let day = 1; day <= lastDay.getDate(); day++) {
			days.push(new Date(year, month, day));
		}
		
		// Add days from next month to fill the last week
		const remainingDays = 42 - days.length; // 6 weeks * 7 days
		for (let day = 1; day <= remainingDays; day++) {
			days.push(new Date(year, month + 1, day));
		}
		
		return days;
	}

	function getWeekDays(date: Date): Date[] {
		const days: Date[] = [];
		const dayOfWeek = date.getDay();
		const startDate = new Date(date);
		startDate.setDate(date.getDate() - dayOfWeek);
		
		for (let i = 0; i < 7; i++) {
			const day = new Date(startDate);
			day.setDate(startDate.getDate() + i);
			days.push(day);
		}
		
		return days;
	}

	function isToday(date: Date): boolean {
		const today = new Date();
		return date.toDateString() === today.toDateString();
	}

	function isCurrentMonth(date: Date): boolean {
		return date.getMonth() === currentDate.getMonth() && date.getFullYear() === currentDate.getFullYear();
	}

	function previousPeriod() {
		if (displayMode === 'month') {
			currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
		} else if (displayMode === 'week') {
			currentDate = new Date(currentDate);
			currentDate.setDate(currentDate.getDate() - 7);
		} else {
			currentDate = new Date(currentDate);
			currentDate.setDate(currentDate.getDate() - 1);
		}
	}

	function nextPeriod() {
		if (displayMode === 'month') {
			currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
		} else if (displayMode === 'week') {
			currentDate = new Date(currentDate);
			currentDate.setDate(currentDate.getDate() + 7);
		} else {
			currentDate = new Date(currentDate);
			currentDate.setDate(currentDate.getDate() + 1);
		}
	}

	function goToToday() {
		currentDate = new Date();
	}

	function formatMonthYear(date: Date): string {
		return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
	}

	function formatWeekRange(date: Date): string {
		const weekDays = getWeekDays(date);
		const start = weekDays[0];
		const end = weekDays[6];
		return `${start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
	}

	function formatDay(date: Date): string {
		return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
	}

	$: monthDays = displayMode === 'month' ? getMonthDays(currentDate.getFullYear(), currentDate.getMonth()) : [];
	$: weekDays = displayMode === 'week' ? getWeekDays(currentDate) : [];
	$: dayDate = displayMode === 'day' ? currentDate : null;
</script>

<div class="space-y-4">
	<!-- Calendar Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Button variant="outline" size="icon" on:click={previousPeriod}>
				<ChevronLeft class="h-4 w-4" />
			</Button>
			<Button variant="outline" size="sm" on:click={goToToday}>
				Today
			</Button>
			<Button variant="outline" size="icon" on:click={nextPeriod}>
				<ChevronRight class="h-4 w-4" />
			</Button>
		</div>
		<h2 class="text-lg font-semibold">
			{#if displayMode === 'month'}
				{formatMonthYear(currentDate)}
			{:else if displayMode === 'week'}
				{formatWeekRange(currentDate)}
			{:else}
				{formatDay(currentDate)}
			{/if}
		</h2>
	</div>

	<!-- Month View -->
	{#if displayMode === 'month'}
		<div class="rounded-lg border bg-card">
			<!-- Weekday Headers -->
			<div class="grid grid-cols-7 border-b">
				{#each ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as day}
					<div class="px-4 py-2 text-center text-sm font-semibold text-muted-foreground">
						{day}
					</div>
				{/each}
			</div>

			<!-- Calendar Grid -->
			<div class="grid grid-cols-7">
				{#each monthDays as day}
					{@const dayEntries = getEntriesForDate(day)}
					<div
						class="min-h-[100px] border-r border-b p-2 {isCurrentMonth(day) ? 'bg-background' : 'bg-muted/30'} {isToday(day) ? 'ring-2 ring-primary' : ''}"
					>
						<div class="mb-1 flex items-center justify-between">
							<span class="text-sm font-medium {isCurrentMonth(day) ? 'text-foreground' : 'text-muted-foreground'} {isToday(day) ? 'text-primary font-bold' : ''}">
								{day.getDate()}
							</span>
							{#if dayEntries.length > 0}
								<span class="text-xs text-muted-foreground bg-primary/10 px-1.5 py-0.5 rounded">
									{dayEntries.length}
								</span>
							{/if}
						</div>
						<div class="space-y-1">
							{#each dayEntries.slice(0, 3) as entry}
								<button
									class="w-full text-left text-xs px-2 py-1 bg-primary/10 hover:bg-primary/20 rounded truncate"
									on:click={() => onEntryClick(entry)}
								>
									{getTitleProperty(entry)}
								</button>
							{/each}
							{#if dayEntries.length > 3}
								<div class="text-xs text-muted-foreground px-2">
									+{dayEntries.length - 3} more
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Week View -->
	{#if displayMode === 'week'}
		<div class="rounded-lg border bg-card">
			<!-- Weekday Headers -->
			<div class="grid grid-cols-7 border-b">
				{#each weekDays as day}
					<div class="px-4 py-2 text-center border-r last:border-r-0">
						<div class="text-xs text-muted-foreground">
							{day.toLocaleDateString('fr-FR', { weekday: 'short' })}
						</div>
						<div class="text-sm font-semibold {isToday(day) ? 'text-primary' : ''}">
							{day.getDate()}
						</div>
					</div>
				{/each}
			</div>

			<!-- Week Content -->
			<div class="grid grid-cols-7 min-h-[400px]">
				{#each weekDays as day}
					{@const dayEntries = getEntriesForDate(day)}
					<div class="border-r last:border-r-0 p-2 {isToday(day) ? 'bg-primary/5' : ''}">
						<div class="space-y-2">
							{#each dayEntries as entry}
								<button
									class="w-full text-left text-sm px-3 py-2 bg-primary/10 hover:bg-primary/20 rounded border-l-2 border-primary"
									on:click={() => onEntryClick(entry)}
								>
									<div class="font-medium">{getTitleProperty(entry)}</div>
									{#if datePropertyKey}
										{@const entryDate = getPropertyValue(entry, datePropertyKey)}
										{#if entryDate}
											<div class="text-xs text-muted-foreground mt-1">
												{new Date(entryDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
											</div>
										{/if}
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Day View -->
	{#if displayMode === 'day' && dayDate}
		{@const dayEntries = getEntriesForDate(dayDate)}
		<div class="rounded-lg border bg-card">
			<div class="p-6">
				<div class="space-y-3">
					{#if dayEntries.length === 0}
						<div class="text-center py-12 text-muted-foreground">
							No entries for this day
						</div>
					{:else}
						{#each dayEntries as entry}
							<button
								class="w-full text-left p-4 bg-card border rounded-lg hover:bg-accent transition-colors"
								on:click={() => onEntryClick(entry)}
							>
								<div class="font-semibold mb-2">{getTitleProperty(entry)}</div>
								<div class="text-sm text-muted-foreground space-y-1">
									{#each Object.entries(properties) as [key, property]}
										{#if property.type !== 'title' && key !== datePropertyKey}
											<div class="flex items-center justify-between">
												<span>{property.name}:</span>
												<span>{getPropertyValue(entry, key) || '-'}</span>
											</div>
										{/if}
									{/each}
								</div>
							</button>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

