<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { layerName } from '@/store/project/shared.js';
import ChoiceDialog from '@/components/ChoiceDialog.vue';

// Asked in a room before a layer is deleted (workspace.deleteLayerAsk, from LAYERS' Delete): everyone in the room loses it
// and what's on it, and no one can undo that. Delete layer deletes it (project.deleteLayer), Cancel keeps it. Gone meanwhile
// (someone else deleted it), there's nothing to ask.
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();

const layer = computed(() => workspace.deleteLayerAsk && project.layerById(workspace.deleteLayerAsk.id));

function done(go) {
  const { id } = workspace.deleteLayerAsk;
  workspace.deleteLayerAsk = null;
  if (go) project.deleteLayer(id);
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
