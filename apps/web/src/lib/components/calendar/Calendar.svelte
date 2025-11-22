<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { ChevronLeft, ChevronRight, Plus, CheckSquare, Calendar as CalendarIconLucide } from 'lucide-svelte';

	// Generic event interface - can be tasks, documents, meetings, etc.
	export interface CalendarEvent {
		id: string;
		title: string;
		date: Date | string;
		priority?: string;
		status?: string;
		type?: string;
		[key: string]: unknown;
	}

	export let events: CalendarEvent[] = [];
	export let showCreateButton = true;
	export let createButtonLabel = 'Create';

	const dispatch = createEventDispatcher();

	let currentDate = new Date();
	let currentMonth = currentDate.getMonth();
	let currentYear = currentDate.getFullYear();

	const monthNames = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	// Get events by date
	$: eventsByDate = events.reduce((acc, event) => {
		if (event.date) {
			const date = new Date(event.date);
			// Normalize date to midnight to avoid timezone issues
			const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
			const key = `${normalizedDate.getFullYear()}-${normalizedDate.getMonth()}-${normalizedDate.getDate()}`;
			if (!acc[key]) acc[key] = [];
			acc[key].push(event);
		}
		return acc;
	}, {} as Record<string, CalendarEvent[]>);

	// Generate calendar days
	$: calendarDays = generateCalendarDays(currentYear, currentMonth);

	function generateCalendarDays(year: number, month: number) {
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const startDate = new Date(firstDay);
		startDate.setDate(startDate.getDate() - firstDay.getDay());

		const days = [];
		const current = new Date(startDate);

		while (current <= lastDay || current.getDay() !== 0) {
			days.push(new Date(current));
			current.setDate(current.getDate() + 1);
		}

		return days;
	}

	function isToday(date: Date) {
		const today = new Date();
		return date.getDate() === today.getDate() &&
			date.getMonth() === today.getMonth() &&
			date.getFullYear() === today.getFullYear();
	}

	function isCurrentMonth(date: Date) {
		return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
	}

	function getEventsForDate(date: Date) {
		// Normalize date to midnight to avoid timezone issues
		const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const key = `${normalizedDate.getFullYear()}-${normalizedDate.getMonth()}-${normalizedDate.getDate()}`;
		return eventsByDate[key] || [];
	}

	function previousMonth() {
		if (currentMonth === 0) {
			currentMonth = 11;
			currentYear--;
		} else {
			currentMonth--;
		}
	}

	function nextMonth() {
		if (currentMonth === 11) {
			currentMonth = 0;
			currentYear++;
		} else {
			currentMonth++;
		}
	}

	function goToToday() {
		const today = new Date();
		currentMonth = today.getMonth();
		currentYear = today.getFullYear();
	}

	function getPriorityColor(priority?: string) {
		if (!priority) return 'bg-gray-500';
		switch (priority) {
			case 'urgent':
				return 'bg-red-500';
			case 'high':
				return 'bg-orange-500';
			case 'medium':
				return 'bg-yellow-500';
			case 'low':
				return 'bg-blue-500';
			default:
				return 'bg-gray-500';
		}
	}

	function getStatusColor(status?: string) {
		if (!status) return '';
		switch (status) {
			case 'done':
			case 'completed':
				return 'opacity-50 line-through';
			case 'in_progress':
			case 'active':
				return 'text-blue-600 dark:text-blue-400';
			default:
				return '';
		}
	}


	function getEventTypeIcon(type?: string) {
		if (type === 'event') {
			return CalendarIconLucide;
		}
		return CheckSquare;
	}
</script>

<div class="flex h-full flex-col">
	<!-- Calendar header -->
	<div class="flex items-center justify-between border-b p-4">
		<div class="flex items-center gap-4">
			<h2 class="text-xl font-semibold">
				{monthNames[currentMonth]} {currentYear}
			</h2>
			<Button variant="outline" size="sm" on:click={goToToday}>
				Today
			</Button>
		</div>

		<div class="flex items-center gap-2">
			<Button
				size="icon"
				variant="ghost"
				on:click={previousMonth}
			>
				<ChevronLeft class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				on:click={nextMonth}
			>
				<ChevronRight class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- Calendar grid -->
	<div class="flex-1 overflow-auto p-4">
		<div class="grid grid-cols-7 gap-0 border-l border-t">
			<!-- Day headers -->
			{#each dayNames as day}
				<div class="border-b border-r bg-muted/50 p-2 text-center text-sm font-medium">
					{day}
				</div>
			{/each}

			<!-- Calendar days -->
			{#each calendarDays as date}
				{@const dayEvents = getEventsForDate(date)}
				{@const isCurrentMonthDay = isCurrentMonth(date)}
				{@const isTodayDate = isToday(date)}

				<div
					class="min-h-[100px] border-b border-r p-2 {!isCurrentMonthDay ? 'bg-muted/20' : ''} {isTodayDate ? 'bg-primary/5' : ''}"
				>
					<!-- Date number -->
					<div class="mb-1 flex items-center justify-between">
						<span class="text-sm font-medium {!isCurrentMonthDay ? 'text-muted-foreground' : ''} {isTodayDate ? 'text-primary' : ''}">
							{date.getDate()}
						</span>
						{#if isCurrentMonthDay && showCreateButton}
							<Button
								size="icon"
								variant="ghost"
								class="h-5 w-5"
								on:click={() => dispatch('create', { date })}
							>
								<Plus class="h-3 w-3" />
							</Button>
						{/if}
					</div>

					<!-- Events for this day -->
					{#if dayEvents.length > 0}
						<div class="space-y-1">
							{#each dayEvents.slice(0, 3) as event}
								{@const EventIcon = getEventTypeIcon(event.type)}
								<button
									class="group relative w-full rounded px-1 py-0.5 text-left text-xs hover:bg-accent flex items-center gap-1"
									on:click={() => dispatch('open', { event })}
									title="{event.title}{event.description ? ` - ${event.description}` : ''}"
								>
									{#if event.type === 'event'}
										<EventIcon class="h-3 w-3 text-purple-500 flex-shrink-0" />
									{:else if event.priority}
										<div class="h-1.5 w-1.5 rounded-full {getPriorityColor(event.priority)} flex-shrink-0"></div>
									{:else}
										<EventIcon class="h-3 w-3 text-gray-500 flex-shrink-0" />
									{/if}
									<span class="truncate {getStatusColor(event.status)}">
										{event.title}
									</span>
									<!-- Tooltip on hover -->
									<div class="absolute left-0 top-full z-10 mt-1 hidden w-64 rounded-md bg-popover p-2 text-xs text-popover-foreground shadow-md group-hover:block">
										<div class="font-semibold">{event.title}</div>
										{#if event.description}
											<div class="mt-1 text-muted-foreground">{event.description}</div>
										{/if}
										{#if event.priority}
											<div class="mt-1">
												<span class="font-medium">Priority: </span>
												<span class="capitalize">{event.priority}</span>
											</div>
										{/if}
										{#if event.status}
											<div class="mt-1">
												<span class="font-medium">Status: </span>
												<span class="capitalize">{event.status}</span>
											</div>
										{/if}
										<div class="mt-1 text-muted-foreground">Click to edit</div>
									</div>
								</button>
							{/each}
							{#if dayEvents.length > 3}
								<button
									class="w-full rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground"
									on:click={() => dispatch('showMore', { date, events: dayEvents })}
								>
									+{dayEvents.length - 3} more
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	/* Ensure grid items maintain aspect ratio on smaller screens */
	@media (max-width: 768px) {
		.calendar-day {
			min-height: 80px;
		}
	}
</style>

