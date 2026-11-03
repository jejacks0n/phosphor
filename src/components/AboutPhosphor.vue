<script setup>
import { useI18n } from 'vue-i18n';
import ReadingDialog from '@/components/ReadingDialog.vue';

// This build: the version (its third number is the day it was built) and the commit (vite.config.js, buildInfo).
const { version, sha } = __BUILD__;

const emit = defineEmits(['close']);
const { t } = useI18n();
</script>

<template>
  <ReadingDialog :label="t('about.label')" @close="emit('close')">
    <header>
      <div class="logo"></div>
      <p class="tagline">{{ t('about.tagline') }}</p>
      <p class="version accent">{{ t('about.version', { version }) }}</p>
      <p class="build">{{ t('about.build', { sha }) }}</p>
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
      <li>{{ t('about.creditScene') }}</li>
    </ul>
    <p>{{ t('about.thanks') }}</p>

    <hr/>

    <div class="footer">
      <p>&copy; 2026 Phosphor Project</p>
      <p class="accent">{{ t('about.motto') }}</p>
    </div>
  </ReadingDialog>
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

p.build {
  margin: 2px 0 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

p.version {
  margin-top: 0;
  margin-bottom: 0;
}

p.accent {
  color: var(--accent);
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
