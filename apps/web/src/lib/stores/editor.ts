import { writable } from 'svelte/store';
import type { Editor } from '@tiptap/core';

interface EditorStore {
	editor: Editor | null;
	content: any;
	isCollaborating: boolean;
	collaborators: Array<{
		id: string;
		name: string;
		color: string;
		cursor?: { from: number; to: number };
	}>;
	isSaving: boolean;
	lastSaved: Date | null;
}

function createEditorStore() {
	const { subscribe, set, update } = writable<EditorStore>({
		editor: null,
		content: null,
		isCollaborating: false,
		collaborators: [],
		isSaving: false,
		lastSaved: null
	});

	return {
		subscribe,
		setEditor: (editor: Editor) => update(state => ({ ...state, editor })),
		setContent: (content: any) => update(state => ({ ...state, content })),
		setCollaborating: (isCollaborating: boolean) =>
			update(state => ({ ...state, isCollaborating })),
		setCollaborators: (collaborators: EditorStore['collaborators']) =>
			update(state => ({ ...state, collaborators })),
		setSaving: (isSaving: boolean) => update(state => ({ ...state, isSaving })),
		setLastSaved: (lastSaved: Date) => update(state => ({ ...state, lastSaved })),
		reset: () =>
			set({
				editor: null,
				content: null,
				isCollaborating: false,
				collaborators: [],
				isSaving: false,
				lastSaved: null
			})
	};
}

export const editorStore = createEditorStore();