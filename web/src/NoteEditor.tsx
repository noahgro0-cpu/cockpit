// D28: rich notes for lessons (Tiptap, MIT). Loaded lazily with the Fächer page.
// Security: content is HTML from this editor only, always parsed through its schema (unknown tags
// and attributes are dropped, never inserted as raw HTML). Pictures are referenced by id
// (<img data-image="…">) and come from the device cache or the backend, never from a URL.
import { useEffect, useRef, useState } from "react";
import { EditorContent, Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes, useEditor, useEditorState, type NodeViewProps } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import Highlight from "@tiptap/extension-highlight";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { Mathematics } from "@tiptap/extension-mathematics";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  Bold,
  Calendar as CalendarIcon,
  CheckSquare,
  Code,
  ImagePlus,
  Indent,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Outdent,
  Palette,
  Quote,
  Redo2,
  Sigma,
  Strikethrough,
  Table as TableIcon,
  Type,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { BottomSheet } from "./BottomSheet";

export interface ImageStore {
  /** Object URL of a stored picture, or null if it is not available (offline, deleted). */
  url(id: string): Promise<string | null>;
  /** Shrinks, stores locally and queues the upload; returns the new image id. */
  add(file: File): Promise<string>;
}

const TEXT_COLORS = [
  { label: "Standard", value: "" },
  { label: "Rot", value: "#e5484d" },
  { label: "Orange", value: "#f76b15" },
  { label: "Grün", value: "#30a46c" },
  { label: "Blau", value: "#3e8ef7" },
  { label: "Violett", value: "#8e4ec6" },
];
const MARKS = [
  { label: "Gelb", value: "rgba(255, 214, 10, 0.45)" },
  { label: "Grün", value: "rgba(48, 209, 88, 0.35)" },
  { label: "Blau", value: "rgba(64, 156, 255, 0.35)" },
  { label: "Rosa", value: "rgba(255, 55, 95, 0.3)" },
];
const SIZES = [
  { label: "Klein", value: "0.85em" },
  { label: "Normal", value: "" },
  { label: "Gross", value: "1.25em" },
];

function ImageView({ node, extension, selected }: NodeViewProps) {
  const store = (extension.options as { store: ImageStore }).store;
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void store.url(node.attrs.image).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [node.attrs.image, store]);
  return (
    <NodeViewWrapper className={`note-image${selected ? " selected" : ""}`} data-drag-handle>
      {src ? <img src={src} alt="" draggable={false} /> : <div className="note-image-missing">{src === null ? "Bild nicht verfügbar (offline?)" : "Bild wird geladen …"}</div>}
    </NodeViewWrapper>
  );
}

