<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { toast } from '@/composables/useToast';
import { desktop, fileFrom } from '@/social/desktop';
import { holdsProject, loadImage, pickFile, PROJECT_EXTENSION, OLD_PROJECT_EXTENSION, savesInPlace } from '@/document/projectIO';
import { isArtFile, ART_EXTENSIONS } from '@/lib/ArtFile';
import { isSvgFile } from '@/lib/SvgFile.js';
import { SLOT_CHARS } from '@/lib/BitmapFont';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { useLayerName } from '@/composables/useLayerName';
import { usePlayback } from '@/composables/usePlayback';
import { followParams } from '@/store/project/rendering';

import EditTabs from '@/components/EditTabs.vue';
import ZeroState from '@/components/ZeroState.vue';
import SauceEditor from '@/components/SauceEditor.vue';
import DropZone from '@/components/DropZone.vue';
import AnimationBar from '@/components/AnimationBar.vue';
import KeysPanel from '@/components/KeysPanel.vue';
import AnsiEditor from '@/components/AnsiEditor.vue';
import InputEditor from '@/components/InputEditor.vue';
import EditToolbar from '@/components/EditToolbar.vue';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
import ColorLayer from '@/components/ColorLayer.vue';
import WatchRoomPage from '@/components/social/WatchRoomPage.vue';
import ChoiceDialog from '@/components/ChoiceDialog.vue';

defineProps({
  ready: { type: Boolean, default: true },
  recent: { type: Array, default: () => [] },
  openRecent: Function,
});

const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const drawing = useDrawingStore();
const DESKTOP = import.meta.env.VITE_DESKTOP === '1';
useKeyboardShortcuts(project, workspace);
const playback = usePlayback();

onMounted(() => project.render());
followParams(project);
// The frames near the one showing are a ghost from their pictures: built when the frames or how many the Ghost box
// asks for change, or they went stale (a render).
watch(() => [project.frame, project.frames, project.renderedCells, project.animate, workspace.ghost, workspace.playing, project.ghostReach], () => {
  if (!workspace.playing && workspace.ghost) project.buildGhost();
});

// The file chooser: the start screen's button and Cmd/Ctrl+O (the workspace's openRequest) both open it, and what it
// picks goes the way a dropped file does. A phone's picker greys out any file it can't match to the list, and it can't
// match .phosphor (no type it knows), so on a touch screen there's no list; a file that isn't an image, a project or an
// art file says so when it fails to open.
const chooser = ref(null);
const touch = useMediaQuery('(pointer: coarse)');
const extensions = ['.svg', PROJECT_EXTENSION, OLD_PROJECT_EXTENSION, ...ART_EXTENSIONS.map((e) => `.${e}`)];
const accept = ['image/*', ...extensions].join(',');
watch(() => workspace.openRequest, () => (DESKTOP ? openChosen() : browse()));
// Where the browser savesInPlace, its open picker, so a project opened keeps its handle for Save to write over.
function browse() {
  if (!savesInPlace()) return chooser.value?.click();
  pickFile([{ description: t('save.openFileType'), accept: { 'image/*': [], 'application/octet-stream': extensions } }]).then((file) => {
    if (file) handleFileSelected(file);
  }, (error) => {
    console.warn('Could not open the file', error);
    toast(t('menu.openFailed'));
  });
}
// Desktop: the system's own chooser, in the main process, which can then save a project back where it came from; and
// files it was asked to open (double-clicked, Open Recent), as the workspace's fileRequest.
async function openChosen() {
  try {
    const file = await desktop.openFile();
    if (file) handleFileSelected(fileFrom(file));
  } catch (error) {
    console.warn('Could not open the file', error);
    toast(t('menu.openFailed'));
  }
}
watch(() => workspace.fileRequest, (file) => {
  if (!file) return;
  workspace.fileRequest = null;
  handleFileSelected(file);
});
function onChosen(e) {
  const file = e.target.files[0];
  e.target.value = ''; // choosing the same file again still fires
  if (file) handleFileSelected(file);
}

