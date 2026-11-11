<script setup>
import { computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { toast } from '@/composables/useToast';
import { isProjectFile, loadImage } from '@/document/projectIO';
import { isArtFile, readArtFile } from '@/lib/ArtFile';
import { isSvgFile } from '@/lib/SvgFile.js';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { useLayerName } from '@/composables/useLayerName';
import { usePlayback } from '@/composables/usePlayback';

import EditTabs from '@/components/EditTabs.vue';
import ZeroState from '@/components/ZeroState.vue';
import SauceEditor from '@/components/SauceEditor.vue';
import DropZone from '@/components/DropZone.vue';
import AnimationBar from '@/components/AnimationBar.vue';
import KeysPanel from '@/components/KeysPanel.vue';
import AnsiEditor from '@/components/AnsiEditor.vue';
import InputEditor from '@/components/InputEditor.vue';
import EditToolbar from '@/components/EditToolbar.vue';
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
useKeyboardShortcuts(project, workspace);
const playback = usePlayback();

onMounted(() => project.render());
watch(() => project.processParams, () => project.render(), { deep: true });
// A layer's own character settings changed (a layer added or gone draws itself, and a rename keeps its params).
watch(() => project.layerParams, (now, was) => {
  if ([...now].some(([id, params]) => was.has(id) && was.get(id) !== params)) project.render();
});
// The frame before's staying cells are a ghost from its picture: built when there's a new frame before, or it went
// stale (a render).
watch(() => [project.frame, project.frames, project.renderedCells, project.animate, workspace.ghost, workspace.playing], () => {
  if (!workspace.playing && workspace.ghost) project.buildGhost();
});

// Every file dropped or chosen comes through here. A picture, a project, an art file or an SVG opens; anything else
// says so, naming the file. A file with no type (some phones give none for a photo) is tried as a picture first.
const knownKind = (file) => isProjectFile(file.name) || isArtFile(file.name) || isSvgFile(file.name);
async function canOpen(file) {
  if (file.type.startsWith('image/') || knownKind(file)) return true;
  if (file.type) return false;
  try {
    await loadImage(file, '');
    return true;
  } catch {
    return false;
  }
}

async function handleFileSelected(file) {
  if (!(await canOpen(file))) return toast(t('actions.cantOpen', { name: file.name }));
  // An art or SVG file over a drawing asks whether to add it or open it (artDrop), even in a room: adding is a
  // paste. An SVG is never a picture: it's shapes.
  if (project.image && (isArtFile(file.name) || isSvgFile(file.name))) return (workspace.artDrop = { file, at: null });
  if (drawing.offWithOthers) return toast(drawing.offWithOthers);
  // From the start screen, an art file asks whether to edit it or draw on top of it.
  if (isArtFile(file.name)) return (workspace.artDrop = { file, at: null });
  // A picture over a still drawing (not shared with a room) asks too: added as a layer's paint, or opened in its place.
  if (project.image && !isProjectFile(file.name) && !project.hasFrames && !project._sharing) return (workspace.artDrop = { file, at: null, picture: true });
  project.commitPending(); // text typed a moment ago counts
  if (project.image && project.isDirty && !confirm(t('actions.confirmOpen', { name: file.name }))) return;
  if (!project.image) workspace.editorTab = isSvgFile(file.name) ? 'vector' : 'output'; // from the start screen, chosen first: the address moves once
  if (isProjectFile(file.name)) await project.loadProject(file);
  else if (isArtFile(file.name) || isSvgFile(file.name)) return openArt(file);
  else await project.setImageFromFile(file);
  workspace.editorTab = 'output';
}

// A blank canvas opens on ANSI, as everything else does (chosen first, so the address moves once).
function startBlank() {
  workspace.editorTab = 'output';
  project.setBlankCanvas();
}

// An art file opens on ANSI, onto the layer chosen ('edit' or 'base'); an SVG on VECTOR (openSvgFile chooses it).
async function openArt(file, layer) {
  const svg = isSvgFile(file.name);
  try {
    await (svg ? project.openSvgFile(file) : project.openArtFile(file, { layer }));
  } catch (error) {
    if (!error.userMessage) throw error;
    return toast(error.userMessage); // nothing changed, so stay where we are
  }
  if (!svg) workspace.editorTab = 'output';
}

// The art file's question. On the start screen: edit it (its art on the edit layer) or draw on top of it (its
// art the base layer). Dropped on a drawing: added as a paste is (floating and selected, where it was dropped or at
// the view's top-left), an SVG as shapes on VECTOR, or a picture as paint on the cells layer picked (else a new one);
// or opened in place of this drawing, an art file onto either layer (not in a room where opening is off).
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
  const open = drop.picture || isSvgFile(drop.file.name) ? [{ id: 'open', title: t('actions.artOpen'), text: t('actions.artOpenText') }] : [
    { id: 'edit', title: t('actions.artOpenEdit'), text: t('actions.artOpenEditText') },
    { id: 'base', title: t('actions.artOpenDrawOn'), text: t('actions.artOpenDrawOnText') },
  ];
  return [{ id: 'add', title: t('actions.artAdd'), text: addText(drop) }, ...(drawing.offWithOthers ? [] : open)];
});
const artTitle = computed(() => t(project.image ? 'actions.artDropTitle' : 'actions.artOpenTitle', { name: workspace.artDrop?.file.name }));
const artSub = computed(() => (!project.image ? t('actions.artOpenSub') : drawing.offWithOthers ? t('actions.artDropSubAddOnly') : t('actions.artDropSub')));
async function chooseArt(choice) {
  const { file, at, picture } = workspace.artDrop;
  workspace.artDrop = null;
  if (picture) {
    if (choice === 'add') return project.addPictureToLayer(file);
    project.commitPending(); // text typed a moment ago counts
    if (project.isDirty && !confirm(t('actions.confirmOpen', { name: file.name }))) return;
    await project.setImageFromFile(file);
    workspace.editorTab = 'output';
    return;
  }
  if (choice !== 'add') { // 'edit' or 'base' (an art file's layer), or 'open' (an SVG)
    if (!project.image) workspace.editorTab = 'output'; // from the start screen, chosen first: the address moves once
    else {
      project.commitPending(); // text typed a moment ago counts
      if (project.isDirty && !confirm(t('actions.confirmOpen', { name: file.name }))) return;
    }
    return openArt(file, choice);
  }
  if (playback.playing) playback.pause(); // it lands on the frame showing
  if (isSvgFile(file.name)) return addSvg(file);
  let art;
  try {
    art = readArtFile(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (error) {
    if (!error.userMessage) throw error;
    return toast(error.userMessage);
  }
  if (project._paused) return; // refused, as a paste is
  // Dropped beside the drawing (or on the SAUCE tab): the top-left of the art view last shown, which comes back.
  workspace.editorTab = workspace.viewTab;
  const { col, row } = at ?? (workspace.viewTab === 'output' ? workspace.ansiViewOrigin : workspace.pixelViewOrigin);
  const pasted = project.pasteSelection({ w: art.cols, h: art.rows, cells: art.cells }, col, row); // a block's h is lines, as the reader's rows are
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
    <WatchRoomPage v-if="workspace.editorTab === 'room'"/>
    <template v-else>
      <EditToolbar v-if="project.image && workspace.editMode"/>
      <DropZone @file-dropped="handleFileSelected">
        <div class="edit-viewport viewport" :class="{ editing: workspace.editMode }" v-if="project.image">
          <InputEditor v-if="workspace.editorTab === 'input'"/>
          <AnsiEditor v-if="workspace.editorTab === 'output' || workspace.editorTab === 'vector'" :view="workspace.editorTab"/>
          <SauceEditor v-if="workspace.editorTab === 'sauce'"/>
        </div>

        <ZeroState v-else :ready="ready" :recent="recent" :open-recent="openRecent" @file-selected="handleFileSelected" @start-blank="startBlank"/>
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
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
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
