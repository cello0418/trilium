import libraryLoader from "./library_loader.js";
import treeService from './tree.js';
import noteAutocompleteService from './note_autocomplete.js';
import mimeTypesService from './mime_types.js';

const ENABLE_INSPECTOR = false;

const mentionSetup = {
    feeds: [
        {
            marker: '@',
            feed: queryText => {
                return new Promise((res, rej) => {
                    noteAutocompleteService.autocompleteSource(queryText, rows => {
                        if (rows.length === 1 && rows[0].title === 'No results') {
                            rows = [];
                        }

                        for (const row of rows) {
                            row.text = row.name = row.noteTitle;
                            row.id = '@' + row.text;
                            row.link = '#' + row.path;
                        }

                        res(rows);
                    });
                });
            },
            itemRenderer: item => {
                const itemElement = document.createElement('span');

                itemElement.classList.add('mentions-item');
                itemElement.innerHTML = `${item.highlightedTitle} `;

                return itemElement;
            },
            minimumCharacters: 0
        }
    ]
};

class NoteDetailText {
    /**
     * @param {TabContext} ctx
     */
    constructor(ctx) {
        this.ctx = ctx;
        this.$component = ctx.$tabContent.find('.note-detail-text');
        this.$editorEl = this.$component.find('.note-detail-text-editor');
        this.textEditorPromise = null;
        this.textEditor = null;

        this.$component.on("dblclick", "img", e => {
            const $img = $(e.target);
            const src = $img.prop("src");

            const match = src.match(/\/api\/images\/([A-Za-z0-9]+)\//);

            if (match) {
                const noteId = match[1];

                treeService.activateNote(noteId);
            }
            else {
                window.open(src, '_blank');
            }
        });
    }

    async render() {
        if (!this.textEditorPromise) {
            this.textEditorPromise = this.initEditor();
        }

        await this.textEditorPromise;

        // lazy loading above can take time and tab might have been already switched to another note
        if (this.ctx.note && this.ctx.note.type === 'text') {
            this.textEditor.isReadOnly = await this.isReadOnly();

            this.$component.show();

            this.textEditor.setData(this.ctx.note.content);
        }
    }

    async initEditor() {
        await libraryLoader.requireLibrary(libraryLoader.CKEDITOR);

        const codeBlockLanguages =
            (await mimeTypesService.getMimeTypes())
                .filter(mt => mt.enabled)
                .map(mt => {
                    return {
                        language: mt.mime.toLowerCase().replace(/[\W_]+/g,"-"),
                        label: mt.title
                    }
                });

        // CKEditor since version 12 needs the element to be visible before initialization. At the same time
        // we want to avoid flicker - i.e. show editor only once everything is ready. That's why we have separate
        // display of $component in both branches.
        this.$component.show();

        const textEditorInstance = await BalloonEditor.create(this.$editorEl[0], {
            placeholder: "Type the content of your note here ...",
            mention: mentionSetup,
            codeBlock: {
                languages: codeBlockLanguages
            }
        });

        if (glob.isDev && ENABLE_INSPECTOR) {
            await import('../../libraries/ckeditor/inspector.js');
            CKEditorInspector.attach(textEditorInstance);
        }

        this.textEditor = textEditorInstance;

        this.onNoteChange(() => this.ctx.noteChanged());
    }

    getContent() {
        const content = this.textEditor.getData();

        // if content is only tags/whitespace (typically <p>&nbsp;</p>), then just make it empty
        // this is important when setting new note to code
        return this.isContentEmpty(content) ? '' : content;
    }

    isContentEmpty(content) {
        content = content.toLowerCase();

        return jQuery(content).text().trim() === ''
            && !content.includes("<img")
            && !content.includes("<section")
    }

    async isReadOnly() {
        const attributes = await this.ctx.attributes.getAttributes();

        return attributes.some(attr => attr.type === 'label' && attr.name === 'readOnly');
    }

    focus() {
        this.$editorEl.trigger('focus');
    }

    show() {}

    getEditor() {
        return this.textEditor;
    }

    onNoteChange(func) {
        this.textEditor.model.document.on('change:data', func);
    }

    cleanup() {
        if (this.textEditor) {
            this.textEditor.setData('');
        }
    }

    scrollToTop() {
        this.$component.scrollTop(0);
    }
}

export default NoteDetailText