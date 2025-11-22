import {
	Folder,
	FolderKanban,
	Briefcase,
	Target,
	Rocket,
	Zap,
	Heart,
	Star,
	Coffee,
	Code,
	Database,
	Settings,
	Users,
	LayoutList,
	LayoutGrid,
	Calendar,
	Table,
	TimerIcon
} from 'lucide-svelte';
import type { ComponentType } from 'svelte';
import type { Project } from '$lib/services/project-service';

export const iconMap: Record<string, ComponentType> = {
	Folder,
	FolderKanban,
	Briefcase,
	Target,
	Rocket,
	Zap,
	Heart,
	Star,
	Coffee,
	Code,
	Database,
	Settings,
	Users
};

export const viewTypeMap: Record<Project['viewType'], ComponentType> = {
	list: LayoutList,
	board: LayoutGrid,
	calendar: Calendar,
	table: Table,
	timeline: TimerIcon
};

export function getIconComponent(iconName: string): ComponentType {
	return iconMap[iconName] || Folder;
}

export function getViewIcon(viewType: Project['viewType']): ComponentType {
	return viewTypeMap[viewType] || LayoutList;
}

export const iconOptions = [
	{ name: 'Folder', component: Folder },
	{ name: 'FolderKanban', component: FolderKanban },
	{ name: 'Briefcase', component: Briefcase },
	{ name: 'Target', component: Target },
	{ name: 'Rocket', component: Rocket },
	{ name: 'Zap', component: Zap },
	{ name: 'Heart', component: Heart },
	{ name: 'Star', component: Star },
	{ name: 'Coffee', component: Coffee },
	{ name: 'Code', component: Code },
	{ name: 'Database', component: Database },
	{ name: 'Settings', component: Settings },
	{ name: 'Users', component: Users }
];

export const viewTypes = [
	{ value: 'list' as const, label: 'List', icon: LayoutList },
	{ value: 'board' as const, label: 'Board', icon: LayoutGrid },
	{ value: 'calendar' as const, label: 'Calendar', icon: Calendar },
	{ value: 'table' as const, label: 'Table', icon: Table },
	{ value: 'timeline' as const, label: 'Timeline', icon: TimerIcon }
];

export const colorOptions = [
	'#3B82F6',
	'#10B981',
	'#F59E0B',
	'#EF4444',
	'#8B5CF6',
	'#EC4899',
	'#06B6D4',
	'#F97316'
];

