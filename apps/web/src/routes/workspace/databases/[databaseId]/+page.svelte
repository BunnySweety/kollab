<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '$lib/components/ui/dialog';
	import { ArrowLeft, Plus, Edit, Trash2, Database, X, Search, ArrowUpDown, Filter, GripVertical, Copy, Download, Eye, EyeOff, CheckSquare, Square } from 'lucide-svelte';
	import { api, endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';
	import { toast } from 'svelte-sonner';
	import { currentWorkspaceId } from '$lib/stores/workspace';
	import DatabaseViewSelector from '$lib/components/databases/DatabaseViewSelector.svelte';
	import GalleryView from '$lib/components/databases/GalleryView.svelte';
	import FilterPanel from '$lib/components/databases/FilterPanel.svelte';
	import MultiSelectInput from '$lib/components/databases/MultiSelectInput.svelte';

	export let data: any;

	let database: any = null;
	let entries: any[] = [];
	let filteredEntries: any[] = [];
	let loading = true;
	let showCreateModal = false;
	let showEditModal = false;
	let showDeleteModal = false;
	let editingEntry: any = null;
	let entryToDelete: any = null;
	let showDeleteColumnModal = false;
	let columnToDelete: { key: string; name: string } | null = null;
	let showBulkDeleteModal = false;
	let creatingEntry = false;
	let updatingEntry = false;
	let entryFormData: Record<string, any> = {};
	let entryFormErrors: Record<string, string> = {};
	let showEditDatabaseModal = false;
	let editingDatabase = false;
	let databaseName = '';
	let databaseDescription = '';
	let defaultViewName = 'Table';
	let databaseViews: Array<{ type: string; name: string }> = [];
	
	// Database columns/properties for editing
	type ColumnType = 'title' | 'text' | 'number' | 'email' | 'url' | 'date' | 'checkbox' | 'select' | 'multi-select';
	interface DatabaseColumn {
		id: string;
		key: string; // Original key from properties
		name: string;
		type: ColumnType;
		options?: string[];
		isNew?: boolean; // For new columns
	}
	
	let databaseColumns: DatabaseColumn[] = [];
	let searchQuery = '';
	let currentView: 'table' | 'gallery' = 'table';
	let sortColumn: string | null = null;
	let sortDirection: 'asc' | 'desc' = 'asc';
	let showFilters = false;
	let filters: Array<{ property: string; operator: string; value: any }> = [];
	
	// Inline column editing
	let editingColumnKey: string | null = null;
	let editingColumnName: string = '';
	let editingColumnType: ColumnType = 'text';
	let editingColumnOptions: string[] = [];
	let showColumnMenu: string | null = null;
	let newOptionInput: string = '';
	let editingColumnNameOnly: string | null = null; // For quick name editing
	let editingColumnNameValue: string = '';
	let draggedColumnKey: string | null = null;
	let draggedOverColumnKey: string | null = null;
	
	// Inline cell editing
	let editingCell: { entryId: string; propertyKey: string } | null = null;
	let editingCellValue: any = null;
	let savingCell = false;
	
	// Column visibility
	let hiddenColumns: Set<string> = new Set();
	
	// Column widths
	let columnWidths: Record<string, number> = {};
	let resizingColumn: string | null = null;
	let resizingStartX: number = 0;
	let resizingStartWidth: number = 0;
	
	// Bulk actions
	let selectedEntries: Set<string> = new Set();
	let selectedEntriesVersion = 0; // Reactive counter to force updates
	let showBulkActions = false;

	$: databaseId = $page.params.databaseId;
	function applyFilter(entry: any, filter: { property: string; operator: string; value: any }): boolean {
		if (!database || !database.properties) return true;
		
		const property = database.properties[filter.property];
		if (!property) return true;
		
		const entryValue = getPropertyValue(entry, filter.property);
		
		switch (filter.operator) {
			case 'equals':
				return String(entryValue) === String(filter.value);
			case 'not_equals':
				return String(entryValue) !== String(filter.value);
			case 'contains':
				return String(entryValue).toLowerCase().includes(String(filter.value).toLowerCase());
			case 'not_contains':
				return !String(entryValue).toLowerCase().includes(String(filter.value).toLowerCase());
			case 'greater_than':
				if (property.type === 'number') {
					return Number(entryValue) > Number(filter.value);
				} else if (property.type === 'date') {
					return new Date(entryValue).getTime() > new Date(filter.value).getTime();
				}
				return false;
			case 'less_than':
				if (property.type === 'number') {
					return Number(entryValue) < Number(filter.value);
				} else if (property.type === 'date') {
					return new Date(entryValue).getTime() < new Date(filter.value).getTime();
				}
				return false;
			case 'is_empty':
				return entryValue === null || entryValue === undefined || entryValue === '';
			case 'is_not_empty':
				return entryValue !== null && entryValue !== undefined && entryValue !== '';
			default:
				return true;
		}
	}

	$: {
		let result = entries;
		
		// Apply filters
		if (filters.length > 0 && database && database.properties) {
			result = result.filter(entry => {
				return filters.every(filter => applyFilter(entry, filter));
			});
		}
		
		// Apply search filter
		if (searchQuery.trim() && database && database.properties) {
			const query = searchQuery.toLowerCase();
			result = result.filter(entry => {
				if (!entry.data) return false;
				return Object.entries(database.properties).some(([key, _]: [string, any]) => {
					const value = entry.data[key];
					if (value === null || value === undefined) return false;
					return String(value).toLowerCase().includes(query);
				});
			});
		}
		
		// Apply sorting
		if (sortColumn && database && database.properties) {
			result = [...result].sort((a, b) => {
				const aValue = getPropertyValue(a, sortColumn);
				const bValue = getPropertyValue(b, sortColumn);
				const property = database.properties[sortColumn];
				
				if (aValue === null || aValue === undefined) return 1;
				if (bValue === null || bValue === undefined) return -1;
				
				let comparison = 0;
				if (property.type === 'number') {
					comparison = Number(aValue) - Number(bValue);
				} else if (property.type === 'date') {
					comparison = new Date(aValue).getTime() - new Date(bValue).getTime();
				} else {
					comparison = String(aValue).localeCompare(String(bValue));
				}
				
				return sortDirection === 'asc' ? comparison : -comparison;
			});
		}
		
		filteredEntries = result;
	}

	onMount(() => {
		if (databaseId) {
			loadDatabase();
		}
	});

	async function loadDatabase() {
		if (!databaseId) {
			loading = false;
			return;
		}

		loading = true;
		try {
			log.info('Loading database', { databaseId });
			const response = await api.get(endpoints.databases.get(databaseId));
			database = response.database;
			entries = response.entries || [];
			
			// Preserve column order if stored in views metadata
			if (database && database.properties) {
				const views = Array.isArray(database.views) ? database.views : [];
				const columnOrderView = views.find((v: any) => v.type === '_columnOrder');
				if (columnOrderView && columnOrderView.order && Array.isArray(columnOrderView.order)) {
					// Reorder properties according to stored order
					const orderedProperties: Record<string, any> = {};
					const existingProperties = { ...database.properties };
					
					// Add properties in the stored order
					columnOrderView.order.forEach((key: string) => {
						if (existingProperties[key]) {
							orderedProperties[key] = existingProperties[key];
							delete existingProperties[key];
						}
					});
					
					// Add any remaining properties that weren't in the order list
					Object.assign(orderedProperties, existingProperties);
					
					database.properties = orderedProperties;
				}
				
				// Load hidden columns from views metadata
				const hiddenColumnsView = views.find((v: any) => v.type === '_hiddenColumns');
				if (hiddenColumnsView && hiddenColumnsView.columns && Array.isArray(hiddenColumnsView.columns)) {
					hiddenColumns = new Set(hiddenColumnsView.columns);
				} else {
					hiddenColumns = new Set();
				}
				
				// Load column widths from views metadata
				const columnWidthsView = views.find((v: any) => v.type === '_columnWidths');
				if (columnWidthsView && columnWidthsView.widths && typeof columnWidthsView.widths === 'object') {
					columnWidths = columnWidthsView.widths;
				} else {
					columnWidths = {};
				}
			}
			filteredEntries = entries;
			databaseName = database.name || '';
			databaseDescription = database.description || '';
			searchQuery = '';
			sortColumn = null;
			sortDirection = 'asc';
			filters = [];
			showFilters = false;
			selectedEntries.clear();
			selectedEntries = selectedEntries; // Trigger reactivity
			
			// Set default view - ensure it's available
			const availableViewsList = getAvailableViews();
			if (availableViewsList.length > 0) {
				// Check if current view is still valid
				if (availableViewsList.some(v => v.type === currentView)) {
					// Current view is still valid, keep it
				} else {
					// Current view is not available, use first available
					currentView = availableViewsList[0].type as 'table' | 'gallery';
				}
			} else {
				currentView = 'table';
			}
			
			log.info('Database loaded', { 
				databaseId, 
				entryCount: entries.length,
				currentView,
				availableViews: availableViewsList,
				hasImageProperty: hasImageProperty(),
				databaseViews: database.views
			});
		} catch (error) {
			log.error('Load database error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to load database');
			goto('/workspace/databases');
		} finally {
			loading = false;
		}
	}

	function getPropertyValue(entry: any, propertyName: string): any {
		if (!entry.data || typeof entry.data !== 'object') {
			return null;
		}
		return entry.data[propertyName] || null;
	}

	function formatPropertyValue(value: any, propertyType: string): string {
		if (value === null || value === undefined) {
			return '-';
		}

		switch (propertyType) {
			case 'date':
				return new Date(value).toLocaleDateString();
			case 'checkbox':
				return value ? 'Yes' : 'No';
			case 'number':
				return String(value);
			case 'multi-select':
				return Array.isArray(value) ? value.join(', ') : String(value);
			default:
				return String(value);
		}
	}

	// Inline cell editing functions
	function startEditCell(entryId: string, propertyKey: string, currentValue: any, propertyType: string) {
		if (savingCell) return;
		
		editingCell = { entryId, propertyKey };
		
		// Format value for input based on property type
		if (propertyType === 'date' && currentValue) {
			const date = new Date(currentValue);
			editingCellValue = date.toISOString().split('T')[0];
		} else if (propertyType === 'multi-select') {
			editingCellValue = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
		} else if (propertyType === 'checkbox') {
			editingCellValue = Boolean(currentValue);
		} else {
			editingCellValue = currentValue || '';
		}
	}

	function cancelEditCell() {
		editingCell = null;
		editingCellValue = null;
	}

	async function saveEditCell() {
		if (!editingCell || !databaseId || !database || savingCell) return;
		
		const { entryId, propertyKey } = editingCell;
		const property = database.properties[propertyKey];
		if (!property) {
			cancelEditCell();
			return;
		}

		// Validate the value
		const error = validateField(propertyKey, property, editingCellValue);
		if (error) {
			toast.error(error);
			return;
		}

		savingCell = true;
		try {
			// Find the entry to update
			const entry = entries.find(e => e.id === entryId);
			if (!entry) {
				toast.error('Entry not found');
				cancelEditCell();
				return;
			}

			// Prepare the data update
			const entryData = { ...entry.data };
			
			// Convert value based on property type
			switch (property.type) {
				case 'number':
					entryData[propertyKey] = editingCellValue === '' ? null : Number(editingCellValue);
					break;
				case 'checkbox':
					entryData[propertyKey] = Boolean(editingCellValue);
					break;
				case 'date':
					entryData[propertyKey] = editingCellValue ? new Date(editingCellValue).toISOString() : null;
					break;
				case 'multi-select':
					entryData[propertyKey] = Array.isArray(editingCellValue) ? editingCellValue : [editingCellValue];
					break;
				default:
					entryData[propertyKey] = editingCellValue === '' ? null : String(editingCellValue);
			}

			// Update via API
			await api.put(endpoints.databases.entries.update(databaseId, entryId), {
				data: entryData
			});

			// Update local state
			entry.data = entryData;
			
			toast.success('Cell updated');
			cancelEditCell();
		} catch (error) {
			log.error('Save cell error', error instanceof Error ? error : new Error(String(error)), { 
				databaseId, 
				entryId, 
				propertyKey 
			});
			toast.error('Failed to update cell');
		} finally {
			savingCell = false;
		}
	}

	function isEditingCell(entryId: string, propertyKey: string): boolean {
		return editingCell?.entryId === entryId && editingCell?.propertyKey === propertyKey;
	}

	// Column visibility functions
	function toggleColumnVisibility(key: string) {
		if (hiddenColumns.has(key)) {
			hiddenColumns.delete(key);
		} else {
			hiddenColumns.add(key);
		}
		hiddenColumns = hiddenColumns; // Trigger reactivity
		saveColumnVisibility();
	}

	function isColumnHidden(key: string): boolean {
		return hiddenColumns.has(key);
	}

	function getVisibleColumns(): Array<[string, any]> {
		if (!database || !database.properties) return [];
		return Object.entries(database.properties).filter(([key]) => !hiddenColumns.has(key));
	}

	async function saveColumnVisibility() {
		if (!databaseId || !database) return;
		
		try {
			const views = Array.isArray(database.views) ? database.views.filter((v: any) => v.type !== '_hiddenColumns') : [];
			
			if (hiddenColumns.size > 0) {
				views.push({
					type: '_hiddenColumns',
					columns: Array.from(hiddenColumns)
				});
			}

			await api.put(endpoints.databases.update(databaseId), buildDatabaseUpdatePayload(database.properties, views));
		} catch (error) {
			log.error('Save column visibility error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to save column visibility');
		}
	}

	// Column resizing functions
	function startResizeColumn(key: string, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		resizingColumn = key;
		resizingStartX = e.clientX;
		resizingStartWidth = columnWidths[key] || 150; // Default width
		
		document.addEventListener('mousemove', handleResizeMove);
		document.addEventListener('mouseup', stopResizeColumn);
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	}

	function handleResizeMove(e: MouseEvent) {
		if (!resizingColumn) return;
		
		const deltaX = e.clientX - resizingStartX;
		const newWidth = Math.max(100, resizingStartWidth + deltaX); // Minimum width 100px
		columnWidths[resizingColumn] = newWidth;
		columnWidths = columnWidths; // Trigger reactivity
	}

	function stopResizeColumn() {
		if (resizingColumn) {
			saveColumnWidths();
		}
		resizingColumn = null;
		document.removeEventListener('mousemove', handleResizeMove);
		document.removeEventListener('mouseup', stopResizeColumn);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}

	// Cleanup event listeners on component destroy
	onDestroy(() => {
		document.removeEventListener('mousemove', handleResizeMove);
		document.removeEventListener('mouseup', stopResizeColumn);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	});

	function getColumnWidth(key: string): string {
		const width = columnWidths[key];
		return width ? `${width}px` : 'auto';
	}

	async function saveColumnWidths() {
		if (!databaseId || !database) return;
		
		try {
			const views = Array.isArray(database.views) ? database.views.filter((v: any) => v.type !== '_columnWidths') : [];
			
			if (Object.keys(columnWidths).length > 0) {
				views.push({
					type: '_columnWidths',
					widths: columnWidths
				});
			}

			await api.put(endpoints.databases.update(databaseId), buildDatabaseUpdatePayload(database.properties, views));
		} catch (error) {
			log.error('Save column widths error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to save column widths');
		}
	}

	// Bulk actions functions
	function toggleEntrySelection(entryId: string) {
		const newSet = new Set(selectedEntries); // Create new Set for reactivity
		if (newSet.has(entryId)) {
			newSet.delete(entryId);
		} else {
			newSet.add(entryId);
		}
		selectedEntries = newSet; // Assign new Set to trigger reactivity
		selectedEntriesVersion++; // Force reactivity update
		updateBulkActionsVisibility();
	}

	function toggleSelectAll() {
		if (selectedEntries.size === filteredEntries.length) {
			selectedEntries = new Set(); // Create new empty Set
		} else {
			selectedEntries = new Set(filteredEntries.map(e => e.id));
		}
		selectedEntriesVersion++; // Force reactivity update
		updateBulkActionsVisibility();
	}

	function isEntrySelected(entryId: string): boolean {
		// Use selectedEntriesVersion to force reactivity
		void selectedEntriesVersion; // Reference to trigger reactivity
		return selectedEntries.has(entryId);
	}

	function isAllSelected(): boolean {
		void selectedEntriesVersion; // Reference to trigger reactivity
		return filteredEntries.length > 0 && selectedEntries.size === filteredEntries.length;
	}

	function isSomeSelected(): boolean {
		void selectedEntriesVersion; // Reference to trigger reactivity
		return selectedEntries.size > 0 && selectedEntries.size < filteredEntries.length;
	}

	function updateBulkActionsVisibility() {
		showBulkActions = selectedEntries.size > 0;
	}

	$: {
		updateBulkActionsVisibility();
	}

	// Reactive statement to initialize columns when modal opens and database is loaded
	$: if (showEditDatabaseModal && database && database.properties && Object.keys(database.properties).length > 0) {
		// Initialize columns if they're empty or if we need to refresh them
		const hasExistingColumns = databaseColumns.some(col => !col.isNew && col.key);
		if (!hasExistingColumns) {
			initializeColumns();
		}
	}

	function openBulkDeleteModal() {
		if (selectedEntries.size === 0) return;
		showBulkDeleteModal = true;
	}

	async function bulkDeleteEntries() {
		if (!databaseId || selectedEntries.size === 0) return;

		const count = selectedEntries.size;

		try {
			const deletePromises = Array.from(selectedEntries).map(entryId =>
				api.delete(endpoints.databases.entries.delete(databaseId, entryId))
			);

			await Promise.all(deletePromises);

			toast.success(`${count} entr${count > 1 ? 'ies' : 'y'} deleted successfully`);
			selectedEntries.clear();
			selectedEntriesVersion++;
			updateBulkActionsVisibility();
			showBulkDeleteModal = false;
			await loadDatabase();
		} catch (error) {
			log.error('Bulk delete error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to delete entries');
			showBulkDeleteModal = false;
		}
	}

	function bulkExportSelected() {
		if (!database || selectedEntries.size === 0) {
			toast.error('No entries selected');
			return;
		}

		try {
			// Get selected entries
			const selectedEntriesData = filteredEntries.filter(e => selectedEntries.has(e.id));
			
			// Get visible property keys in order (exclude hidden columns)
			const propertyKeys = getVisibleColumns().map(([key]) => key);
			
			// Create CSV header
			const headers = propertyKeys.map(key => {
				const property = database.properties[key];
				return `"${(property.name || key).replace(/"/g, '""')}"`;
			});
			const csvRows = [headers.join(',')];

			// Add data rows for selected entries only
			selectedEntriesData.forEach(entry => {
				const row = propertyKeys.map(key => {
					const value = getPropertyValue(entry, key);
					const property = database.properties[key];
					
					// Format value for CSV
					let csvValue = '';
					if (value === null || value === undefined) {
						csvValue = '';
					} else if (property.type === 'multi-select') {
						csvValue = Array.isArray(value) ? value.join('; ') : String(value);
					} else if (property.type === 'date') {
						csvValue = new Date(value).toLocaleDateString();
					} else if (property.type === 'checkbox') {
						csvValue = value ? 'Yes' : 'No';
					} else {
						csvValue = String(value);
					}
					
					// Escape quotes and wrap in quotes
					return `"${csvValue.replace(/"/g, '""')}"`;
				});
				csvRows.push(row.join(','));
			});

			// Create CSV content
			const csvContent = csvRows.join('\n');
			
			// Create blob and download
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
			const link = document.createElement('a');
			const url = URL.createObjectURL(blob);
			
			link.setAttribute('href', url);
			link.setAttribute('download', `${database.name || 'database'}_selected_${new Date().toISOString().split('T')[0]}.csv`);
			link.style.visibility = 'hidden';
			
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			
			toast.success(`${selectedEntries.size} entr${selectedEntries.size > 1 ? 'ies' : 'y'} exported successfully`);
		} catch (error) {
			log.error('Bulk export error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to export entries');
		}
	}

	function clearSelection() {
		selectedEntries = new Set(); // Create new Set to force reactivity
		selectedEntriesVersion++; // Force reactivity update
		updateBulkActionsVisibility();
	}

	function validateField(key: string, property: any, value: any): string {
		if (property.type === 'title' && (!value || String(value).trim() === '')) {
			return 'This field is required';
		}
		if (property.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
			return 'Please enter a valid email address';
		}
		if (property.type === 'url' && value && !/^https?:\/\/.+/.test(String(value))) {
			return 'Please enter a valid URL';
		}
		if (property.type === 'number' && value && isNaN(Number(value))) {
			return 'Please enter a valid number';
		}
		return '';
	}

	function validateForm(): boolean {
		if (!database || !database.properties) return false;
		entryFormErrors = {};
		let isValid = true;

		Object.entries(database.properties).forEach(([key, property]: [string, any]) => {
			const error = validateField(key, property, entryFormData[key]);
			if (error) {
				entryFormErrors[key] = error;
				isValid = false;
			}
		});

		return isValid;
	}

	function openCreateModal() {
		if (!database || !database.properties) return;
		entryFormData = {};
		entryFormErrors = {};
		Object.entries(database.properties).forEach(([key, property]: [string, any]) => {
			if (property.type === 'multi-select') {
				entryFormData[key] = [];
			} else {
				entryFormData[key] = '';
			}
		});
		showCreateModal = true;
	}

	function openEditModal(entry: any) {
		if (!entry || !database || !database.properties) return;
		editingEntry = entry;
		entryFormData = {};
		entryFormErrors = {};
		
		// Copy entry data and format dates for input fields
		Object.entries(database.properties).forEach(([key, property]: [string, any]) => {
			const value = entry.data?.[key];
			if (property.type === 'date' && value) {
				// Format date for HTML date input (YYYY-MM-DD)
				const date = new Date(value);
				entryFormData[key] = date.toISOString().split('T')[0];
			} else if (property.type === 'multi-select') {
				entryFormData[key] = Array.isArray(value) ? value : (value ? [value] : []);
			} else {
				entryFormData[key] = value || '';
			}
		});
		
		showEditModal = true;
	}

	function openDeleteModal(entry: any) {
		entryToDelete = entry;
		showDeleteModal = true;
	}

	function resetCreateForm() {
		entryFormData = {};
		entryFormErrors = {};
		if (database && database.properties) {
			Object.entries(database.properties).forEach(([key, property]: [string, any]) => {
				if (property.type === 'multi-select') {
					entryFormData[key] = [];
				} else {
					entryFormData[key] = '';
				}
			});
		}
	}

	async function createEntry() {
		if (!databaseId || !database) return;

		if (!validateForm()) {
			toast.error('Please fix the errors in the form');
			return;
		}

		creatingEntry = true;
		try {

			// Convert form data to proper types based on property types
			const entryData: Record<string, any> = {};
			Object.entries(database.properties || {}).forEach(([key, property]: [string, any]) => {
				const value = entryFormData[key];
				if (value === undefined || value === null || value === '') {
					return;
				}

				switch (property.type) {
					case 'number':
						entryData[key] = Number(value);
						break;
					case 'checkbox':
						entryData[key] = Boolean(value);
						break;
					case 'date':
						entryData[key] = new Date(value).toISOString();
						break;
					case 'multi-select':
						entryData[key] = Array.isArray(value) ? value : [value];
						break;
					default:
						entryData[key] = String(value);
				}
			});

			await api.post(endpoints.databases.entries.create(databaseId), {
				data: entryData
			});

			toast.success('Entry created successfully');
			showCreateModal = false;
			resetCreateForm();
			await loadDatabase();
		} catch (error) {
			log.error('Create entry error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to create entry');
		} finally {
			creatingEntry = false;
		}
	}

	async function updateEntry() {
		if (!databaseId || !editingEntry) return;

		if (!validateForm()) {
			toast.error('Please fix the errors in the form');
			return;
		}

		updatingEntry = true;
		try {
			// Convert form data to proper types
			const entryData: Record<string, any> = {};
			Object.entries(database.properties || {}).forEach(([key, property]: [string, any]) => {
				const value = entryFormData[key];
				if (value === undefined || value === null || value === '') {
					return;
				}

				switch (property.type) {
					case 'number':
						entryData[key] = Number(value);
						break;
					case 'checkbox':
						entryData[key] = Boolean(value);
						break;
					case 'date':
						entryData[key] = new Date(value).toISOString();
						break;
					case 'multi-select':
						entryData[key] = Array.isArray(value) ? value : [value];
						break;
					default:
						entryData[key] = String(value);
				}
			});

			await api.put(endpoints.databases.entries.update(databaseId, editingEntry.id), {
				data: entryData
			});

			toast.success('Entry updated successfully');
			showEditModal = false;
			editingEntry = null;
			await loadDatabase();
		} catch (error) {
			log.error('Update entry error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to update entry');
		} finally {
			updatingEntry = false;
		}
	}

	async function deleteEntry() {
		if (!databaseId || !entryToDelete) return;

		try {
			await api.delete(endpoints.databases.entries.delete(databaseId, entryToDelete.id));
			toast.success('Entry deleted successfully');
			showDeleteModal = false;
			entryToDelete = null;
			await loadDatabase();
		} catch (error) {
			log.error('Delete entry error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to delete entry');
		}
	}

	async function duplicateEntry(entry: any) {
		if (!databaseId || !entry || !database) return;

		try {
			// Copy entry data
			const entryData = { ...entry.data };
			
			// Find title column and add "Copy of" prefix
			if (database.properties) {
				Object.entries(database.properties).forEach(([key, property]: [string, any]) => {
					if (property.type === 'title' && entryData[key]) {
						const originalValue = String(entryData[key]);
						entryData[key] = originalValue.startsWith('Copy of') 
							? originalValue 
							: `Copy of ${originalValue}`;
					}
				});
			}

			// Create new entry with copied data
			await api.post(endpoints.databases.entries.create(databaseId), {
				data: entryData
			});

			toast.success('Entry duplicated successfully');
			await loadDatabase();
		} catch (error) {
			log.error('Duplicate entry error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to duplicate entry');
		}
	}

	function exportToCSV() {
		if (!database || !filteredEntries.length) {
			toast.error('No data to export');
			return;
		}

		try {
			// Get visible property keys in order (exclude hidden columns)
			const propertyKeys = getVisibleColumns().map(([key]) => key);
			
			// Create CSV header
			const headers = propertyKeys.map(key => {
				const property = database.properties[key];
				return `"${(property.name || key).replace(/"/g, '""')}"`;
			});
			const csvRows = [headers.join(',')];

			// Add data rows
			filteredEntries.forEach(entry => {
				const row = propertyKeys.map(key => {
					const value = getPropertyValue(entry, key);
					const property = database.properties[key];
					
					// Format value for CSV
					let csvValue = '';
					if (value === null || value === undefined) {
						csvValue = '';
					} else if (property.type === 'multi-select') {
						csvValue = Array.isArray(value) ? value.join('; ') : String(value);
					} else if (property.type === 'date') {
						csvValue = new Date(value).toLocaleDateString();
					} else if (property.type === 'checkbox') {
						csvValue = value ? 'Yes' : 'No';
					} else {
						csvValue = String(value);
					}
					
					// Escape quotes and wrap in quotes
					return `"${csvValue.replace(/"/g, '""')}"`;
				});
				csvRows.push(row.join(','));
			});

			// Create CSV content
			const csvContent = csvRows.join('\n');
			
			// Create blob and download
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
			const link = document.createElement('a');
			const url = URL.createObjectURL(blob);
			
			link.setAttribute('href', url);
			link.setAttribute('download', `${database.name || 'database'}_${new Date().toISOString().split('T')[0]}.csv`);
			link.style.visibility = 'hidden';
			
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			
			toast.success('Data exported successfully');
		} catch (error) {
			log.error('Export CSV error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to export data');
		}
	}

	function getInputType(propertyType: string): string {
		switch (propertyType) {
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

	function initializeColumns() {
		if (!database || !database.properties) {
			databaseColumns = [];
			log.warn('Cannot initialize columns: database or properties missing', {
				hasDatabase: !!database,
				hasProperties: !!(database && database.properties)
			});
			return;
		}
		
		const properties = database.properties;
		// Preserve the order from _columnOrder view if it exists
		let orderedKeys: string[] = [];
		if (database.views && Array.isArray(database.views)) {
			const columnOrderView = database.views.find((v: any) => v.type === '_columnOrder');
			if (columnOrderView && columnOrderView.order && Array.isArray(columnOrderView.order)) {
				orderedKeys = columnOrderView.order.filter((key: string) => properties[key]);
				// Add any keys that weren't in the order list
				const allKeys = Object.keys(properties);
				allKeys.forEach(key => {
					if (!orderedKeys.includes(key)) {
						orderedKeys.push(key);
					}
				});
			} else {
				orderedKeys = Object.keys(properties);
			}
		} else {
			orderedKeys = Object.keys(properties);
		}
		
		log.info('Initializing columns', {
			columnCount: orderedKeys.length,
			properties: orderedKeys
		});
		
		databaseColumns = orderedKeys.map((key) => {
			const property = properties[key];
			return {
				id: crypto.randomUUID(),
				key,
				name: property?.name || key,
				type: property?.type || 'text',
				options: property?.options || undefined,
				isNew: false
			};
		});
		
		log.info('Columns initialized', {
			columnCount: databaseColumns.length,
			columns: databaseColumns.map(c => ({ key: c.key, name: c.name, type: c.type }))
		});
	}

	function addColumn() {
		databaseColumns = [...databaseColumns, {
			id: crypto.randomUUID(),
			key: '',
			name: '',
			type: 'text' as ColumnType,
			isNew: true
		}];
	}

	function removeColumn(columnId: string) {
		const column = databaseColumns.find(col => col.id === columnId);
		if (!column) return;
		
		// Check if it's the last column
		if (databaseColumns.length <= 1) {
			toast.error('At least one column is required');
			return;
		}
		
		// Check if removing the last title column
		const remainingTitleColumns = databaseColumns.filter(
			col => col.id !== columnId && col.type === 'title'
		);
		if (column.type === 'title' && remainingTitleColumns.length === 0) {
			toast.error('At least one column must be of type "Title"');
			return;
		}
		
		databaseColumns = databaseColumns.filter(col => col.id !== columnId);
	}

	function updateColumn(columnId: string, field: 'name' | 'type', value: string) {
		databaseColumns = databaseColumns.map(col => {
			if (col.id === columnId) {
				if (field === 'type') {
					return { 
						...col, 
						type: value as ColumnType, 
						options: (value === 'select' || value === 'multi-select') ? (col.options || []) : undefined 
					};
				}
				return { ...col, [field]: value };
			}
			return col;
		});
	}

	function addOptionToColumn(columnId: string, option: string) {
		if (!option.trim()) return;
		databaseColumns = databaseColumns.map(col => {
			if (col.id === columnId) {
				const options = col.options || [];
				if (!options.includes(option.trim())) {
					return { ...col, options: [...options, option.trim()] };
				}
			}
			return col;
		});
	}

	function removeOptionFromColumn(columnId: string, option: string) {
		databaseColumns = databaseColumns.map(col => {
			if (col.id === columnId && col.options) {
				return { ...col, options: col.options.filter(opt => opt !== option) };
			}
			return col;
		});
	}

	async function updateDatabase() {
		if (!databaseId || !database) return;

		if (!databaseName.trim()) {
			toast.error('Database name is required');
			return;
		}

		// Validate columns
		const validColumns = databaseColumns.filter(col => col.name.trim());
		if (validColumns.length === 0) {
			toast.error('At least one column with a name is required');
			return;
		}

		// Check for duplicate column names
		const columnNames = validColumns.map(col => col.name.trim().toLowerCase());
		const uniqueNames = new Set(columnNames);
		if (uniqueNames.size !== columnNames.length) {
			toast.error('Column names must be unique');
			return;
		}

		// Check for at least one title column
		const hasTitleColumn = validColumns.some(col => col.type === 'title');
		if (!hasTitleColumn) {
			toast.error('At least one column must be of type "Title"');
			return;
		}

		editingDatabase = true;
		try {
			// Build properties object from columns, preserving the order
			// For existing columns, try to preserve data by keeping the original key if name hasn't changed
			// For renamed columns, use new name as key (old data will be lost, which is acceptable)
			// Use Map to preserve insertion order, then convert to object
			const propertiesMap = new Map<string, any>();
			validColumns.forEach(col => {
				const property: any = {
					type: col.type,
					name: col.name.trim()
				};
				if (col.options && col.options.length > 0) {
					property.options = col.options;
				}
				
				// For new columns, use the name as key
				// For existing columns, use original key if name unchanged, otherwise use new name
				const propertyKey = col.isNew 
					? col.name.trim() 
					: (col.name.trim().toLowerCase() === col.key.toLowerCase() ? col.key : col.name.trim());
				propertiesMap.set(propertyKey, property);
			});
			// Convert Map to object preserving order
			const properties: Record<string, any> = {};
			propertiesMap.forEach((value, key) => {
				properties[key] = value;
			});

			// Check if database has image-related properties for gallery view
			const hasImageProp = Object.values(properties).some((prop: any) => {
				return prop.type === 'url' || 
				       (prop.type === 'text' && (prop.name?.toLowerCase().includes('image') || 
				                                 prop.name?.toLowerCase().includes('photo') ||
				                                 prop.name?.toLowerCase().includes('cover')));
			});

			// Use the views from the modal, preserving their names
			// Update the table view name with the default view name
			let views: Array<{ type: string; name: string }> = databaseViews.length > 0 
				? databaseViews.map(v => {
					// Use defaultViewName for table view
					if (v.type === 'table') {
						return { type: v.type, name: defaultViewName.trim() || 'Table' };
					}
					return { type: v.type, name: v.name };
				})
				: [
					{ type: 'table', name: defaultViewName.trim() || 'Table' },
					...(hasImageProp ? [{ type: 'gallery', name: 'Gallery' }] : [])
				];
			
			// Ensure we have at least a table view
			if (!views.some(v => v.type === 'table')) {
				views.unshift({ type: 'table', name: defaultViewName.trim() || 'Table' });
			} else {
				// Update the table view name
				const tableViewIndex = views.findIndex(v => v.type === 'table');
				if (tableViewIndex >= 0) {
					views[tableViewIndex].name = defaultViewName.trim() || 'Table';
				}
			}
			
			// Add gallery view if image property exists and not already present
			if (hasImageProp && !views.some(v => v.type === 'gallery')) {
				views.push({ type: 'gallery', name: 'Gallery' });
			}

			// Build payload with correct types using buildDatabaseUpdatePayload to preserve column order
			const updatePayload = buildDatabaseUpdatePayload(properties, views);
			updatePayload.name = databaseName.trim();
			
			// Only include description if it exists and is not empty
			if (databaseDescription.trim().length > 0) {
				updatePayload.description = databaseDescription.trim();
			}
			
			const response = await api.put(endpoints.databases.update(databaseId), updatePayload);

			toast.success('Database updated successfully');
			showEditDatabaseModal = false;
			await loadDatabase();
		} catch (error) {
			log.error('Update database error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to update database');
		} finally {
			editingDatabase = false;
		}
	}

	function handleViewChange(viewType: string) {
		// Only allow table and gallery views (unique to databases)
		if (viewType === 'table' || viewType === 'gallery') {
			currentView = viewType as 'table' | 'gallery';
			log.info('View changed', { viewType, currentView });
		} else {
			log.warn('Invalid view type attempted', { viewType });
		}
	}

	function handleSort(column: string) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	function hasImageProperty(): boolean {
		if (!database || !database.properties) return false;
		
		// Check if there's a property that could be used for gallery (url or text that might contain image URLs)
		return Object.values(database.properties).some((prop: any) => {
			return prop.type === 'url' || 
			       (prop.type === 'text' && (prop.name?.toLowerCase().includes('image') || 
			                                 prop.name?.toLowerCase().includes('photo') ||
			                                 prop.name?.toLowerCase().includes('cover')));
		});
	}

	function getAvailableViews() {
		// Always show table view
		const views = [
			{ type: 'table', name: 'Table' }
		];
		
		// Only show gallery if database has image-related properties
		// Gallery is useful for: products with images, portfolios, catalogs, visual collections
		// Not useful for: customer lists, sales data, text-only databases
		if (database && hasImageProperty()) {
			views.push({ type: 'gallery', name: 'Gallery' });
		}
		
		// If database has custom views, merge them
		if (database && database.views && database.views.length > 0) {
			const allowedViews = ['table', 'gallery'];
			// Filter out internal metadata views like _columnOrder
			const customViews = database.views
				.filter((v: any) => v.type && !v.type.startsWith('_') && allowedViews.includes(v.type))
				.map((v: any) => ({
					type: v.type || 'table',
					name: v.name || (v.type === 'gallery' ? 'Gallery' : 'Table')
				}));
			
			// Merge with defaults
			const viewMap = new Map();
			views.forEach(view => viewMap.set(view.type, view));
			customViews.forEach(view => viewMap.set(view.type, view));
			
			// Only include gallery if image property exists
			const result = Array.from(viewMap.values());
			if (!hasImageProperty()) {
				return result.filter(v => v.type !== 'gallery');
			}
			return result;
		}
		
		return views;
	}


	function getGalleryCoverPropertyKey() {
		if (!database || !database.views || !database.properties) return '';
		const galleryView = database.views.find((v: any) => v.type === 'gallery');
		if (!galleryView || !galleryView.coverProperty) return '';
		
		// Find the property key by name
		const propertyKey = Object.keys(database.properties).find(
			key => database.properties[key].name === galleryView.coverProperty
		);
		
		return propertyKey || '';
	}

	// Helper function to build update payload with correct types for Zod validation
	function buildDatabaseUpdatePayload(properties: Record<string, any>, views: any[]): any {
		const payload: any = {
			properties,
			views: Array.isArray(views) ? views.filter((v: any) => v.type !== '_columnOrder') : []
		};
		
		// Always store column order in views metadata to preserve order across database saves
		// This ensures PostgreSQL JSONB preserves the order even if it doesn't naturally
		if (properties && Object.keys(properties).length > 0) {
			const columnOrder = Object.keys(properties);
			payload.views.push({
				type: '_columnOrder',
				order: columnOrder
			});
		}
		
		// Only include name if it exists and is not empty (Zod requires min(1))
		if (database?.name && database.name.trim().length > 0) {
			payload.name = database.name;
		}
		
		// Only include description if it exists (Zod expects string | undefined, not null)
		if (database?.description !== undefined && database.description !== null && database.description.trim().length > 0) {
			payload.description = database.description;
		}
		
		return payload;
	}

	function startEditColumn(key: string) {
		if (!database || !database.properties || !database.properties[key]) return;
		const property = database.properties[key];
		editingColumnKey = key;
		editingColumnName = property.name || key;
		editingColumnType = property.type || 'text';
		editingColumnOptions = property.options || [];
		showColumnMenu = null;
	}

	function startEditColumnName(key: string) {
		if (!database || !database.properties || !database.properties[key]) return;
		const property = database.properties[key];
		editingColumnNameOnly = key;
		editingColumnNameValue = property.name || key;
	}

	function cancelEditColumnName() {
		editingColumnNameOnly = null;
		editingColumnNameValue = '';
	}

	async function saveColumnName() {
		if (!databaseId || !database || !editingColumnNameOnly) return;
		
		const key = editingColumnNameOnly;
		const originalProperty = database.properties[key];
		if (!originalProperty) return;

		// Validate
		if (!editingColumnNameValue.trim()) {
			toast.error('Column name is required');
			return;
		}

		// Check for duplicate names (excluding current column)
		const duplicateKey = Object.entries(database.properties).find(
			([k, prop]: [string, any]) => 
				k !== key && 
				(prop.name || k).toLowerCase() === editingColumnNameValue.trim().toLowerCase()
		);
		if (duplicateKey) {
			toast.error('Column name must be unique');
			return;
		}

		// If name hasn't changed, just cancel
		if (editingColumnNameValue.trim() === (originalProperty.name || key)) {
			cancelEditColumnName();
			return;
		}

		try {
			const newProperties = { ...database.properties };
			
			// If name changed, we need to update the key
			const newKey = editingColumnNameValue.trim().toLowerCase() === key.toLowerCase() 
				? key 
				: editingColumnNameValue.trim();
			
			// Remove old property if key changed
			if (newKey !== key) {
				delete newProperties[key];
			}
			
			// Update property with new name
			newProperties[newKey] = {
				...originalProperty,
				name: editingColumnNameValue.trim()
			};

			// Ensure views is always an array
			const views = Array.isArray(database.views) ? database.views : [];

			await api.put(endpoints.databases.update(databaseId), buildDatabaseUpdatePayload(newProperties, views));

			toast.success('Column name updated');
			cancelEditColumnName();
			await loadDatabase();
		} catch (error) {
			log.error('Update column name error', error instanceof Error ? error : new Error(String(error)), { databaseId });
			toast.error('Failed to update column name');
		}
	}

	function cancelEditColumn() {
		editingColumnKey = null;
		editingColumnName = '';
		editingColumnType = 'text';
		editingColumnOptions = [];
		newOptionInput = '';
	}

	async function saveColumnEdit() {
		if (!databaseId || !database || !editingColumnKey) return;
		
		const originalProperty = database.properties[editingColumnKey];
		if (!originalProperty) return;

		// Validate
		if (!editingColumnName.trim()) {
			toast.error('Column name is required');
			return;
		}

		// Check for duplicate names (excluding current column)
		const duplicateKey = Object.entries(database.properties).find(
			([k, prop]: [string, any]) => 
				k !== editingColumnKey && 
				(prop.name || k).toLowerCase() === editingColumnName.trim().toLowerCase()
		);
		if (duplicateKey) {
			toast.error('Column name must be unique');
			return;
		}

		// Check if this is the last title column and we're changing it
		if (originalProperty.type === 'title' && editingColumnType !== 'title') {
			const otherTitleColumns = Object.values(database.properties).filter(
				(prop: any) => prop.type === 'title' && prop.name !== originalProperty.name
			);
			if (otherTitleColumns.length === 0) {
				toast.error('At least one column must be of type "Title"');
				return;
			}
		}

		try {
			const newProperties = { ...database.properties };
			
			// If name changed, we need to update the key
			const newKey = editingColumnName.trim().toLowerCase() === editingColumnKey.toLowerCase() 
				? editingColumnKey 
				: editingColumnName.trim();
			
			// Remove old property if key changed
			if (newKey !== editingColumnKey) {
				delete newProperties[editingColumnKey];
			}
			
			// Add/update property
			newProperties[newKey] = {
				type: editingColumnType,
				name: editingColumnName.trim(),
				...(editingColumnOptions.length > 0 && (editingColumnType === 'select' || editingColumnType === 'multi-select') 
					? { options: editingColumnOptions } 
					: {})
			};

			// Check for gallery view
			const hasImageProp = Object.values(newProperties).some((prop: any) => {
				return prop.type === 'url' || 
				       (prop.type === 'text' && (prop.name?.toLowerCase().includes('image') || 
				                                 prop.name?.toLowerCase().includes('photo') ||
				                                 prop.name?.toLowerCase().includes('cover')));
			});

			const views: Array<{ type: string; name: string }> = [
				{ type: 'table', name: 'Table' }
			];
			
			if (hasImageProp) {
				views.push({ type: 'gallery', name: 'Gallery' });
			}

			await api.put(endpoints.databases.update(databaseId), buildDatabaseUpdatePayload(newProperties, views));

			toast.success('Column updated successfully');
			cancelEditColumn();
			await loadDatabase();
		} catch (error: any) {
			// Extract error details from ApiError
			let errorMessage = 'Failed to update column';
			if (error && typeof error === 'object' && error.data) {
				if (typeof error.data === 'object' && 'error' in error.data) {
					errorMessage = String(error.data.error) || errorMessage;
				} else if (typeof error.data === 'string') {
					errorMessage = error.data;
				}
			}
			log.error('Update column error', error instanceof Error ? error : new Error(String(error)), { 
				databaseId,
				errorMessage,
				errorDetails: error?.data ? JSON.stringify(error.data) : 'No details'
			});
			toast.error(errorMessage);
		}
	}

	function openDeleteColumnModal(key: string) {
		if (!database || !database.properties) return;
		const property = database.properties[key];
		if (!property) return;
		columnToDelete = { key, name: property.name || key };
		showDeleteColumnModal = true;
	}

	async function deleteColumnInline() {
		if (!databaseId || !database || !database.properties || !columnToDelete) return;
		
		const key = columnToDelete.key;
		const property = database.properties[key];
		if (!property) return;

		// Check if it's the last column
		if (Object.keys(database.properties).length <= 1) {
			toast.error('At least one column is required');
			showDeleteColumnModal = false;
			columnToDelete = null;
			return;
		}

		// Check if it's the last title column
		if (property.type === 'title') {
			const otherTitleColumns = Object.values(database.properties).filter(
				(prop: any) => prop.type === 'title' && prop.name !== property.name
			);
			if (otherTitleColumns.length === 0) {
				toast.error('At least one column must be of type "Title"');
				showDeleteColumnModal = false;
				columnToDelete = null;
				return;
			}
		}

		try {
			const newProperties = { ...database.properties };
			delete newProperties[key];

			// Check for gallery view
			const hasImageProp = Object.values(newProperties).some((prop: any) => {
				return prop.type === 'url' || 
				       (prop.type === 'text' && (prop.name?.toLowerCase().includes('image') || 
				                                 prop.name?.toLowerCase().includes('photo') ||
				                                 prop.name?.toLowerCase().includes('cover')));
			});

			const views: Array<{ type: string; name: string }> = [
				{ type: 'table', name: 'Table' }
			];
			
			if (hasImageProp) {
				views.push({ type: 'gallery', name: 'Gallery' });
			}

			await api.put(endpoints.databases.update(databaseId), buildDatabaseUpdatePayload(newProperties, views));

			toast.success('Column deleted successfully');
			showColumnMenu = null;
			showDeleteColumnModal = false;
			columnToDelete = null;
			await loadDatabase();
		} catch (error: any) {
			// Extract error details from ApiError
			let errorMessage = 'Failed to delete column';
			if (error && typeof error === 'object' && error.data) {
				if (typeof error.data === 'object' && 'error' in error.data) {
					errorMessage = String(error.data.error) || errorMessage;
				} else if (typeof error.data === 'string') {
					errorMessage = error.data;
				}
			}
			log.error('Delete column error', error instanceof Error ? error : new Error(String(error)), { 
				databaseId,
				errorMessage,
				errorDetails: error?.data ? JSON.stringify(error.data) : 'No details'
			});
			toast.error(errorMessage);
		}
	}

	async function addColumnInline(afterKey?: string) {
		if (!databaseId || !database) return;

		const newColumnName = 'New Column';
		let counter = 1;
		let finalName = newColumnName;
		
		// Find unique name
		while (Object.values(database.properties || {}).some((prop: any) => 
			(prop.name || '').toLowerCase() === finalName.toLowerCase()
		)) {
			finalName = `${newColumnName} ${counter}`;
			counter++;
		}

		try {
			let newProperties: Record<string, any>;
			
			if (afterKey && database.properties[afterKey]) {
				// Insert after the specified column
				const entries = Object.entries(database.properties);
				const afterIndex = entries.findIndex(([k]) => k === afterKey);
				const newEntries = [
					...entries.slice(0, afterIndex + 1),
					[finalName, { type: 'text', name: finalName }],
					...entries.slice(afterIndex + 1)
				];
				newProperties = Object.fromEntries(newEntries);
			} else {
				// Add at the end
				newProperties = {
					...database.properties,
					[finalName]: {
						type: 'text',
						name: finalName
					}
				};
			}

			// Ensure views is always an array
			const views = Array.isArray(database.views) ? database.views : [];

			log.info('Adding column', { databaseId, newColumnName: finalName });

			await api.put(endpoints.databases.update(databaseId), buildDatabaseUpdatePayload(newProperties, views));

			toast.success('Column added successfully');
			await loadDatabase();
			
			// Start editing the new column
			setTimeout(() => {
				startEditColumn(finalName);
			}, 100);
		} catch (error: any) {
			// Extract error details from ApiError
			let errorMessage = 'Failed to add column';
			let errorDetails: any = null;
			
			if (error && typeof error === 'object') {
				// ApiError has a data property with the API response
				if (error.data) {
					errorDetails = error.data;
					if (typeof error.data === 'object' && 'error' in error.data) {
						errorMessage = String(error.data.error) || errorMessage;
					} else if (typeof error.data === 'string') {
						errorMessage = error.data;
					}
				} else if (error.message) {
					errorMessage = error.message;
				}
			}
			
			log.error('Add column error', error instanceof Error ? error : new Error(String(error)), { 
				databaseId,
				errorMessage,
				errorDetails: errorDetails ? JSON.stringify(errorDetails) : 'No details',
				updatePayload
			});
			
			toast.error(errorMessage);
		}
	}

	async function moveColumn(fromKey: string, toKey: string) {
		if (!databaseId || !database || !database.properties || fromKey === toKey) return;

		try {
			const entries = Object.entries(database.properties);
			const fromIndex = entries.findIndex(([k]) => k === fromKey);
			const toIndex = entries.findIndex(([k]) => k === toKey);
			
			if (fromIndex === -1 || toIndex === -1) {
				log.warn('Column not found for move', { fromKey, toKey, availableKeys: entries.map(([k]) => k) });
				return;
			}

			// Create a new array with the reordered entries
			const newEntries = [...entries];
			
			// Remove from original position
			const [movedEntry] = newEntries.splice(fromIndex, 1);
			
			// Adjust target index if moving from before to after
			const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
			
			// Insert at new position
			newEntries.splice(adjustedToIndex, 0, movedEntry);

			// Convert back to object - Object.fromEntries preserves insertion order in modern JavaScript
			const newProperties = Object.fromEntries(newEntries);

			log.info('Moving column', { 
				fromKey, 
				toKey, 
				fromIndex, 
				toIndex, 
				adjustedToIndex,
				newOrder: newEntries.map(([k]) => k)
			});

			// Ensure views is always an array (buildDatabaseUpdatePayload will add column order automatically)
			const views = Array.isArray(database.views) ? database.views : [];

			await api.put(endpoints.databases.update(databaseId), buildDatabaseUpdatePayload(newProperties, views));

			toast.success('Column moved successfully');
			await loadDatabase();
		} catch (error: any) {
			// Extract error details from ApiError
			let errorMessage = 'Failed to move column';
			if (error && typeof error === 'object' && error.data) {
				if (typeof error.data === 'object' && 'error' in error.data) {
					errorMessage = String(error.data.error) || errorMessage;
				} else if (typeof error.data === 'string') {
					errorMessage = error.data;
				}
			}
			log.error('Move column error', error instanceof Error ? error : new Error(String(error)), { 
				databaseId,
				fromKey,
				toKey,
				errorMessage,
				errorDetails: error?.data ? JSON.stringify(error.data) : 'No details'
			});
			toast.error(errorMessage);
		}
	}

	function handleDragStart(key: string, e: DragEvent) {
		if (!e.dataTransfer) return;
		draggedColumnKey = key;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', key);
	}

	function handleDragOver(key: string, e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (draggedColumnKey && draggedColumnKey !== key) {
			draggedOverColumnKey = key;
		} else {
			draggedOverColumnKey = null;
		}
	}

	function handleDragLeave(e: DragEvent) {
		// Only clear if we're actually leaving the element (not just moving to a child)
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;
		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
			draggedOverColumnKey = null;
		}
	}

	function handleDrop(key: string, e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (draggedColumnKey && draggedColumnKey !== key) {
			moveColumn(draggedColumnKey, key);
		}
		draggedColumnKey = null;
		draggedOverColumnKey = null;
	}

	function handleDragEnd() {
		draggedColumnKey = null;
		draggedOverColumnKey = null;
	}

	function addOptionToEditingColumn() {
		if (!newOptionInput.trim()) return;
		if (editingColumnOptions.includes(newOptionInput.trim())) {
			toast.error('Option already exists');
			return;
		}
		editingColumnOptions = [...editingColumnOptions, newOptionInput.trim()];
		newOptionInput = '';
	}

	function removeOptionFromEditingColumn(option: string) {
		editingColumnOptions = editingColumnOptions.filter(opt => opt !== option);
	}

	function handleTableClick(e: MouseEvent) {
		// Close column menu when clicking outside
		const target = e.target as HTMLElement;
		if (!target.closest('.column-menu-container')) {
			showColumnMenu = null;
		}
	}

	function toggleColumnMenu(key: string, e: MouseEvent) {
		e.stopPropagation();
		showColumnMenu = showColumnMenu === key ? null : key;
	}

</script>

<svelte:head>
	<title>{database?.name || 'Database'} - Kollab</title>
</svelte:head>

<div class="container mx-auto max-w-7xl p-6">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="icon" on:click={() => goto('/workspace/databases')}>
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div>
				<h1 class="text-3xl font-bold">{database?.name || 'Loading...'}</h1>
				{#if database?.description}
					<p class="text-muted-foreground mt-1">{database.description}</p>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" on:click={() => showEditDatabaseModal = true}>
				<Edit class="h-4 w-4 mr-2" />
				Edit Database
			</Button>
			<Button variant="outline" on:click={exportToCSV} disabled={!database || filteredEntries.length === 0}>
				<Download class="h-4 w-4 mr-2" />
				Export CSV
			</Button>
			<Button on:click={openCreateModal}>
				<Plus class="h-4 w-4 mr-2" />
				New Entry
			</Button>
		</div>
	</div>

	<!-- Toolbar: Search, Filters, and View Selector -->
	{#if database}
		<div class="mb-4 space-y-3">
			<div class="flex items-center justify-between gap-4">
				<div class="relative max-w-md flex-1">
					<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Search entries..."
						bind:value={searchQuery}
						class="pl-9"
					/>
				</div>
				<div class="flex items-center gap-2">
					<Button
						variant={showFilters ? 'secondary' : 'outline'}
						size="sm"
						on:click={() => showFilters = !showFilters}
					>
						<Filter class="h-4 w-4 mr-1" />
						Filters
						{#if filters.length > 0}
							<span class="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
								{filters.length}
							</span>
						{/if}
					</Button>
					{#if getAvailableViews().length > 0}
						<DatabaseViewSelector
							currentView={currentView}
							availableViews={getAvailableViews()}
							onViewChange={handleViewChange}
						/>
					{/if}
				</div>
			</div>
			
			{#if showFilters}
				<div class="border rounded-lg p-4 bg-card">
					<FilterPanel
						properties={database.properties || {}}
						filters={filters}
						onFiltersChange={(newFilters) => filters = newFilters}
					/>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Bulk Actions Bar -->
	{#if showBulkActions && database}
		<div class="mb-4 flex items-center justify-between rounded-lg border bg-primary/10 p-3">
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium">
					{selectedEntries.size} entr{selectedEntries.size > 1 ? 'ies' : 'y'} selected
				</span>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="outline" size="sm" on:click={bulkExportSelected}>
					<Download class="h-4 w-4 mr-2" />
					Export Selected
				</Button>
				<Button variant="destructive" size="sm" on:click={openBulkDeleteModal}>
					<Trash2 class="h-4 w-4 mr-2" />
					Delete Selected
				</Button>
				<Button 
					variant="ghost" 
					size="sm" 
					on:click={(e) => { e.stopPropagation(); clearSelection(); }}
					title="Close selection"
				>
					<X class="h-4 w-4" />
				</Button>
			</div>
		</div>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="text-muted-foreground">Loading database...</div>
		</div>
	{:else if !database}
		<div class="flex items-center justify-center py-12">
			<div class="text-center">
				<Database class="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
				<h3 class="mb-2 text-xl font-semibold">Database not found</h3>
				<p class="text-sm text-muted-foreground mb-4">The database you're looking for doesn't exist or you don't have access to it.</p>
				<Button on:click={() => goto('/workspace/databases')}>
					<ArrowLeft class="h-4 w-4 mr-2" />
					Back to Databases
				</Button>
			</div>
		</div>
	{:else}
		<!-- Database Views -->
		{#if currentView === 'gallery'}
			<GalleryView
				entries={filteredEntries}
				properties={database.properties || {}}
				coverPropertyKey={getGalleryCoverPropertyKey()}
				cardSize="medium"
				onEntryClick={(entry) => openEditModal(entry)}
				onEntryEdit={(entry) => openEditModal(entry)}
				onEntryDelete={(entry) => openDeleteModal(entry)}
				onEntryDuplicate={(entry) => duplicateEntry(entry)}
			/>
		{:else if currentView === 'table'}
			<!-- Database Table -->
			<div class="rounded-lg border bg-card">
				<div class="overflow-x-auto">
					<table class="min-w-full table-auto" style="table-layout: auto;" on:click={handleTableClick}>
						<thead>
							<tr class="border-b">
								<!-- Select All Checkbox -->
								<th class="px-4 py-3 w-12">
									<button
										type="button"
										class="flex items-center justify-center"
										on:click={(e) => { e.stopPropagation(); toggleSelectAll(); }}
										title={isAllSelected() ? 'Deselect all' : 'Select all'}
									>
										{#if isAllSelected()}
											<CheckSquare class="h-4 w-4 text-primary" />
										{:else if isSomeSelected()}
											<CheckSquare class="h-4 w-4 text-primary opacity-50" />
										{:else}
											<Square class="h-4 w-4 text-muted-foreground" />
										{/if}
									</button>
								</th>
								{#if database.properties}
									{#each getVisibleColumns() as [key, property], index}
										{@const isLastColumn = index === getVisibleColumns().length - 1}
										<th 
											class="px-4 py-3 text-left text-sm font-semibold relative group {draggedOverColumnKey === key ? 'bg-accent border-l-2 border-l-primary' : ''} {draggedColumnKey === key ? 'opacity-50' : ''} {editingColumnKey !== key && editingColumnNameOnly !== key ? 'cursor-move' : ''} {isLastColumn ? 'pr-24' : ''} {isLastColumn ? 'z-30' : ''}"
											style="min-width: {getColumnWidth(key)}; width: {getColumnWidth(key)}; overflow: visible;"
											draggable={editingColumnKey !== key && editingColumnNameOnly !== key}
											on:dragstart={(e) => handleDragStart(key, e)}
											on:dragover={(e) => handleDragOver(key, e)}
											on:dragleave={(e) => handleDragLeave(e)}
											on:drop={(e) => handleDrop(key, e)}
											on:dragend={handleDragEnd}
											title={editingColumnKey !== key && editingColumnNameOnly !== key ? 'Drag to reorder column' : ''}
										>
											<!-- Resize handle -->
											{#if editingColumnKey !== key && editingColumnNameOnly !== key}
												<div
													class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors {resizingColumn === key ? 'bg-primary' : ''}"
													on:mousedown={(e) => startResizeColumn(key, e)}
													title="Drag to resize column"
												></div>
											{/if}
											<!-- Drag handle - positioned absolutely (visual indicator only) -->
											{#if editingColumnKey !== key && editingColumnNameOnly !== key}
												<div
													class="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
													title="Drag column header to reorder"
												>
													<GripVertical class="h-3 w-3 text-muted-foreground" />
												</div>
											{/if}
											<!-- Add column button - positioned absolutely -->
											{#if editingColumnKey !== key && editingColumnNameOnly !== key}
												<button
													class="absolute left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-accent rounded z-10 pointer-events-auto"
													title="Add column after this one"
													on:click={(e) => { e.stopPropagation(); addColumnInline(key); }}
												>
													<Plus class="h-3 w-3 text-muted-foreground" />
												</button>
											{/if}
											<div class="flex items-center gap-1 pl-0 {editingColumnKey === key ? 'w-full' : ''}">
												{#if editingColumnKey === key}
													<!-- Inline Edit Mode -->
													<div class="flex-1 space-y-2 w-full min-w-0" style="overflow: visible;">
														<Input
															bind:value={editingColumnName}
															placeholder="Column name"
															class="text-sm w-full"
															style="background-color: var(--background); color: var(--foreground);"
															on:keydown={(e) => {
																if (e.key === 'Enter') {
																	saveColumnEdit();
																} else if (e.key === 'Escape') {
																	cancelEditColumn();
																}
															}}
															autofocus
														/>
														<select
															bind:value={editingColumnType}
															class="w-full text-sm rounded-md border border-input bg-background px-2 py-1"
														>
															<option value="title">Title</option>
															<option value="text">Text</option>
															<option value="number">Number</option>
															<option value="email">Email</option>
															<option value="url">URL</option>
															<option value="date">Date</option>
															<option value="checkbox">Checkbox</option>
															<option value="select">Select</option>
															<option value="multi-select">Multi-select</option>
														</select>
														{#if editingColumnType === 'select' || editingColumnType === 'multi-select'}
															<div class="space-y-1">
																<div class="flex gap-1">
																	<Input
																		bind:value={newOptionInput}
																		placeholder="Add option..."
																		class="text-xs flex-1"
																		on:keydown={(e) => {
																			if (e.key === 'Enter') {
																				e.preventDefault();
																				addOptionToEditingColumn();
																			}
																		}}
																	/>
																	<Button size="sm" variant="outline" on:click={addOptionToEditingColumn}>
																		<Plus class="h-3 w-3" />
																	</Button>
																</div>
																{#if editingColumnOptions.length > 0}
																	<div class="flex flex-wrap gap-1">
																		{#each editingColumnOptions as option}
																			<div class="flex items-center gap-1 px-1.5 py-0.5 bg-accent rounded text-xs">
																				<span>{option}</span>
																				<button
																					type="button"
																					on:click={() => removeOptionFromEditingColumn(option)}
																					class="hover:text-destructive"
																				>
																					<X class="h-2.5 w-2.5" />
																				</button>
																			</div>
																		{/each}
																	</div>
																{/if}
															</div>
														{/if}
														<div class="flex gap-1">
															<Button size="sm" variant="default" on:click={saveColumnEdit}>
																Save
															</Button>
															<Button size="sm" variant="outline" on:click={cancelEditColumn}>
																Cancel
															</Button>
														</div>
													</div>
												{:else}
													<!-- Display Mode -->
													<div class="flex items-center gap-2" style="width: 100%;">
														{#if editingColumnNameOnly === key}
															<!-- Quick name edit mode -->
															<Input
																bind:value={editingColumnNameValue}
																class="text-sm flex-1 min-w-0"
																on:keydown={(e) => {
																	if (e.key === 'Enter') {
																		saveColumnName();
																	} else if (e.key === 'Escape') {
																		cancelEditColumnName();
																	}
																}}
																on:blur={saveColumnName}
																autofocus
															/>
														{:else}
															<span
																class="cursor-pointer hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-accent"
																style="white-space: nowrap;"
																on:click={() => startEditColumnName(key)}
																role="button"
																tabindex="0"
																on:keydown={(e) => {
																	if (e.key === 'Enter' || e.key === ' ') {
																		e.preventDefault();
																		startEditColumnName(key);
																	}
																}}
																title={property.name || key}
															>
																{property.name || key}
															</span>
														{/if}
														<div class="flex items-center gap-1 flex-shrink-0 {isLastColumn ? 'z-30 relative' : ''}" style="flex-shrink: 0; margin-left: auto;">
															<button
																class="flex items-center gap-1 hover:text-foreground transition-colors flex-shrink-0"
																on:click={() => handleSort(key)}
																title="Sort by this column"
															>
																<ArrowUpDown class="h-3 w-3 {sortColumn === key ? 'text-primary' : 'text-muted-foreground'}" />
																{#if sortColumn === key}
																	<span class="text-xs text-muted-foreground">
																		{sortDirection === 'asc' ? '↑' : '↓'}
																	</span>
																{/if}
															</button>
															<!-- Delete button -->
															<button
																class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-destructive/10 hover:text-destructive rounded relative {isLastColumn ? 'z-30' : 'z-20'} flex-shrink-0"
																title="Delete column"
																on:click={(e) => { e.stopPropagation(); openDeleteColumnModal(key); }}
															>
																<X class="h-3 w-3" />
															</button>
															<!-- Menu button for advanced options -->
															<div class="relative column-menu-container {isLastColumn ? 'z-30' : 'z-20'} flex-shrink-0">
																<Button
																	variant="ghost"
																	size="icon"
																	class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity relative {isLastColumn ? 'z-30' : 'z-20'}"
																	on:click={(e) => toggleColumnMenu(key, e)}
																	title="More options"
																>
																	<Edit class="h-3 w-3" />
																</Button>
																{#if showColumnMenu === key}
																	<div 
																		class="absolute right-0 top-8 {isLastColumn ? 'z-40' : 'z-50'} w-48 rounded-md border bg-popover p-1 shadow-md"
																		on:click={(e) => e.stopPropagation()}
																	>
																		<button
																			class="w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded-sm flex items-center gap-2"
																			on:click={() => { startEditColumn(key); showColumnMenu = null; }}
																		>
																			<Edit class="h-3 w-3" />
																			Edit Column Properties
																		</button>
																		<button
																			class="w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded-sm flex items-center gap-2"
																			on:click={() => { toggleColumnVisibility(key); showColumnMenu = null; }}
																		>
																			{#if isColumnHidden(key)}
																				<Eye class="h-3 w-3" />
																				Show Column
																			{:else}
																				<EyeOff class="h-3 w-3" />
																				Hide Column
																			{/if}
																		</button>
																	</div>
																{/if}
															</div>
														</div>
													</div>
												{/if}
											</div>
										</th>
									{/each}
								{/if}
								<th class="px-4 py-3 text-right text-sm font-semibold group relative z-0">
									<div class="flex items-center justify-end gap-2">
										<button
											type="button"
											class="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground"
											on:click={() => addColumnInline()}
											title="Add column at the end"
										>
											<Plus class="h-4 w-4" />
										</button>
										<span>Actions</span>
									</div>
								</th>
							</tr>
						</thead>
						<tbody>
							{#if filteredEntries.length === 0}
								<tr>
									<td colspan={getVisibleColumns().length + 2} class="px-4 py-12 text-center text-muted-foreground">
										{searchQuery ? 'No entries match your search.' : 'No entries yet. Create your first entry to get started.'}
									</td>
								</tr>
							{:else}
								{#each filteredEntries as entry}
									{@const isSelected = selectedEntriesVersion >= 0 && selectedEntries.has(entry.id)}
									<tr class="border-b hover:bg-accent/50 transition-colors {isSelected ? 'bg-accent' : ''}">
										<!-- Selection Checkbox -->
										<td class="px-4 py-3 w-12">
											<button
												type="button"
												class="flex items-center justify-center"
												on:click={(e) => { e.stopPropagation(); toggleEntrySelection(entry.id); }}
												title={isSelected ? 'Deselect' : 'Select'}
											>
												{#if isSelected}
													<CheckSquare class="h-4 w-4 text-primary" />
												{:else}
													<Square class="h-4 w-4 text-muted-foreground" />
												{/if}
											</button>
										</td>
										{#if database.properties}
											{#each getVisibleColumns() as [key, property]}
												<td 
													class="px-4 py-3 text-sm {isEditingCell(entry.id, key) ? 'p-0' : 'cursor-pointer hover:bg-accent/70'}"
													style="min-width: {getColumnWidth(key)}; width: {getColumnWidth(key)}; overflow: hidden;"
													on:dblclick={() => startEditCell(entry.id, key, getPropertyValue(entry, key), property.type)}
													title={isEditingCell(entry.id, key) ? '' : 'Double-click to edit'}
												>
													{#if isEditingCell(entry.id, key)}
														<!-- Inline Edit Mode -->
														<div class="p-2">
															{#if property.type === 'checkbox'}
																<div class="flex items-center space-x-2">
																	<input
																		type="checkbox"
																		bind:checked={editingCellValue}
																		disabled={savingCell}
																		class="h-4 w-4 rounded border-gray-300"
																		on:change={() => saveEditCell()}
																		autofocus
																	/>
																	<span class="text-sm">{property.name || key}</span>
																</div>
															{:else if property.type === 'select'}
																<select
																	bind:value={editingCellValue}
																	disabled={savingCell}
																	class="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
																	on:change={() => saveEditCell()}
																	on:blur={saveEditCell}
																	on:keydown={(e) => {
																		if (e.key === 'Enter') {
																			e.preventDefault();
																			saveEditCell();
																		} else if (e.key === 'Escape') {
																			cancelEditCell();
																		}
																	}}
																	autofocus
																>
																	<option value="">Select...</option>
																	{#if property.options}
																		{#each property.options as option}
																			<option value={option}>{option}</option>
																		{/each}
																	{/if}
																</select>
															{:else if property.type === 'multi-select'}
																<MultiSelectInput
																	value={editingCellValue}
																	options={property.options || []}
																	onChange={(newValue) => {
																		editingCellValue = newValue;
																		saveEditCell();
																	}}
																	disabled={savingCell}
																	placeholder="Select options..."
																/>
															{:else if property.type === 'date'}
																<Input
																	type="date"
																	bind:value={editingCellValue}
																	disabled={savingCell}
																	class="text-sm"
																	on:blur={saveEditCell}
																	on:keydown={(e) => {
																		if (e.key === 'Enter') {
																			e.preventDefault();
																			saveEditCell();
																		} else if (e.key === 'Escape') {
																			cancelEditCell();
																		}
																	}}
																	autofocus
																/>
															{:else if property.type === 'number'}
																<Input
																	type="number"
																	bind:value={editingCellValue}
																	disabled={savingCell}
																	class="text-sm"
																	on:blur={saveEditCell}
																	on:keydown={(e) => {
																		if (e.key === 'Enter') {
																			e.preventDefault();
																			saveEditCell();
																		} else if (e.key === 'Escape') {
																			cancelEditCell();
																		}
																	}}
																	autofocus
																/>
															{:else}
																<Input
																	type={getInputType(property.type)}
																	bind:value={editingCellValue}
																	disabled={savingCell}
																	class="text-sm"
																	on:blur={saveEditCell}
																	on:keydown={(e) => {
																		if (e.key === 'Enter') {
																			e.preventDefault();
																			saveEditCell();
																		} else if (e.key === 'Escape') {
																			cancelEditCell();
																		}
																	}}
																	autofocus
																/>
															{/if}
														</div>
													{:else}
														<!-- Display Mode -->
														<div class="overflow-hidden text-ellipsis" style="max-width: 100%; word-wrap: break-word;">
															{formatPropertyValue(getPropertyValue(entry, key), property.type)}
														</div>
													{/if}
												</td>
											{/each}
										{/if}
										<td class="px-4 py-3 text-right">
											<div class="flex items-center justify-end gap-2">
												<Button variant="ghost" size="icon" on:click={() => duplicateEntry(entry)} title="Duplicate entry">
													<Copy class="h-4 w-4" />
												</Button>
												<Button variant="ghost" size="icon" on:click={() => openEditModal(entry)} title="Edit entry">
													<Edit class="h-4 w-4" />
												</Button>
												<Button variant="ghost" size="icon" on:click={() => openDeleteModal(entry)} title="Delete entry">
													<Trash2 class="h-4 w-4" />
												</Button>
											</div>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- Create Entry Modal -->
<Dialog bind:open={showCreateModal} onOpenChange={(open) => { if (!open) resetCreateForm(); }}>
	<DialogContent class="max-w-2xl max-h-[90vh]">
		<DialogHeader>
			<DialogTitle>Create New Entry</DialogTitle>
			<DialogDescription>Add a new entry to this database</DialogDescription>
		</DialogHeader>

		<div class="space-y-4 py-4">
			{#if database && database.properties}
				{#each Object.entries(database.properties) as [key, property]}
					<div>
						<Label for="entry-{key}">
							{property.name || key} {property.type === 'title' ? '*' : ''}
						</Label>
						{#if property.type === 'checkbox'}
							<div class="mt-2 flex items-center space-x-2">
								<input
									type="checkbox"
									id="entry-{key}"
									bind:checked={entryFormData[key]}
									disabled={creatingEntry}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<Label for="entry-{key}" class="text-sm font-normal cursor-pointer">
									{property.name || key}
								</Label>
							</div>
						{:else if property.type === 'select'}
							<select
								id="entry-{key}"
								bind:value={entryFormData[key]}
								disabled={creatingEntry}
								class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm {entryFormErrors[key] ? 'border-destructive' : ''}"
								on:blur={() => {
									entryFormErrors[key] = validateField(key, property, entryFormData[key]);
								}}
							>
								<option value="">Select {property.name || key}...</option>
								{#if property.options}
									{#each property.options as option}
										<option value={option}>{option}</option>
									{/each}
								{/if}
							</select>
						{:else if property.type === 'multi-select'}
							<MultiSelectInput
								id="entry-{key}"
								bind:value={entryFormData[key]}
								options={property.options || []}
								placeholder={`Select ${property.name || key}...`}
								disabled={creatingEntry}
								error={entryFormErrors[key] || ''}
							/>
						{:else if property.type === 'text' || property.type === 'textarea'}
							<Textarea
								id="entry-{key}"
								bind:value={entryFormData[key]}
								placeholder={`Enter ${property.name || key}`}
								disabled={creatingEntry}
								rows={property.type === 'textarea' ? 4 : 3}
								class={entryFormErrors[key] ? 'border-destructive' : ''}
								on:blur={() => {
									entryFormErrors[key] = validateField(key, property, entryFormData[key]);
								}}
							/>
						{:else}
							<Input
								id="entry-{key}"
								type={getInputType(property.type)}
								bind:value={entryFormData[key]}
								placeholder={`Enter ${property.name || key}`}
								disabled={creatingEntry}
								required={property.type === 'title'}
								class={entryFormErrors[key] ? 'border-destructive' : ''}
								on:blur={() => {
									entryFormErrors[key] = validateField(key, property, entryFormData[key]);
								}}
							/>
						{/if}
						{#if entryFormErrors[key]}
							<p class="mt-1 text-xs text-destructive">{entryFormErrors[key]}</p>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<DialogFooter>
			<DialogClose variant="outline">
				Cancel
			</DialogClose>
			<Button on:click={createEntry} disabled={creatingEntry}>
				<Plus class="mr-2 h-4 w-4" />
				Create Entry
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- Edit Entry Modal -->
<Dialog bind:open={showEditModal} onOpenChange={(open) => { if (!open) editingEntry = null; }}>
	<DialogContent class="max-w-2xl max-h-[90vh]">
		<DialogHeader>
			<DialogTitle>Edit Entry</DialogTitle>
			<DialogDescription>Update the entry information</DialogDescription>
		</DialogHeader>

		<div class="space-y-4 py-4">
			{#if database && database.properties && editingEntry}
				{#each Object.entries(database.properties) as [key, property]}
					<div>
						<Label for="edit-entry-{key}">
							{property.name || key} {property.type === 'title' ? '*' : ''}
						</Label>
						{#if property.type === 'checkbox'}
							<div class="mt-2 flex items-center space-x-2">
								<input
									type="checkbox"
									id="edit-entry-{key}"
									bind:checked={entryFormData[key]}
									disabled={updatingEntry}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<Label for="edit-entry-{key}" class="text-sm font-normal cursor-pointer">
									{property.name || key}
								</Label>
							</div>
						{:else if property.type === 'select'}
							<select
								id="edit-entry-{key}"
								bind:value={entryFormData[key]}
								disabled={updatingEntry}
								class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm {entryFormErrors[key] ? 'border-destructive' : ''}"
								on:blur={() => {
									entryFormErrors[key] = validateField(key, property, entryFormData[key]);
								}}
							>
								<option value="">Select {property.name || key}...</option>
								{#if property.options}
									{#each property.options as option}
										<option value={option}>{option}</option>
									{/each}
								{/if}
							</select>
						{:else if property.type === 'multi-select'}
							<MultiSelectInput
								id="edit-entry-{key}"
								bind:value={entryFormData[key]}
								options={property.options || []}
								placeholder={`Select ${property.name || key}...`}
								disabled={updatingEntry}
								error={entryFormErrors[key] || ''}
							/>
						{:else if property.type === 'text' || property.type === 'textarea'}
							<Textarea
								id="edit-entry-{key}"
								bind:value={entryFormData[key]}
								placeholder={`Enter ${property.name || key}`}
								disabled={updatingEntry}
								rows={property.type === 'textarea' ? 4 : 3}
								class={entryFormErrors[key] ? 'border-destructive' : ''}
								on:blur={() => {
									entryFormErrors[key] = validateField(key, property, entryFormData[key]);
								}}
							/>
						{:else}
							<Input
								id="edit-entry-{key}"
								type={getInputType(property.type)}
								bind:value={entryFormData[key]}
								placeholder={`Enter ${property.name || key}`}
								disabled={updatingEntry}
								class={entryFormErrors[key] ? 'border-destructive' : ''}
								on:blur={() => {
									entryFormErrors[key] = validateField(key, property, entryFormData[key]);
								}}
							/>
						{/if}
						{#if entryFormErrors[key]}
							<p class="mt-1 text-xs text-destructive">{entryFormErrors[key]}</p>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<DialogFooter>
			<DialogClose variant="outline">
				Cancel
			</DialogClose>
			<Button on:click={updateEntry} disabled={updatingEntry}>
				<Edit class="mr-2 h-4 w-4" />
				Update Entry
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- Delete Entry Modal -->
<Dialog bind:open={showDeleteModal} onOpenChange={(open) => { if (!open) entryToDelete = null; }}>
	<DialogContent class="max-w-md">
		<DialogHeader>
			<DialogTitle>Delete Entry</DialogTitle>
			<DialogDescription>
				Are you sure you want to delete this entry? This action cannot be undone.
			</DialogDescription>
		</DialogHeader>

		<DialogFooter>
			<DialogClose variant="outline">
				Cancel
			</DialogClose>
			<Button variant="destructive" on:click={deleteEntry}>
				<Trash2 class="mr-2 h-4 w-4" />
				Delete
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- Delete Column Modal -->
<Dialog bind:open={showDeleteColumnModal} onOpenChange={(open) => { if (!open) columnToDelete = null; }}>
	<DialogContent class="max-w-md">
		<DialogHeader>
			<DialogTitle>Delete Column</DialogTitle>
			<DialogDescription>
				Are you sure you want to delete the column "{columnToDelete?.name || ''}"? This will remove all data in this column. This action cannot be undone.
			</DialogDescription>
		</DialogHeader>

		<DialogFooter>
			<DialogClose variant="outline">
				Cancel
			</DialogClose>
			<Button variant="destructive" on:click={deleteColumnInline}>
				<Trash2 class="mr-2 h-4 w-4" />
				Delete Column
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- Bulk Delete Entries Modal -->
<Dialog bind:open={showBulkDeleteModal} onOpenChange={(open) => { if (!open) showBulkDeleteModal = false; }}>
	<DialogContent class="max-w-md">
		<DialogHeader>
			<DialogTitle>Delete Entries</DialogTitle>
			<DialogDescription>
				Are you sure you want to delete {selectedEntries.size} entr{selectedEntries.size > 1 ? 'ies' : 'y'}? This action cannot be undone.
			</DialogDescription>
		</DialogHeader>

		<DialogFooter>
			<DialogClose variant="outline">
				Cancel
			</DialogClose>
			<Button variant="destructive" on:click={bulkDeleteEntries}>
				<Trash2 class="mr-2 h-4 w-4" />
				Delete {selectedEntries.size} Entr{selectedEntries.size > 1 ? 'ies' : 'y'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- Edit Database Modal -->
<Dialog bind:open={showEditDatabaseModal} onOpenChange={(open) => { 
	if (open && database) {
		databaseName = database.name || '';
		databaseDescription = database.description || '';
		// Initialize columns - ensure database.properties exists
		if (database && database.properties && Object.keys(database.properties).length > 0) {
			initializeColumns();
		} else {
			log.warn('Database properties empty when opening edit modal', {
				hasDatabase: !!database,
				hasProperties: !!(database && database.properties),
				propertiesCount: database && database.properties ? Object.keys(database.properties).length : 0
			});
			databaseColumns = [];
		}
		// Initialize views
		if (database.views && Array.isArray(database.views)) {
			databaseViews = database.views
				.filter((v) => v && v.type && !v.type.startsWith('_'))
				.map((v) => ({
					type: v.type || 'table',
					name: v.name || (v.type === 'gallery' ? 'Gallery' : 'Table')
				}));
			// Set default view name from the first table view
			const tableView = databaseViews.find(v => v.type === 'table');
			defaultViewName = tableView?.name || 'Table';
		} else {
			databaseViews = [{ type: 'table', name: 'Table' }];
			defaultViewName = 'Table';
		}
	} else if (!open && database) {
		databaseName = database.name || '';
		databaseDescription = database.description || '';
		databaseColumns = [];
		databaseViews = [];
	}
}}>
	<DialogContent class="max-w-2xl max-h-[90vh]">
		<DialogHeader>
			<DialogTitle>Edit Database</DialogTitle>
			<DialogDescription>Update the database name, description, and columns</DialogDescription>
		</DialogHeader>

		<div class="space-y-4 py-4">
			<div>
				<Label for="edit-database-name">Name *</Label>
				<Input
					id="edit-database-name"
					bind:value={databaseName}
					placeholder="Enter database name"
					disabled={editingDatabase}
				/>
			</div>

			<div>
				<Label for="edit-database-description">Description</Label>
				<Textarea
					id="edit-database-description"
					bind:value={databaseDescription}
					placeholder="Enter database description (optional)"
					disabled={editingDatabase}
					rows={3}
				/>
			</div>

			<div>
				<Label for="edit-database-default-view-name">Default View Name</Label>
				<Input
					id="edit-database-default-view-name"
					bind:value={defaultViewName}
					placeholder="Table"
					disabled={editingDatabase}
				/>
				<p class="text-xs text-muted-foreground mt-1">Name of the default table view</p>
			</div>

			<div>
				<div class="flex items-center justify-between mb-2">
					<Label>Columns * ({databaseColumns.length} {databaseColumns.length === 1 ? 'column' : 'columns'})</Label>
					<Button
						type="button"
						variant="outline"
						size="sm"
						on:click={addColumn}
						disabled={editingDatabase}
					>
						<Plus class="h-4 w-4 mr-1" />
						Add Column
					</Button>
				</div>
				<div class="space-y-3 max-h-[400px] overflow-y-auto">
					{#each databaseColumns as column}
						<div class="p-3 border rounded-lg space-y-2 {column.isNew ? 'bg-accent/30' : ''}">
							{#if !column.isNew}
								<div class="text-xs text-muted-foreground mb-1">
									Existing column
								</div>
							{/if}
							<div class="flex items-center gap-2">
								<div class="flex-1">
									<Label for="edit-column-name-{column.id}">Column Name *</Label>
									<Input
										id="edit-column-name-{column.id}"
										value={column.name}
										on:input={(e) => updateColumn(column.id, 'name', e.currentTarget.value)}
										placeholder="Column name"
										disabled={editingDatabase}
									/>
								</div>
								<div class="flex-1">
									<Label for="edit-column-type-{column.id}">Type *</Label>
									<select
										id="edit-column-type-{column.id}"
										value={column.type}
										on:change={(e) => updateColumn(column.id, 'type', e.currentTarget.value)}
										disabled={editingDatabase}
										class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
									>
										<option value="title">Title</option>
										<option value="text">Text</option>
										<option value="number">Number</option>
										<option value="email">Email</option>
										<option value="url">URL</option>
										<option value="date">Date</option>
										<option value="checkbox">Checkbox</option>
										<option value="select">Select</option>
										<option value="multi-select">Multi-select</option>
									</select>
								</div>
								<div class="pt-6">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										on:click={() => removeColumn(column.id)}
										disabled={editingDatabase || databaseColumns.length <= 1}
									>
										<Trash2 class="h-4 w-4" />
									</Button>
								</div>
							</div>
							{#if column.type === 'select' || column.type === 'multi-select'}
								<div>
									<Label>Options</Label>
									<div class="flex gap-2 mt-1">
										<Input
											type="text"
											placeholder="Add option..."
											disabled={editingDatabase}
											on:keydown={(e) => {
												if (e.key === 'Enter') {
													e.preventDefault();
													addOptionToColumn(column.id, e.currentTarget.value);
													e.currentTarget.value = '';
												}
											}}
										/>
									</div>
									{#if column.options && column.options.length > 0}
										<div class="flex flex-wrap gap-2 mt-2">
											{#each column.options as option}
												<div class="flex items-center gap-1 px-2 py-1 bg-accent rounded text-sm">
													<span>{option}</span>
													<button
														type="button"
														on:click={() => removeOptionFromColumn(column.id, option)}
														disabled={editingDatabase}
														class="hover:text-destructive"
													>
														<X class="h-3 w-3" />
													</button>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>

		<DialogFooter>
			<DialogClose variant="outline" disabled={editingDatabase}>
				Cancel
			</DialogClose>
			<Button on:click={updateDatabase} disabled={editingDatabase || !databaseName.trim() || databaseColumns.filter(col => col.name.trim()).length === 0}>
				<Edit class="mr-2 h-4 w-4" />
				Update Database
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
