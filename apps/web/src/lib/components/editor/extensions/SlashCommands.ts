import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import Suggestion from '@tiptap/suggestion';

export interface CommandItem {
	title: string;
	description: string;
	icon: string;
	command: ({ editor, range }: any) => void;
}

const commands: CommandItem[] = [
	{
		title: 'Heading 1',
		description: 'Big section heading',
		icon: 'H1',
		command: ({ editor, range }) => {
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.setNode('heading', { level: 1 })
				.run();
		}
	},
	{
		title: 'Heading 2',
		description: 'Medium section heading',
		icon: 'H2',
		command: ({ editor, range }) => {
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.setNode('heading', { level: 2 })
				.run();
		}
	},
	{
		title: 'Heading 3',
		description: 'Small section heading',
		icon: 'H3',
		command: ({ editor, range }) => {
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.setNode('heading', { level: 3 })
				.run();
		}
	},
	{
		title: 'Bullet List',
		description: 'Create a simple bullet list',
		icon: '•',
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleBulletList().run();
		}
	},
	{
		title: 'Numbered List',
		description: 'Create a numbered list',
		icon: '1.',
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleOrderedList().run();
		}
	},
	{
		title: 'Task List',
		description: 'Track tasks with checkboxes',
		icon: '☐',
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleTaskList().run();
		}
	},
	{
		title: 'Quote',
		description: 'Capture a quote',
		icon: '"',
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleBlockquote().run();
		}
	},
	{
		title: 'Code Block',
		description: 'Display code with syntax highlighting',
		icon: '</>',
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
		}
	},
	{
		title: 'Divider',
		description: 'Visually divide sections',
		icon: '—',
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setHorizontalRule().run();
		}
	},
	{
		title: 'Table',
		description: 'Add a table',
		icon: '⊞',
		command: ({ editor, range }) => {
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
				.run();
		}
	},
	{
		title: 'Image',
		description: 'Upload or embed an image',
		icon: '🖼',
		command: ({ editor, range }) => {
			const url = window.prompt('Enter image URL:');
			if (url) {
				editor
					.chain()
					.focus()
					.deleteRange(range)
					.setImage({ src: url })
					.run();
			}
		}
	}
];

const SlashCommands = Extension.create({
	name: 'slashCommands',

	addOptions() {
		return {
			suggestion: {
				char: '/',
				command: ({ editor, range, props }: any) => {
					props.command({ editor, range });
				},
				items: ({ query }: { query: string }) => {
					return commands.filter(item =>
						item.title.toLowerCase().startsWith(query.toLowerCase())
					);
				},
				render: () => {
					let component: any;
					let popup: any;

					return {
						onStart: (props: any) => {
							if (!props.clientRect) {
								return;
							}

							component = createCommandMenu(props);
							popup = createPopup(component, props.clientRect());
						},

						onUpdate(props: any) {
							if (!props.clientRect) {
								return;
							}

							if (component) {
								updateCommandMenu(component, props);
							}

							if (popup) {
								popup.style.top = `${props.clientRect().bottom + window.scrollY}px`;
								popup.style.left = `${props.clientRect().left + window.scrollX}px`;
							}
						},

						onKeyDown(props: any) {
							if (props.event.key === 'Escape') {
								if (popup) {
									document.body.removeChild(popup);
								}
								return true;
							}

							if (props.event.key === 'Enter') {
								const selectedItem = component?.querySelector('.selected');
								if (selectedItem) {
									const index = Array.from(component.children).indexOf(selectedItem);
									props.command(commands[index]);
								}
								return true;
							}

							if (props.event.key === 'ArrowUp') {
								navigateCommands(component, -1);
								return true;
							}

							if (props.event.key === 'ArrowDown') {
								navigateCommands(component, 1);
								return true;
							}

							return false;
						},

						onExit() {
							if (popup && document.body.contains(popup)) {
								document.body.removeChild(popup);
							}
						}
					};
				}
			}
		};
	},

	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				...this.options.suggestion
			})
		];
	}
});

function createCommandMenu(props: any) {
	const menu = document.createElement('div');
	menu.className = 'slash-command-menu';

	props.items.forEach((item: CommandItem, index: number) => {
		const button = document.createElement('button');
		button.className = 'slash-command-item';
		if (index === 0) button.classList.add('selected');

		button.innerHTML = `
			<span class="slash-command-icon">${item.icon}</span>
			<div class="slash-command-content">
				<div class="slash-command-title">${item.title}</div>
				<div class="slash-command-description">${item.description}</div>
			</div>
		`;

		button.onclick = () => props.command(item);
		menu.appendChild(button);
	});

	return menu;
}

function updateCommandMenu(menu: HTMLElement, props: any) {
	menu.innerHTML = '';

	props.items.forEach((item: CommandItem, index: number) => {
		const button = document.createElement('button');
		button.className = 'slash-command-item';
		if (index === 0) button.classList.add('selected');

		button.innerHTML = `
			<span class="slash-command-icon">${item.icon}</span>
			<div class="slash-command-content">
				<div class="slash-command-title">${item.title}</div>
				<div class="slash-command-description">${item.description}</div>
			</div>
		`;

		button.onclick = () => props.command(item);
		menu.appendChild(button);
	});
}

function createPopup(content: HTMLElement, rect: DOMRect) {
	const popup = document.createElement('div');
	popup.className = 'slash-command-popup';
	popup.style.position = 'absolute';
	popup.style.top = `${rect.bottom + window.scrollY}px`;
	popup.style.left = `${rect.left + window.scrollX}px`;
	popup.style.zIndex = '1000';
	popup.appendChild(content);
	document.body.appendChild(popup);
	return popup;
}

function navigateCommands(menu: HTMLElement, direction: number) {
	const items = Array.from(menu.children);
	const currentIndex = items.findIndex(item => item.classList.contains('selected'));
	const newIndex = Math.max(0, Math.min(items.length - 1, currentIndex + direction));

	items[currentIndex]?.classList.remove('selected');
	items[newIndex]?.classList.add('selected');
	items[newIndex]?.scrollIntoView({ block: 'nearest' });
}

export default SlashCommands;