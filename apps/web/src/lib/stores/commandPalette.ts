import { writable } from 'svelte/store';
import type { SvelteComponent } from 'svelte';

export interface CommandDefinition {
	id: string;
	label: string;
	category: string;
	icon?: typeof SvelteComponent;
	keywords?: string[];
	shortcut?: string;
	isContextual?: boolean;
	action: () => void;
}

interface CommandPaletteStore {
	isOpen: boolean;
	lastCommand: string | null;
	contextCommands: CommandDefinition[];
}

function createCommandPaletteStore() {
	const { subscribe, update } = writable<CommandPaletteStore>({
		isOpen: false,
		lastCommand: null,
		contextCommands: []
	});

	return {
		subscribe,
		open: () => update(state => ({ ...state, isOpen: true })),
		close: () => update(state => ({ ...state, isOpen: false })),
		toggle: () => update(state => ({ ...state, isOpen: !state.isOpen })),
		setLastCommand: (command: string) => update(state => ({ ...state, lastCommand: command })),
		setContextCommands: (commands: CommandDefinition[]) => update(state => ({ ...state, contextCommands: commands })),
		clearContextCommands: () => update(state => ({ ...state, contextCommands: [] }))
	};
}

export const commandPaletteStore = createCommandPaletteStore();