// Every file dropped or chosen comes through here. A picture, a project, an art file or an SVG opens; anything else
// says so, naming the file. A file with no type (some phones give none for a photo) is tried as a picture first.
const knownKind = (file, isProject) => isProject || isArtFile(file.name) || isSvgFile(file.name);
async function canOpen(file, isProject) {
  if (file.type.startsWith('image/') || knownKind(file, isProject)) return true;
  if (file.type) return false;
  try {
    await loadImage(file, '');
    return true;
  } catch {
    return false;
  }
}

async function handleFileSelected(file) {
  const isProject = await holdsProject(file); // a .pho or .phosphor, or a .png with a project inside: read once
  if (!(await canOpen(file, isProject))) return toast(t('actions.cantOpen', { name: file.name }));
  // An art or SVG file over a drawing asks whether to add it or open it (artDrop), even in a room: adding is a
  // paste. An SVG is never a picture: it's shapes.
  if (project.image && (isArtFile(file.name) || isSvgFile(file.name))) return workspace.askArt(file);
  // Desktop: nothing opens in place of a drawing. A project, or a picture where adding isn't offered (an animation, a
  // drawing shared with a room), opens in a new window without asking.
  if (DESKTOP && project.image && (isProject || project.hasFrames || project._sharing || drawing.offWithOthers)) return openInNewWindow(file);
  if (drawing.offWithOthers) return toast(drawing.offWithOthers);
  // From the start screen, an art file asks whether to edit it or draw on top of it.
  if (isArtFile(file.name)) return workspace.askArt(file);
  // A picture over a still drawing (not shared with a room) asks too: added as a layer's paint, or opened in its place.
  if (project.image && !isProject && !project.hasFrames && !project._sharing) return workspace.askArt(file, { picture: true });
  workspace.confirmLeave(file.name, () => openFile(file, isProject)); // over unsaved work, asked first (UnsavedDialog)
}

async function openFile(file, isProject) {
  if (!project.image) workspace.editorTab = isSvgFile(file.name) ? 'vector' : 'output'; // from the start screen, chosen first: the address moves once
  if (isProject) await project.loadProject(file);
  else if (isArtFile(file.name) || isSvgFile(file.name)) return openArt(file);
  else { await project.setImageFromFile(file); workspace.pickLayer('base'); }
  workspace.editorTab = 'output';
}

// Desktop: the file in a window of its own (or the window that has it open, brought forward); this one stays as it is.
async function openInNewWindow(file) {
  try {
    if (await desktop.openInNewWindow(file)) return;
  } catch (error) {
    console.warn('Could not open the file in a new window', error);
  }
  toast(t('menu.openFailed'));
}

// A blank canvas opens on ANSI, as everything else does (chosen first, so the address moves once).
function startBlank() {
  workspace.editorTab = 'output';
  project.setBlankCanvas();
}

// An art file opens on ANSI, onto the layer chosen ('edit' or 'base'); an SVG on VECTOR (openSvgFile chooses it).
async function openArt(file, layer, art) {
  const svg = isSvgFile(file.name);
  try {
    await (svg ? project.openSvgFile(file) : project.openArtFile(file, { layer, art }));
  } catch (error) {
    if (!error.userMessage) throw error;
    return toast(error.userMessage); // nothing changed, so stay where we are
  }
  if (!svg) workspace.editorTab = 'output';
}

// The art file's question. On the start screen: edit it (its art on the edit layer) or draw on top of it (its
// art the base layer). Dropped on a drawing: added as a paste is (floating and selected, where it was dropped or at
// the view's top-left), an SVG as shapes on VECTOR, or a picture as paint on the cells layer picked (else a new one);
// or opened in place of this drawing, an art file onto either layer (not in a room where opening is off). On the
// desktop, opening is in a new window instead, offered in a room too.
const layerName = useLayerName();
const addText = (drop) => (drop.picture ? (workspace.pickedCells ? t('actions.pictureAddText', { name: layerName(workspace.pickedLayer) }) : t('actions.pictureAddNew'))
  : isSvgFile(drop.file.name) ? t('actions.svgAddText') : t(drop.at ? 'actions.artAddWhere' : 'actions.artAddTopLeft', { name: layerName(project.editId) }));
