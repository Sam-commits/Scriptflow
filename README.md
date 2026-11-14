# Scriptflow

A writer-focused app for screenplays and stageplays (multi-column AV scripts are coming), inspired by Final Draft and StudioBinder.

## Run it

```bash
npm install
npm run dev      # open the printed http://localhost:5173 link
npm test         # unit tests
npm run build    # production build in dist/
```

## Live app

https://sam-commits.github.io/Scriptflow/ (deployed from `main` by GitHub Actions).

## What works today

- **Screenplay and Stageplay editors** with industry-standard page layout (Courier 12pt, US Letter).
- **Final Draft-style keys:** Enter moves to the element that naturally follows, Tab cycles an empty element (Action → Character → Transition → Scene Heading) or starts the next one, Shift+Tab goes back, Shift+Enter adds a line break, Ctrl/⌘+1–8 picks an element, Ctrl/⌘+B/I/U for bold/italic/underline.
- **Writing assistant levels:** choose **Beginner**, **Intermediate** or **Professional** (asked on first launch, changeable from **Assist** in the top bar), or build **Custom** setups where every switch is yours. Setups can be exported and imported. Everything runs offline from your own script and never changes what prints or exports.
- **SmartType:** autocompletes scene heading prefixes, places and rooms inside them (HOUSE - KITCHEN), times of day, character names, extensions, parentheticals (including "to NAME") and transitions, all learned from the script and ranked by use and recency. Tagged Cast and Locations are suggested before they're used. On an empty Character line it guesses who speaks next. Capitalised names complete in Action. **Names & places** renames a character or place everywhere in one step. Typing `INT. ` in an Action line turns it into a Scene Heading.
- **Ghost text:** grey predictions at the end of a line: the next speaker, (CONT'D), the usual transition, the next heading, and phrases a character has already used. Tab or → accepts, Ctrl/Alt+→ takes one word, Esc hides it. Turn it on or off with the **Ghost text** button or Ctrl/⌘+Shift+G.
- **/ scene builder:** type `/` on an empty line for a command menu. **Scene** opens a pop-up for place, time, characters, a shape (Basic, Dialogue exchange, Intercut, Montage, Flashback, or your own saved template) and optional goal / conflict / turn notes, then lays out the scene with grey hints to write into. Enter at the end of a line moves into the next placeholder.
- **Beginner coaching:** a status-bar guide to the current element and what Enter and Tab do next, a format coach that underlines common mistakes with a one-line tip (never auto-fixing), a first-scene walk-through, and an annotated example script.
- **Navigator:** numbered scene list (acts and scenes for stageplays); click to jump.
- **Title page** editor.
- **Script tagging** for breakdowns: select text and press **Tag** (or Ctrl/⌘+Shift+E) to mark it as Cast, Extras, Props, Wardrobe, Hair & Makeup, Locations, Set Dressing, Vehicles, Animals, Effects, Stunts, Sound & Music or Shots. Optionally tag every other mention at once, or tag all characters in one click. Tagged text is highlighted in its category's color, which follows the theme in light and dark. The **Breakdown** panel shows the elements in the current scene, lets you add things a scene needs that the script never mentions, lists every element with the scenes it's in (rename, recategorize, merge or delete), and exports a breakdown sheet as CSV. Tags are saved with the script and in `.scriptflow` files, and never appear in PDF, FDX or Fountain exports.
- **Import:** Fountain (`.fountain`), Final Draft (`.fdx`), Scriptflow (`.scriptflow`).
- **Export:** PDF with proper pagination (scene headings never stranded at the bottom of a page, speeches split with (MORE)/(CONT'D), optional scene numbers), Final Draft `.fdx`, Fountain, Scriptflow.
- **Autosave** to the browser, with a script library in the sidebar.

## How it's built

- React + TypeScript + Vite, with [ProseMirror](https://prosemirror.net) as the editing engine.
- `src/doctypes/` defines each format as data (elements, indents, spacing, Enter/Tab flow). The editor, SmartType, navigator and exporters all read from it, so new formats (AV scripts) plug in here.
- `src/model.ts` is the format-neutral script model used by every importer and exporter.
- `src/io/` holds Fountain, FDX, pagination and PDF code.
- `src/assist/` holds the writing assistant: levels and Custom setups (`levels.ts`), ghost-text prediction (`predict.ts`), the format coach (`coach.ts`), renames and `/` commands. Scene builder shapes are data in `src/structures/`. The editor side (ghost text, hints, coach underlines) is in `src/editor/assistPlugins.ts`.
- `src/tags/` defines the breakdown categories and builds per-scene breakdowns; `src/editor/tagging.ts` holds the tagging edits (tags are ProseMirror marks, so they're undoable); tag colors are in `src/themes/tagColors.ts`.

## Roadmap

1. ✅ Editor engine with Screenplay and Stageplay
2. ✅ Tagging characters, props, locations, scenes and shots
3. Multi-column AV editor
4. Beat boards (Three-Act, Save the Cat, Hero's Journey, Story Circle, freeform) and outline views linked to scenes
5. GitHub sync: scripts as Fountain files, draft history, co-writer review
