<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import { Button } from '$lib/components/ui/button';
	import {
		Bold,
		Italic,
		Strikethrough,
		Code,
		Heading1,
		Heading2,
		Heading3,
		List,
		ListOrdered,
		ListTodo,
		Quote,
		Minus,
		Link,
		Unlink,
		Table,
		Image,
		Undo,
		Redo,
		AlignLeft,
		AlignCenter,
		AlignRight
	} from 'lucide-svelte';

	export let editor: Editor;

	function addImage() {
		const url = window.prompt('Enter image URL:');
		if (url) {
			editor.chain().focus().setImage({ src: url }).run();
		}
	}

	function setLink() {
		const previousUrl = editor.getAttributes('link').href;
		const url = window.prompt('Enter URL:', previousUrl);

		if (url === null) {
			return;
		}

		if (url === '') {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
			return;
		}

		editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
	}

	function insertTable() {
		editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
	}
</script>

<div class="toolbar sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
	<div class="flex flex-wrap items-center gap-1 p-2">
		<!-- Text formatting -->
		<div class="flex items-center gap-1 border-r pr-1">
			<Button
				size="icon"
				variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleBold().run()}
				disabled={!editor.can().chain().focus().toggleBold().run()}
				title="Bold (Ctrl+B)"
			>
				<Bold class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleItalic().run()}
				disabled={!editor.can().chain().focus().toggleItalic().run()}
				title="Italic (Ctrl+I)"
			>
				<Italic class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant={editor.isActive('strike') ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleStrike().run()}
				disabled={!editor.can().chain().focus().toggleStrike().run()}
				title="Strikethrough"
			>
				<Strikethrough class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant={editor.isActive('code') ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleCode().run()}
				disabled={!editor.can().chain().focus().toggleCode().run()}
				title="Inline code"
			>
				<Code class="h-4 w-4" />
			</Button>
		</div>

		<!-- Headings -->
		<div class="flex items-center gap-1 border-r pr-1">
			<Button
				size="icon"
				variant={editor.isActive('heading', { level: 1 }) ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
				title="Heading 1"
			>
				<Heading1 class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant={editor.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
				title="Heading 2"
			>
				<Heading2 class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant={editor.isActive('heading', { level: 3 }) ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
				title="Heading 3"
			>
				<Heading3 class="h-4 w-4" />
			</Button>
		</div>

		<!-- Lists -->
		<div class="flex items-center gap-1 border-r pr-1">
			<Button
				size="icon"
				variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleBulletList().run()}
				title="Bullet list"
			>
				<List class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleOrderedList().run()}
				title="Numbered list"
			>
				<ListOrdered class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant={editor.isActive('taskList') ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleTaskList().run()}
				title="Task list"
			>
				<ListTodo class="h-4 w-4" />
			</Button>
		</div>

		<!-- Block elements -->
		<div class="flex items-center gap-1 border-r pr-1">
			<Button
				size="icon"
				variant={editor.isActive('blockquote') ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleBlockquote().run()}
				title="Quote"
			>
				<Quote class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant={editor.isActive('codeBlock') ? 'secondary' : 'ghost'}
				on:click={() => editor.chain().focus().toggleCodeBlock().run()}
				title="Code block"
			>
				<Code class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				on:click={() => editor.chain().focus().setHorizontalRule().run()}
				title="Divider"
			>
				<Minus class="h-4 w-4" />
			</Button>
		</div>

		<!-- Links & Media -->
		<div class="flex items-center gap-1 border-r pr-1">
			<Button
				size="icon"
				variant={editor.isActive('link') ? 'secondary' : 'ghost'}
				on:click={setLink}
				title="Add link"
			>
				<Link class="h-4 w-4" />
			</Button>
			{#if editor.isActive('link')}
				<Button
					size="icon"
					variant="ghost"
					on:click={() => editor.chain().focus().unsetLink().run()}
					title="Remove link"
				>
					<Unlink class="h-4 w-4" />
				</Button>
			{/if}
			<Button
				size="icon"
				variant="ghost"
				on:click={addImage}
				title="Add image"
			>
				<Image class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				on:click={insertTable}
				title="Insert table"
			>
				<Table class="h-4 w-4" />
			</Button>
		</div>

		<!-- History -->
		<div class="flex items-center gap-1">
			<Button
				size="icon"
				variant="ghost"
				on:click={() => editor.chain().focus().undo().run()}
				disabled={!editor.can().chain().focus().undo().run()}
				title="Undo (Ctrl+Z)"
			>
				<Undo class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				on:click={() => editor.chain().focus().redo().run()}
				disabled={!editor.can().chain().focus().redo().run()}
				title="Redo (Ctrl+Y)"
			>
				<Redo class="h-4 w-4" />
			</Button>
		</div>
	</div>
</div>