import { Extension } from '@tiptap/core';

function generateAnchorId(text: string) {
  if (!text) {
    return '';
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 64);
}

const HeadingWithAnchors = Extension.create({
  name: 'headingWithAnchors',

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          id: {
            default: null,
            renderHTML: (attributes) => {
              // Safely handle the attributes object
              const { node, HTMLAttributes } = attributes || {};
              
              if (!node) {
                return {};
              }

              // Use existing ID if provided
              if (HTMLAttributes?.id) {
                return { id: HTMLAttributes.id };
              }

              // Generate ID from text content
              if (node.textContent) {
                const generatedId = generateAnchorId(node.textContent);
                if (generatedId) {
                  return { id: generatedId };
                }
              }

              return {};
            }
          }
        }
      }
    ];
  }
});

export default HeadingWithAnchors;

