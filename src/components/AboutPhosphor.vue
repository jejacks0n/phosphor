<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import ModalDialog from '@/components/ModalDialog.vue';
import { LINKED_FONTS } from '@/lib/linkedFonts';
import { licenseUrl } from '@/lib/fontLibrary';

// This build: the version (its third number is the day it was built) and the commit (vite.config.js, buildInfo).
const { version, sha } = __BUILD__;

const frogblock = LINKED_FONTS.find((f) => f.id === 'linked/frogblock');
const vilerCredits = licenseUrl('viler/FONTS.TXT');

const emit = defineEmits(['close']);
const { t } = useI18n();
const workspace = useWorkspaceStore();

// About, or Licenses, the dialog's two tabs, in a title's place: the open-source packages this build holds, with their
// licenses (vite.config.js writes licenses.json beside the page, and the development server answers it), read the first
// time it's shown. A host without the file answers with the page, so the list is left out there. Switching starts at
// the top (the dialog's doing).
const tabs = computed(() => [{ key: 'about', label: t('about.aboutTab') }, { key: 'licenses', label: t('about.licensesLabel') }]);
const shown = ref('about');
const licenses = ref(null);
watch(shown, async (tab) => {
  if (tab !== 'licenses' || licenses.value) return;
  licenses.value = [];
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}licenses.json`);
    if (response.ok && response.headers.get('content-type')?.includes('json')) licenses.value = await response.json();
  } catch (error) {
    console.warn('Could not read the licenses', error);
  }
});

// A legal page closing gives focus back to its link.
let opener = null;
function read(page, event) {
  opener = event.currentTarget;
  workspace.legalPage = page;
}
watch(() => workspace.legalPage, (page) => { if (!page) opener?.focus(); }, { flush: 'post' }); // the legal page gone: while it's up, what's under it can't take focus
</script>

<template>
  <ModalDialog v-model:tab="shown" reading closable :back="false" :label="t('about.label')" :tabs="tabs" @cancel="emit('close')">
    <section v-if="shown === 'licenses'" class="licenses" :aria-label="t('about.licensesLabel')">
      <i18n-t keypath="about.licensesIntro" tag="p">
        <template #mit>
          <a href="https://github.com/jejacks0n/phosphor/blob/main/LICENSE" target="_blank" rel="noopener">{{ t('about.mitLicense') }}</a>
        </template>
      </i18n-t>
      <p>{{ t('about.assetsIntro') }}</p>
      <ul class="assets">
        <li>
          <i18n-t keypath="about.creditFonts" tag="span">
            <template #ibmVga>
              <a href="https://int10h.org/oldschool-pc-fonts/" target="_blank">IBM VGA 8x16</a>
            </template>
            <template #ccBySa>
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank">CC BY-SA 4.0</a>
            </template>
            <template #jetbrains>
              <a href="https://github.com/JetBrains/JetBrainsMono" target="_blank">JetBrains Mono</a>
            </template>
            <template #ofl1>
              <a href="https://openfontlicense.org" target="_blank">SIL OFL 1.1</a>
            </template>
            <template #unscii>
              <a href="http://viznut.fi/unscii/" target="_blank">Unscii</a>
            </template>
            <template #unifont>
              <a href="https://unifoundry.com/unifont/" target="_blank">GNU Unifont</a>
            </template>
            <template #ofl2>
              <a href="https://openfontlicense.org" target="_blank">SIL OFL 1.1</a>
            </template>
          </i18n-t>
        </li>
        <li>
          <i18n-t keypath="about.creditIcons" tag="span">
            <template #fontAwesome>
              <a href="https://fontawesome.com" target="_blank">Font Awesome Free</a>
            </template>
            <template #ccBy>
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank">CC BY 4.0</a>
            </template>
          </i18n-t>
        </li>
      </ul>
      <template v-if="licenses?.length">
        <p>{{ t('about.packagesIntro') }}</p>
        <ul class="packages">
          <li v-for="item in licenses" :key="`${item.name}@${item.version}`">
            <details>
              <summary>{{ item.name }} {{ item.version }} <span class="license">({{ item.license }})</span></summary>
              <a :href="item.url" target="_blank" rel="noopener">{{ item.url }}</a>
              <pre>{{ item.text }}</pre>
            </details>
          </li>
      </ul>
      </template>
    </section>

    <template v-else>
      <header>
        <div class="logo"></div>
        <p class="tagline">{{ t('about.tagline') }}</p>
        <p class="version accent">{{ t('about.version', { version }) }}</p>
        <p class="build">{{ t('about.build', { sha }) }}</p>
        <p class="repo"><a href="https://github.com/jejacks0n/phosphor" target="_blank" rel="noopener">github.com/jejacks0n/phosphor</a></p>
      </header>

      <hr/>

      <p>{{ t('about.p1') }}</p>

      <i18n-t keypath="about.p2" tag="p">
        <template #moebiusFork>
          <a href="https://github.com/christiansacks/moebius" target="_blank">fork of the Moebius ANSI editor</a>
        </template>
      </i18n-t>

      <p>{{ t('about.p3') }}</p>

      <i18n-t keypath="about.p4" tag="p">
        <template #github>
          <a href="https://github.com/jejacks0n/phosphor" target="_blank">GitHub</a>
        </template>
      </i18n-t>

      <p>{{ t('about.creditsIntro') }}</p>
      <ul>
        <li>
          <i18n-t keypath="about.creditErtdfgcvb" tag="span">
            <template #ertdfgcvb>
              <a href="https://ertdfgcvb.xyz" target="_blank">ertdfgcvb</a>
            </template>
            <template #playCore>
              <a href="https://play.ertdfgcvb.xyz" target="_blank">play.core</a>
            </template>
          </i18n-t>
        </li>
        <li>{{ t('about.creditMoebius') }}</li>
        <li>
          <i18n-t keypath="about.creditDurdraw" tag="span">
            <template #durdraw>
              <a href="https://github.com/cmang/durdraw" target="_blank">Durdraw</a>
            </template>
          </i18n-t>
        </li>
        <li>
          <i18n-t keypath="about.credit16Colors" tag="span">
            <template #sixteenColors>
              <a href="https://16colo.rs" target="_blank">https://16colo.rs</a>
            </template>
          </i18n-t>
        </li>
        <li>
          <i18n-t keypath="about.creditVilerFonts" tag="span">
            <template #viler>
              <a href="https://github.com/viler-int10h/vga-text-mode-fonts" target="_blank" rel="noopener">{{ t('about.vilerName') }}</a>
            </template>
            <template #fontsTxt>
              <a :href="vilerCredits" target="_blank" rel="noopener">FONTS.TXT</a>
            </template>
          </i18n-t>
        </li>
        <li>
          <i18n-t keypath="about.creditMoebiusFonts" tag="span">
            <template #moebius>
              <a href="https://github.com/hlotvonen/moebiusXBIN" target="_blank" rel="noopener">{{ t('about.moebiusName') }}</a>
            </template>
          </i18n-t>
        </li>
        <li><a :href="frogblock.url" target="_blank" rel="noopener">{{ frogblock.credit }}</a></li>
        <li>{{ t('about.creditScene') }}</li>
      </ul>
      <p>{{ t('about.thanks') }}</p>

      <i18n-t keypath="about.policies" tag="p">
        <template #terms>
          <button type="button" class="link inline" @click="read('terms', $event)">{{ t('legal.titles.terms') }}</button>
        </template>
        <template #privacy>
          <button type="button" class="link inline" @click="read('privacy', $event)">{{ t('legal.titles.privacy') }}</button>
        </template>
        <template #guidelines>
          <button type="button" class="link inline" @click="read('guidelines', $event)">{{ t('legal.titles.guidelines') }}</button>
        </template>
      </i18n-t>

      <hr/>

      <div class="footer">
        <i18n-t keypath="about.byline" tag="p">
          <template #ishifishi>
            <a href="https://ishifishi.work" target="_blank" rel="noopener">ishifishi.work</a>
          </template>
          <template #euphio>
            <a href="https://euphio.org" target="_blank" rel="noopener">euphio.org</a>
          </template>
        </i18n-t>
        <p>&copy; 2026-present Phosphor Project</p>
        <p class="accent">{{ t('about.motto') }}</p>
      </div>
    </template>
  </ModalDialog>
</template>

<style scoped>
header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

div.logo {
  width: 100%;
  background-image: var(--logo);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  margin-bottom: 20px;
  padding-bottom: 50%;
}

p.tagline {
  font-size: 1.2rem;
  color: var(--text-muted);
  margin: 8px 0 0;
}

p {
  margin-bottom: 16px;
}

p, li {
  font-family: 'IBM VGA 8x16', 'JetBrains Mono', monospace;
  font-size: 18px;
  color: var(--text-dim);
}

a {
  color: var(--accent);
  text-decoration: underline;
}

button.link.inline {
  padding: 0;
  font: inherit;
  letter-spacing: normal;
  color: var(--accent);
  text-decoration: underline;
}

p.build {
  margin: 2px 0 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

p.repo {
  margin: 12px 0 0;
}

p.version {
  margin-top: 0;
  margin-bottom: 0;
}

p.accent {
  color: var(--accent);
}

section.licenses ul.packages {
  padding-left: 0;
  list-style: none;
}

section.licenses summary {
  cursor: pointer;
}

section.licenses span.license {
  color: var(--text-muted);
}

section.licenses details a {
  display: block;
  margin: 4px 0 0 18px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
}

section.licenses pre {
  margin: 8px 0 12px 18px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  white-space: pre-wrap;
  color: var(--text-muted);
}

hr {
  margin: 40px 0;
}
div.footer {
  color: var(--text-faint);
  font-size: 0.9rem;
  text-align: center;
}
</style>