const artChoices = computed(() => {
  const drop = workspace.artDrop;
  if (!drop) return [];
  if (!project.image) {
    return [
      { id: 'edit', title: t('actions.artEdit'), text: t('actions.artEditText') },
      { id: 'base', title: t('actions.artDrawOn'), text: t('actions.artDrawOnText') },
    ];
  }
  if (DESKTOP) return [{ id: 'add', title: t('actions.artAdd'), text: addText(drop) }, { id: 'window', title: t('actions.artOpenWindow'), text: t('actions.artOpenWindowText') }];
  // Opening in its place says what happens to unsaved changes there, so there's no second question.
  const note = project.unsavedChanges || project._stroke ? t('actions.replacesUnsaved') : null; // a typing run still open counts
  const open = drop.picture || isSvgFile(drop.file.name) ? [{ id: 'open', title: t('actions.artOpen'), text: t('actions.artOpenText'), note }] : [
    { id: 'edit', title: t('actions.artOpenEdit'), text: t('actions.artOpenEditText'), note },
    { id: 'base', title: t('actions.artOpenDrawOn'), text: t('actions.artOpenDrawOnText'), note },
  ];
  return [{ id: 'add', title: t('actions.artAdd'), text: addText(drop) }, ...(drawing.offWithOthers ? [] : open)];
});
const artTitle = computed(() => t(project.image ? 'actions.artDropTitle' : 'actions.artOpenTitle', { name: workspace.artDrop?.file.name }));
const artSub = computed(() => (!project.image ? t('actions.artOpenSub') : DESKTOP ? t('actions.artDropSubWindow') : drawing.offWithOthers ? t('actions.artDropSubAddOnly') : t('actions.artDropSub')));
async function chooseArt(choice) {
  const { file, at, picture, art } = workspace.artDrop;
  workspace.artDrop = null;
  if (choice === 'window') return openInNewWindow(file);
  if (picture) {
    if (choice === 'add') return project.addPictureToLayer(file);
    await project.setImageFromFile(file); // its question said what happens to unsaved changes
    workspace.pickLayer('base');
    workspace.editorTab = 'output';
    return;
  }
  if (choice !== 'add') { // 'edit' or 'base' (an art file's layer), or 'open' (an SVG)
    if (!project.image) workspace.editorTab = 'output'; // from the start screen, chosen first: the address moves once
    return openArt(file, choice, art); // its question said what happens to unsaved changes
  }
  if (playback.playing) playback.pause(); // it lands on the frame showing
  if (isSvgFile(file.name)) return addSvg(file);
  if (project._paused) return; // refused, as a paste is
  // Dropped beside the drawing (or on the SAUCE tab): the top-left of the art view last shown, which comes back.
  workspace.editorTab = workspace.viewTab;
  const { col, row } = at ?? (workspace.viewTab === 'output' ? workspace.ansiViewOrigin : workspace.pixelViewOrigin);
  // A font's slot 0 (␀) is that font's own glyph; a drawing with no font has none, and CP437 shows byte 0 as a space.
  const cells = project.drawingFont ? art.cells : art.cells.map((cell) => (cell.char === SLOT_CHARS[0] ? { ...cell, char: ' ' } : cell));
  const pasted = project.pasteSelection({ w: art.cols, h: art.rows, cells }, col, row); // a block's h is lines, as the reader's rows are
  if (pasted) workspace.selectAll(pasted); // selected, with the Select tool, to drag into place
}

