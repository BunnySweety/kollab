<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { X, Plus, Filter } from 'lucide-svelte';

	export let properties: Record<string, any> = {};
	export let filters: Array<{
		property: string;
		operator: string;
		value: any;
	}> = [];
	export let onFiltersChange: (filters: Array<{ property: string; operator: string; value: any }>) => void = () => {};

	const operators = [
		{ value: 'equals', label: 'Equals' },
		{ value: 'not_equals', label: 'Not equals' },
		{ value: 'contains', label: 'Contains' },
		{ value: 'not_contains', label: 'Does not contain' },
		{ value: 'greater_than', label: 'Greater than' },
		{ value: 'less_than', label: 'Less than' },
		{ value: 'is_empty', label: 'Is empty' },
		{ value: 'is_not_empty', label: 'Is not empty' }
	];

	function addFilter() {
		const propertyKeys = Object.keys(properties);
		if (propertyKeys.length === 0) return;
		
		const newFilters = [
			...filters,
			{
				property: propertyKeys[0],
				operator: 'equals',
				value: ''
			}
		];
		onFiltersChange(newFilters);
	}

	function removeFilter(index: number) {
		const newFilters = filters.filter((_, i) => i !== index);
		onFiltersChange(newFilters);
	}

	function updateFilter(index: number, field: 'property' | 'operator' | 'value', newValue: any) {
		const newFilters = [...filters];
		newFilters[index] = {
			...newFilters[index],
			[field]: newValue
		};
		onFiltersChange(newFilters);
	}

	function getOperatorsForProperty(propertyKey: string) {
		if (!properties[propertyKey]) return operators;
		
		const property = properties[propertyKey];
		
		// Filter operators based on property type
		if (property.type === 'number' || property.type === 'date') {
			return operators.filter(op => 
				['equals', 'not_equals', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'].includes(op.value)
			);
		} else if (property.type === 'checkbox') {
			return operators.filter(op => 
				['equals', 'not_equals', 'is_empty', 'is_not_empty'].includes(op.value)
			);
		} else {
			return operators;
		}
	}

	function getInputType(propertyKey: string): string {
		if (!properties[propertyKey]) return 'text';
		
		const property = properties[propertyKey];
		switch (property.type) {
			case 'number':
				return 'number';
			case 'email':
				return 'email';
			case 'url':
				return 'url';
			case 'date':
				return 'date';
			default:
				return 'text';
		}
	}

	function shouldShowValueInput(operator: string): boolean {
		return !['is_empty', 'is_not_empty'].includes(operator);
	}
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Filter class="h-4 w-4 text-muted-foreground" />
			<span class="text-sm font-semibold">Filters</span>
			{#if filters.length > 0}
				<span class="text-xs text-muted-foreground bg-primary/10 px-2 py-0.5 rounded">
					{filters.length}
				</span>
			{/if}
		</div>
		<Button variant="outline" size="sm" on:click={addFilter}>
			<Plus class="h-3 w-3 mr-1" />
			Add Filter
		</Button>
	</div>

	{#if filters.length === 0}
		<div class="text-sm text-muted-foreground py-4 text-center border rounded-lg">
			No filters applied
		</div>
	{:else}
		<div class="space-y-2">
			{#each filters as filter, index}
				<div class="flex items-center gap-2 p-3 border rounded-lg bg-card">
					<!-- Property Select -->
					<div class="flex-1">
						<Label class="text-xs text-muted-foreground">Property</Label>
						<select
							value={filter.property}
							on:change={(e) => {
								const newProperty = e.currentTarget.value;
								const property = properties[newProperty];
								updateFilter(index, 'property', newProperty);
								// Reset operator if not compatible
								const compatibleOps = getOperatorsForProperty(newProperty);
								if (!compatibleOps.find(op => op.value === filter.operator)) {
									updateFilter(index, 'operator', compatibleOps[0]?.value || 'equals');
								}
								// Reset value for checkbox
								if (property?.type === 'checkbox') {
									updateFilter(index, 'value', false);
								} else {
									updateFilter(index, 'value', '');
								}
							}}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							{#each Object.entries(properties) as [key, property]}
								<option value={key}>{property.name || key}</option>
							{/each}
						</select>
					</div>

					<!-- Operator Select -->
					<div class="flex-1">
						<Label class="text-xs text-muted-foreground">Operator</Label>
						<select
							value={filter.operator}
							on:change={(e) => updateFilter(index, 'operator', e.currentTarget.value)}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							{#each getOperatorsForProperty(filter.property) as op}
								<option value={op.value}>{op.label}</option>
							{/each}
						</select>
					</div>

					<!-- Value Input -->
					{#if shouldShowValueInput(filter.operator)}
						<div class="flex-1">
							<Label class="text-xs text-muted-foreground">Value</Label>
							{#if properties[filter.property]?.type === 'checkbox'}
								<select
									value={String(filter.value)}
									on:change={(e) => updateFilter(index, 'value', e.currentTarget.value === 'true')}
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
								>
									<option value="true">Yes</option>
									<option value="false">No</option>
								</select>
							{:else if properties[filter.property]?.type === 'select' || properties[filter.property]?.type === 'multi-select'}
								<select
									value={filter.value}
									on:change={(e) => updateFilter(index, 'value', e.currentTarget.value)}
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
								>
									<option value="">Select...</option>
									{#if properties[filter.property]?.options}
										{#each properties[filter.property].options as option}
											<option value={option}>{option}</option>
										{/each}
									{/if}
								</select>
							{:else}
								<Input
									type={getInputType(filter.property)}
									value={filter.value}
									on:input={(e) => updateFilter(index, 'value', e.currentTarget.value)}
									placeholder="Value"
									class="w-full"
								/>
							{/if}
						</div>
					{/if}

					<!-- Remove Button -->
					<div class="pt-6">
						<Button
							variant="ghost"
							size="icon"
							on:click={() => removeFilter(index)}
							class="h-8 w-8"
						>
							<X class="h-4 w-4" />
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

