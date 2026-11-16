<script setup>
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { layerName } from '@/store/project/shared.js';
import ChoiceDialog from '@/components/ChoiceDialog.vue';

// Asked in a room before a layer is deleted (workspace.deleteLayerAsk, from LAYERS' Delete): everyone in the room loses it
// and what's on it, and no one can undo that. Delete layer deletes it (project.deleteLayer), Cancel keeps it. The ask stays
// (going) until the layer's gone, at once for the host and when the host's stack comes for an artist, for LAYERS to put focus
// back on the picked row. Gone meanwhile (someone else deleted it), there's nothing to ask, and the ask goes, or it would come
// back for the next layer with its id.
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();

const layer = computed(() => workspace.deleteLayerAsk && !workspace.deleteLayerAsk.going && project.layerById(workspace.deleteLayerAsk.id));
watch(() => workspace.deleteLayerAsk && !project.layerById(workspace.deleteLayerAsk.id), (gone) => {
  if (gone) workspace.deleteLayerAsk = null;
});

function done(go) {
  const { id } = workspace.deleteLayerAsk;
  workspace.deleteLayerAsk = go ? { id, going: true } : null;
  if (go && !project.deleteLayer(id) && project._sharing?.role !== 'artist') workspace.deleteLayerAsk = null; // refused here
}
</script>

<template>
  <ChoiceDialog
      v-if="layer"
      :title="t('layers.deleteForEveryoneTitle', { name: layerName(layer) })"
      :sub="t('layers.deleteForEveryoneSub')"
      :choices="[{ id: 'delete', title: t('layers.deleteForEveryone') }]"
      @choose="done(true)"
      @cancel="done(false)"
  />
</template>
