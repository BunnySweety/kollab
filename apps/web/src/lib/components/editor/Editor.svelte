<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import TaskList from '@tiptap/extension-task-list';
	import TaskItem from '@tiptap/extension-task-item';
	import Table from '@tiptap/extension-table';
	import TableRow from '@tiptap/extension-table-row';
	import TableCell from '@tiptap/extension-table-cell';
	import TableHeader from '@tiptap/extension-table-header';
	import Image from '@tiptap/extension-image';
	import Link from '@tiptap/extension-link';
	import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
	import { common, createLowlight } from 'lowlight';
	import Collaboration from '@tiptap/extension-collaboration';
	import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
	import * as Y from 'yjs';
	import { WebsocketProvider } from 'y-websocket';
	import EditorToolbar from './EditorToolbar.svelte';
	import SlashCommands from './extensions/SlashCommands';
	import HeadingWithAnchors from './extensions/HeadingWithAnchors';
	import { editorStore } from '$lib/stores/editor';

	export let documentId: string;
	export let content: any = { type: 'doc', content: [] };
	export let editable = true;
	export let collaboration = false;
	export let onUpdate: ((content: any) => void) | undefined = undefined;
	export let placeholder = 'Start typing or press "/" for commands...';

	let element: HTMLElement;
	let editor: Editor;
	let ydoc: Y.Doc;
	let provider: WebsocketProvider;

	const lowlight = createLowlight(common);

	onMount(() => {
		// Setup collaboration if enabled
		if (collaboration && documentId) {
			ydoc = new Y.Doc();
			provider = new WebsocketProvider(
				'ws://localhost:3001', // WebSocket server URL
				`document-${documentId}`,
				ydoc
			);
		}

		// Create editor instance
		editor = new Editor({
			element: element,
			extensions: [
				StarterKit.configure({
					heading: {
						levels: [1, 2, 3],
						HTMLAttributes: {
							class: 'wiki-heading',
						}
					},
					codeBlock: false // We'll use CodeBlockLowlight instead
				}),
				Placeholder.configure({
					placeholder,
					emptyEditorClass: 'is-editor-empty'
				}),
				TaskList,
				TaskItem.configure({
					nested: true
				}),
				Table.configure({
					resizable: true,
					HTMLAttributes: {
						class: 'table-fixed border-collapse'
					}
				}),
				TableRow,
				TableCell,
				TableHeader,
				Image.configure({
					inline: true,
					allowBase64: true,
					HTMLAttributes: {
						class: 'rounded-lg max-w-full'
					}
				}),
				Link.configure({
					openOnClick: false,
					HTMLAttributes: {
						class: 'text-primary underline'
					}
				}),
				CodeBlockLowlight.configure({
					lowlight,
					HTMLAttributes: {
						class: 'rounded-lg bg-muted p-4 font-mono text-sm'
					}
				}),
				// Collaboration extensions
				...(collaboration && ydoc
					? [
							Collaboration.configure({
								document: ydoc
							}),
							CollaborationCursor.configure({
								provider: provider!,
								user: {
									name: 'User ' + Math.floor(Math.random() * 100),
									color: getRandomColor()
								}
							})
					  ]
					: []),
				// Custom slash commands
				SlashCommands,
				HeadingWithAnchors
			],
			content,
			editable,
			onUpdate: ({ editor: e }) => {
				const json = e.getJSON();
				editorStore.setContent(json);
				onUpdate?.(json);
			},
			editorProps: {
				attributes: {
					class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[500px] px-8 py-4'
				}
			}
		});

		// Store editor instance
		editorStore.setEditor(editor);
	});

	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
		if (provider) {
			provider.destroy();
		}
		if (ydoc) {
			ydoc.destroy();
		}
	});

	function getRandomColor() {
		const colors = [
			'#FF6B6B',
			'#4ECDC4',
			'#45B7D1',
			'#96CEB4',
			'#FFEAA7',
			'#DDA0DD',
			'#98D8C8',
			'#FFA07A'
		];
		return colors[Math.floor(Math.random() * colors.length)];
	}

	function handleKeyDown(e: KeyboardEvent) {
		// Handle special keyboard shortcuts
		if (e.ctrlKey || e.metaKey) {
			switch (e.key) {
				case 's':
					e.preventDefault();
					// Save document
					onUpdate?.(editor.getJSON());
					break;
				case 'b':
					e.preventDefault();
					editor.chain().focus().toggleBold().run();
					break;
				case 'i':
					e.preventDefault();
					editor.chain().focus().toggleItalic().run();
					break;
			}
		}
	}
</script>

<div class="editor-container flex h-full flex-col">
	{#if editor}
		<EditorToolbar {editor} />
	{/if}

	<div class="editor-wrapper flex-1 overflow-auto">
		<div
			bind:this={element}
			role="textbox"
			aria-multiline="true"
			aria-label="Rich text editor"
			tabindex="0"
			on:keydown={handleKeyDown}
			class="editor-content"
		/>
	</div>
</div>

<style>
	.editor-container {
		@apply bg-background;
	}

	.editor-wrapper {
		/* Scrollbar styling removed - not available in Tailwind without plugin */
	}

	:global(.ProseMirror) {
		@apply min-h-[500px];
	}

	:global(.ProseMirror p.is-editor-empty:first-child::before) {
		@apply text-muted-foreground;
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
	}

	:global(.ProseMirror ul),
	:global(.ProseMirror ol) {
		@apply ml-6;
	}

	:global(.ProseMirror ul) {
		@apply list-disc;
	}

	:global(.ProseMirror ol) {
		@apply list-decimal;
	}

	:global(.ProseMirror ul[data-type='taskList']) {
		@apply list-none ml-0;
	}

	:global(.ProseMirror ul[data-type='taskList'] li) {
		@apply flex items-start;
	}

	:global(.ProseMirror ul[data-type='taskList'] li input[type='checkbox']) {
		@apply mr-2 mt-1;
	}

	:global(.ProseMirror table) {
		@apply w-full border-collapse;
	}

	:global(.ProseMirror th),
	:global(.ProseMirror td) {
		@apply border border-border p-2;
	}

	:global(.ProseMirror th) {
		@apply bg-muted font-semibold;
	}

	:global(.collaboration-cursor__caret) {
		border-left: 2px solid currentColor;
		border-right: 2px solid currentColor;
		margin-left: -1px;
		margin-right: -1px;
		pointer-events: none;
		position: relative;
		word-break: normal;
	}

	:global(.collaboration-cursor__label) {
		@apply rounded-md px-1.5 py-0.5 text-xs font-medium text-white;
		margin-left: -1px;
		position: absolute;
		top: -1.4em;
		user-select: none;
		white-space: nowrap;
	}
</style>