/** Block picture referenced by id only (no src in the stored HTML). */
const NoteImage = Node.create<{ store: ImageStore }>({
  name: "noteImage",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() {
    return { store: { url: async () => null, add: async () => "" } };
  },
  addAttributes() {
    return { image: { default: null, parseHTML: (el) => el.getAttribute("data-image"), renderHTML: (a) => ({ "data-image": a.image }) } };
  },
  parseHTML() {
    return [{ tag: "img[data-image]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { alt: "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

function Btn({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`tool${active ? " active" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // keep the selection in the editor (iPad: tapping a button must not close the keyboard first)
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onImage, onMath, onLink, onColors }: { editor: Editor; onImage: () => void; onMath: () => void; onLink: () => void; onColors: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      style: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : e.isActive("codeBlock") ? "code" : "p",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      size: (e.getAttributes("textStyle").fontSize as string) || "",
      canSink: e.can().sinkListItem("listItem") || e.can().sinkListItem("taskItem"),
      canLift: e.can().liftListItem("listItem") || e.can().liftListItem("taskItem"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatierung">
      <div className="tool-group">
        <label className="tool-select">
          <Type size={16} aria-hidden="true" />
          <span className="sr-only">Absatzstil</span>
          <select
            value={s.style}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "p") chain().setParagraph().run();
              else if (v === "code") chain().toggleCodeBlock().run();
              else chain().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
            }}
          >
            <option value="p">Text</option>
            <option value="h1">Titel</option>
            <option value="h2">Überschrift</option>
            <option value="h3">Unterüberschrift</option>
            <option value="code">Code</option>
          </select>
        </label>
        <label className="tool-select">
          <span className="sr-only">Schriftgrösse</span>
          <select
            value={s.size}
            aria-label="Schriftgrösse"
            onChange={(e) => (e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run())}
          >
            {SIZES.map((x) => (
              <option key={x.label} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tool-group">
        <Btn label="Fett" active={s.bold} onClick={() => chain().toggleBold().run()}>
          <Bold size={18} />
        </Btn>
        <Btn label="Kursiv" active={s.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic size={18} />
        </Btn>
        <Btn label="Unterstrichen" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
          <UnderlineIcon size={18} />
        </Btn>
        <Btn label="Durchgestrichen" active={s.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough size={18} />
        </Btn>
        <Btn label="Farbe und Markierung" onClick={onColors}>
          <Palette size={18} />
        </Btn>
      </div>
      <div className="tool-group">
        <Btn label="Aufzählung" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List size={18} />
        </Btn>
        <Btn label="Nummerierte Liste" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered size={18} />
        </Btn>
        <Btn label="Checkliste" active={s.task} onClick={() => chain().toggleTaskList().run()}>
          <CheckSquare size={18} />
        </Btn>
        <Btn label="Einrücken" disabled={!s.canSink} onClick={() => (editor.can().sinkListItem("taskItem") ? chain().sinkListItem("taskItem").run() : chain().sinkListItem("listItem").run())}>
          <Indent size={18} />
        </Btn>
        <Btn label="Ausrücken" disabled={!s.canLift} onClick={() => (editor.can().liftListItem("taskItem") ? chain().liftListItem("taskItem").run() : chain().liftListItem("listItem").run())}>
          <Outdent size={18} />
        </Btn>
      </div>
      <div className="tool-group">
        <Btn label="Tabelle einfügen" active={s.table} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon size={18} />
        </Btn>
        <Btn label="Bild einfügen" onClick={onImage}>
          <ImagePlus size={18} />
        </Btn>
        <Btn label="Formel einfügen" onClick={onMath}>
          <Sigma size={18} />
        </Btn>
        <Btn label="Link" active={s.link} onClick={onLink}>
          <LinkIcon size={18} />
        </Btn>
        <Btn label="Zitat oder Merksatz" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote size={18} />
        </Btn>
        <Btn label="Code" active={s.style === "code"} onClick={() => chain().toggleCodeBlock().run()}>
          <Code size={18} />
        </Btn>
        <Btn label="Trennlinie" onClick={() => chain().setHorizontalRule().run()}>
          <Minus size={18} />
        </Btn>
        <Btn
          label="Heutiges Datum einfügen"
          onClick={() => chain().insertContent(new Intl.DateTimeFormat("de-CH", { weekday: "short", day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Zurich" }).format(new Date()) + " ").run()}
        >
          <CalendarIcon size={18} />
        </Btn>
      </div>
      <div className="tool-group">
        <Btn label="Rückgängig" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 size={18} />
        </Btn>
        <Btn label="Wiederholen" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 size={18} />
        </Btn>
      </div>
      {s.table && (
        <div className="tool-group table-tools" aria-label="Tabelle">
          <button type="button" className="tool text" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().addRowAfter().run()}>
            + Zeile
          </button>
          <button type="button" className="tool text" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().addColumnAfter().run()}>
            + Spalte
          </button>
          <button type="button" className="tool text" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteRow().run()}>
            − Zeile
          </button>
          <button type="button" className="tool text" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteColumn().run()}>
            − Spalte
          </button>
          <button type="button" className="tool text" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().toggleHeaderRow().run()}>
            Kopfzeile
          </button>
          <button type="button" className="tool text danger" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteTable().run()}>
            Tabelle löschen
          </button>
        </div>
      )}
    </div>
  );
}

function MathSheet({ initial, onSave, onRemove, onClose }: { initial: string; onSave: (latex: string) => void; onRemove?: () => void; onClose: () => void }) {
  const [latex, setLatex] = useState(initial);
  const preview = katex.renderToString(latex || "\\;", { throwOnError: false, trust: false, strict: "ignore" });
  return (
    <BottomSheet title="Formel" onClose={onClose}>
      <form
        className="card form-grid editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (latex.trim()) onSave(latex.trim());
          onClose();
        }}
      >
        <label>
          Formel (LaTeX)
          <textarea value={latex} onChange={(e) => setLatex(e.target.value)} rows={3} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="z. B. U = R \cdot I  oder  \frac{a}{b}" autoFocus />
        </label>
        {/* KaTeX output of the user's own formula (trust: false: no links, no HTML) */}
        <div className="math-preview" aria-label="Vorschau" dangerouslySetInnerHTML={{ __html: preview }} />
        <p className="small">Beispiele: x^2 · \sqrt{'{'}x{'}'} · \frac{'{'}1{'}'}{'{'}2{'}'} · \alpha, \omega · \int_0^1 f(x)\,dx · \sum_{'{'}i=1{'}'}^n</p>
        <div className="actions">
          <button className="primary">Übernehmen</button>
          {onRemove && (
            <button type="button" className="danger-button" onClick={() => (onRemove(), onClose())}>
              Formel entfernen
            </button>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}

function LinkSheet({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState((editor.getAttributes("link").href as string) || "https://");
  const [error, setError] = useState("");
  return (
    <BottomSheet title="Link" onClose={onClose}>
      <form
        className="card form-grid editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(url.trim())) {
            setError("Bitte eine vollständige Adresse mit https:// eingeben.");
            return;
          }
          const chain = editor.chain().focus().extendMarkRange("link");
          if (editor.state.selection.empty && !editor.isActive("link")) chain.insertContent({ type: "text", text: url.trim(), marks: [{ type: "link", attrs: { href: url.trim() } }] }).run();
          else chain.setLink({ href: url.trim() }).run();
          onClose();
        }}
      >
        <label>
          Adresse
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
        </label>
        {error && <p className="danger" role="alert">{error}</p>}
        <div className="actions">
          <button className="primary">Übernehmen</button>
          {editor.isActive("link") && (
            <button type="button" onClick={() => (editor.chain().focus().extendMarkRange("link").unsetLink().run(), onClose())}>
              Link entfernen
            </button>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}

function ColorSheet({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const apply = (fn: () => void) => {
    fn();
    onClose();
  };
  return (
    <BottomSheet title="Farbe und Markierung" onClose={onClose}>
      <div className="card color-sheet">
        <h3>Textfarbe</h3>
        <div className="swatches">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => apply(() => (c.value ? editor.chain().focus().setColor(c.value).run() : editor.chain().focus().unsetColor().run()))}
            >
              <span className="swatch text-swatch" style={{ color: c.value || "var(--ink)" }} aria-hidden="true">
                A
              </span>
              {c.label}
            </button>
          ))}
        </div>
        <h3>Markieren</h3>
        <div className="swatches">
          {MARKS.map((c) => (
            <button key={c.label} type="button" onClick={() => apply(() => editor.chain().focus().setHighlight({ color: c.value }).run())}>
              <span className="swatch" style={{ background: c.value }} aria-hidden="true" />
              {c.label}
            </button>
          ))}
          <button type="button" onClick={() => apply(() => editor.chain().focus().unsetHighlight().run())}>
            <span className="swatch" aria-hidden="true" />
            Keine
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

export default function NoteEditor({
  html,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  images,
  label,
}: {
  html: string;
  onChange: (html: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  placeholder: string;
  images: ImageStore;
  label: string;
}) {
  const emitted = useRef(html);
  const fileInput = useRef<HTMLInputElement>(null);
  const [math, setMath] = useState<{ latex: string; pos?: number; inline: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const [coloring, setColoring] = useState(false);
  const [imageError, setImageError] = useState("");
  const callbacks = useRef({ onChange, onFocus, onBlur });
  callbacks.current = { onChange, onFocus, onBlur };
  const insertFiles = async (editor: Editor, files: File[], pos?: number) => {
    setImageError("");
    for (const file of files.filter((f) => f.type.startsWith("image/"))) {
      try {
        const id = await images.add(file);
        const content = { type: "noteImage", attrs: { image: id } };
        if (pos !== undefined) editor.chain().focus().insertContentAt(pos, content).run();
        else editor.chain().focus().insertContent(content).run();
      } catch (e) {
        setImageError(e instanceof Error ? e.message : "Bild konnte nicht eingefügt werden.");
      }
    }
  };
  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
      }),
      TaskList,
      TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node, checked) => `${checked ? "Erledigt" : "Offen"}: ${node.textContent || "leerer Punkt"}` } }),
      TableKit.configure({ table: { resizable: false } }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontSize,
      Placeholder.configure({ placeholder }),
      Mathematics.configure({
        katexOptions: { throwOnError: false, trust: false, strict: "ignore" },
        inlineOptions: { onClick: (node, pos) => setMath({ latex: node.attrs.latex, pos, inline: true }) },
        blockOptions: { onClick: (node, pos) => setMath({ latex: node.attrs.latex, pos, inline: false }) },
      }),
      NoteImage.configure({ store: images }),
    ],
    content: html,
    editorProps: {
      attributes: { class: "note-content", "aria-label": label, "aria-multiline": "true", role: "textbox" },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length || !editorRef.current) return false;
        void insertFiles(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length || !editorRef.current) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertFiles(editorRef.current, files, at);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const out = e.isEmpty ? "" : e.getHTML();
      emitted.current = out;
      callbacks.current.onChange(out);
    },
    onFocus: () => callbacks.current.onFocus(),
    onBlur: () => callbacks.current.onBlur(),
  });
  const editorRef = useRef<Editor | null>(editor);
  editorRef.current = editor;
  // A newer version from the server (another device) replaces the content while not editing.
  useEffect(() => {
    if (editor && html !== emitted.current) {
      emitted.current = html;
      editor.commands.setContent(html, { emitUpdate: false });
    }
  }, [html, editor]);
  if (!editor) return null;
  return (
    <div className="note-editor">
      <Toolbar
        editor={editor}
        onImage={() => fileInput.current?.click()}
        onMath={() => setMath({ latex: "", inline: true })}
        onLink={() => setLinking(true)}
        onColors={() => setColoring(true)}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void insertFiles(editor, files);
        }}
      />
      {imageError && (
        <p className="small danger" role="alert">
          {imageError}
        </p>
      )}
      <EditorContent editor={editor} />
      {math && (
        <MathSheet
          initial={math.latex}
          onClose={() => setMath(null)}
          onRemove={
            math.pos !== undefined
              ? () => (math.inline ? editor.chain().focus().deleteInlineMath({ pos: math.pos }).run() : editor.chain().focus().deleteBlockMath({ pos: math.pos }).run())
              : undefined
          }
          onSave={(latex) => {
            if (math.pos === undefined) editor.chain().focus().insertInlineMath({ latex }).run();
            else if (math.inline) editor.chain().focus().updateInlineMath({ latex, pos: math.pos }).run();
            else editor.chain().focus().updateBlockMath({ latex, pos: math.pos }).run();
          }}
        />
      )}
      {linking && <LinkSheet editor={editor} onClose={() => setLinking(false)} />}
      {coloring && <ColorSheet editor={editor} onClose={() => setColoring(false)} />}
    </div>
  );
}