// An SVG added to this drawing: its shapes on VECTOR (chosen first, as addSvg picks Vector select there), or the
// tab it was on when nothing came in.
async function addSvg(file) {
  if (project._paused) return; // refused, as a paste is
  const was = workspace.editorTab, text = await file.text();
  workspace.editorTab = 'vector';
  let keys = [];
  try {
    keys = project.addSvg(text);
  } catch (error) {
    if (!error.userMessage) throw error;
    toast(error.userMessage);
  }
  if (!keys.length) workspace.editorTab = was;
}
</script>

<template>
  <section
      class="edit-workspace"
      :class="{ 'settings-open': workspace.settingsOpen, editing: workspace.editMode, image: !!project.image }"
      @click="workspace.settingsOpen && workspace.toggleSettings()"
  >
    <EditTabs v-model="workspace.editorTab"/>
    <input ref="chooser" class="open-input" type="file" :accept="touch ? null : accept" hidden @change="onChosen">
    <WatchRoomPage v-if="workspace.editorTab === 'room'"/>
    <template v-else>
      <EditToolbar v-if="project.image && workspace.editMode"/>
      <!-- With no drawing (Manage fonts or Palettes on the start screen), the palette layer or the color layer opens at the
           work area's top right, mounted side by side as in EditToolbar, so the one opening can close the other. -->
      <div v-else-if="!project.image && (workspace.paletteLayerOpen || workspace.colorBox)" class="layer-anchor">
        <CharPaletteLayer v-if="workspace.paletteLayerOpen" @close="workspace.paletteLayerOpen = false"/>
        <ColorLayer v-if="workspace.colorBox"/>
      </div>
      <DropZone @file-dropped="handleFileSelected">
        <div class="edit-viewport viewport" :class="{ editing: workspace.editMode }" v-if="project.image">
          <InputEditor v-if="workspace.editorTab === 'input'"/>
          <AnsiEditor v-if="workspace.editorTab === 'output' || workspace.editorTab === 'vector'" :view="workspace.editorTab"/>
          <SauceEditor v-if="workspace.editorTab === 'sauce'"/>
        </div>

        <ZeroState v-else :ready="ready" :recent="recent" :open-recent="openRecent" @browse="browse" @start-blank="startBlank"/>
      </DropZone>
      <ChoiceDialog
          v-if="workspace.artDrop"
          :title="artTitle"
          :sub="artSub"
          :choices="artChoices"
          @choose="chooseArt"
          @cancel="workspace.artDrop = null"
      />
      <KeysPanel v-if="project.image && project.animate && workspace.editMode && workspace.editorTab === 'vector' && workspace.keysOpen"/>
      <AnimationBar v-if="project.image && project.animate && workspace.editMode"/>
    </template>
  </section>
</template>

<style scoped>
section.edit-workspace {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  border-radius: 5px;
  background: var(--surface-1);
  border: 1px solid var(--accent);
  overscroll-behavior: none;
}

section.edit-workspace.editing.image {
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  background-color: var(--surface-0);
  background-image: linear-gradient(45deg, var(--surface-dark) 25%, transparent 25%),
  linear-gradient(-45deg, var(--surface-dark) 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, var(--surface-dark) 75%),
  linear-gradient(-45deg, transparent 75%, var(--surface-dark) 75%);
}

div.layer-anchor {
  position: relative;
  height: 0;
}

div.viewport {
  display: flex;
  flex: 1;
  min-width: 100%;
  min-height: 100%;
}

@media (max-width: 768px) {
  section.edit-workspace {
    position: fixed;
    width: 100vw;
    height: 100dvh;
    top: 0;
    left: 0;
    border: 0;
    border-radius: 0;
    transition: transform 0.2s ease;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--shadow) 40%, transparent);
  }

  section.edit-workspace.settings-open {
    transform: translateX(260px);
  }
}

@media (prefers-reduced-motion: reduce) {
  section.edit-workspace {
    transition: none;
  }
}
</style>
