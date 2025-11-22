import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { commandPaletteStore } from './commandPalette';

describe('Command Palette Store', () => {
	beforeEach(() => {
		// Reset store to initial state
		commandPaletteStore.close();
		commandPaletteStore.setLastCommand('');
	});

	it('should initialize with closed state', () => {
		const state = get(commandPaletteStore);
		expect(state.isOpen).toBe(false);
	});

	it('should open the command palette', () => {
		commandPaletteStore.open();
		const state = get(commandPaletteStore);
		expect(state.isOpen).toBe(true);
	});

	it('should close the command palette', () => {
		commandPaletteStore.open();
		commandPaletteStore.close();
		const state = get(commandPaletteStore);
		expect(state.isOpen).toBe(false);
	});

	it('should toggle the command palette', () => {
		let state = get(commandPaletteStore);
		const initialState = state.isOpen;
		
		commandPaletteStore.toggle();
		state = get(commandPaletteStore);
		expect(state.isOpen).toBe(!initialState);
		
		commandPaletteStore.toggle();
		state = get(commandPaletteStore);
		expect(state.isOpen).toBe(initialState);
	});

	it('should set last command', () => {
		commandPaletteStore.setLastCommand('search');
		const state = get(commandPaletteStore);
		expect(state.lastCommand).toBe('search');
	});

	it('should update last command without affecting open state', () => {
		commandPaletteStore.open();
		commandPaletteStore.setLastCommand('create-document');
		
		const state = get(commandPaletteStore);
		expect(state.isOpen).toBe(true);
		expect(state.lastCommand).toBe('create-document');
	});

	it('should maintain last command when opening/closing', () => {
		commandPaletteStore.setLastCommand('delete');
		commandPaletteStore.open();
		commandPaletteStore.close();
		
		const state = get(commandPaletteStore);
		expect(state.lastCommand).toBe('delete');
	});

	it('should handle multiple command updates', () => {
		commandPaletteStore.setLastCommand('first');
		commandPaletteStore.setLastCommand('second');
		commandPaletteStore.setLastCommand('third');
		
		const state = get(commandPaletteStore);
		expect(state.lastCommand).toBe('third');
	});
});

