import React, { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Icon } from '@iconify-icon/react';
import { descriptionToEditorContent, normalizeStoredTaskDescription } from './taskWorkspaceUtils';

function Toolbar({ editor }) {
    const { bold, italic, underline, bulletList, orderedList } = useEditorState({
        editor,
        selector: ({ editor: ed }) => ({
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            underline: ed.isActive('underline'),
            bulletList: ed.isActive('bulletList'),
            orderedList: ed.isActive('orderedList')
        })
    });

    if (!editor) return null;

    return (
        <div className="task-description-editor__toolbar" role="toolbar" aria-label="Description formatting">
            <button
                type="button"
                className={`task-description-editor__toolbar-btn${bold ? ' is-active' : ''}`}
                aria-pressed={bold}
                onClick={() => editor.chain().focus().toggleBold().run()}
                title="Bold"
            >
                <Icon icon="mdi:format-bold" aria-hidden />
            </button>
            <button
                type="button"
                className={`task-description-editor__toolbar-btn${italic ? ' is-active' : ''}`}
                aria-pressed={italic}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                title="Italic"
            >
                <Icon icon="mdi:format-italic" aria-hidden />
            </button>
            <button
                type="button"
                className={`task-description-editor__toolbar-btn${underline ? ' is-active' : ''}`}
                aria-pressed={underline}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                title="Underline"
            >
                <Icon icon="mdi:format-underline" aria-hidden />
            </button>
            <span className="task-description-editor__toolbar-sep" aria-hidden />
            <button
                type="button"
                className={`task-description-editor__toolbar-btn${bulletList ? ' is-active' : ''}`}
                aria-pressed={bulletList}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                title="Bullet list"
            >
                <Icon icon="mdi:format-list-bulleted" aria-hidden />
            </button>
            <button
                type="button"
                className={`task-description-editor__toolbar-btn${orderedList ? ' is-active' : ''}`}
                aria-pressed={orderedList}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                title="Numbered list"
            >
                <Icon icon="mdi:format-list-numbered" aria-hidden />
            </button>
        </div>
    );
}

export default function TaskDescriptionEditor({ value, onChange, placeholder, disabled, id }) {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const extensions = useMemo(
        () => [
            StarterKit.configure({
                blockquote: false,
                code: false,
                codeBlock: false,
                heading: false,
                horizontalRule: false,
                strike: false,
                link: false
            }),
            Placeholder.configure({
                placeholder: placeholder || 'Add a description…'
            })
        ],
        [placeholder]
    );

    const editor = useEditor(
        {
            extensions,
            content: descriptionToEditorContent(value),
            editable: !disabled,
            editorProps: {
                attributes: {
                    id: id || undefined,
                    class: 'task-description-editor__prose',
                    'aria-multiline': 'true',
                    ...(id ? { 'aria-label': 'Description' } : {})
                }
            },
            onUpdate: ({ editor: ed }) => {
                onChangeRef.current(normalizeStoredTaskDescription(ed.getHTML()));
            }
        },
        [extensions]
    );

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        editor.setEditable(!disabled);
    }, [disabled, editor]);

    return (
        <div className={`task-description-editor${disabled ? ' task-description-editor--disabled' : ''}`}>
            {editor ? <Toolbar editor={editor} /> : null}
            <EditorContent editor={editor} className="task-description-editor__content task-detail-panel__body-input" />
        </div>
    );
}
