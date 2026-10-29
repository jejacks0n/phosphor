<script setup>
import { onMounted, useTemplateRef } from 'vue';

// This build: the version (its third number is the day it was built) and the commit (vite.config.js, buildInfo).
const { version, sha } = __BUILD__;

const emit = defineEmits(['close']);
const close = useTemplateRef('close');
onMounted(() => close.value?.focus());

// Keys are the dialog's while it's up (none reach the app's shortcuts); Escape closes it.
function onKeyDown(event) {
  event.stopPropagation();
  if (event.key === 'Escape') emit('close');
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <article class="about-phosphor" role="dialog" aria-modal="true" aria-label="About Phosphor" @keydown="onKeyDown">
      <button ref="close" class="close" @click="emit('close')" title="Close" aria-label="Close">×</button>
      <div class="content-container">
        <header>
          <div class="logo"></div>
          <p class="tagline">Turn images into ANSI and ASCII, then keep drawing ... with style?</p>
          <p class="version accent">v{{ version }}</p>
          <p class="build">build {{ sha }}</p>
        </header>

        <hr/>

        <p>
          Phosphor began in 2019 as a small experiment to build tooling for a concept I called "ANSI Nouveau." At the time, I was interested in the idea of recreating the mid-90s BBS experience I grew up with, but through a modern, high-fidelity lens. Like many passion projects, it eventually got sidetracked and shelved and life gets in the way.
        </p>

        <p>
          Years later, I came across a fantastic <a href="https://github.com/christiansacks/moebius" target="_blank">fork of the Moebius ANSI editor</a> that added 256-color and full-color support. It reminded me of this project, so I dragged it out of storage, dusted off the code -- and leveraging modern tools and techniques, brought it back to life.
        </p>

        <p>
          While Phosphor started as an image to ANSI tool, today it attempts to do two things. It can turn an image into ANSI or ASCII, allowing you to tune it to your liking, and then lets you draw and type over that, cell by cell, and export it as .ans or .utf8ans. Finish the piece here, or take the file into another editor for the last pass -- whether you're after "Pure ANSI" for the purists or the full-color, UTF-8 "ANSI Nouveau" modern style that was my initial inspiration for the project.
        </p>

        <p>
          It's still early versions. Expect bugs, and expect it to be rough on phones and tablets, though it is largely supported on iPad with Apple Pencil via my testing. Feedback, bug reports and ideas are welcome: open an issue on <a href="https://github.com/jejacks0n/phosphor" target="_blank">GitHub</a>, or fork the repo and take it in your own direction.
        </p>

        <p>Credits and special thanks:</p>
        <ul>
          <li><a href="https://ertdfgcvb.xyz" target="_blank">ertdfgcvb</a> (Andreas Gysin) for the inspiration for Phosphor with the (awesome) <a href="https://play.ertdfgcvb.xyz" target="_blank">play.core</a> library</li>
          <li>Andy Herbert, Blocktronics and MeaTLoTioN for their work on Moebius</li>
          <li>lordscarlet (Doug Moore) and Brendan O'Connor for creating sixteencolors and those working to keep <a href="https://16colo.rs" target="_blank">https://16colo.rs</a> alive today.</li>
          <li>The fonts: <a href="https://int10h.org/oldschool-pc-fonts/" target="_blank">IBM VGA 8x16</a> from VileR's Ultimate Oldschool PC Font Pack (<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank">CC BY-SA 4.0</a>), <a href="https://github.com/JetBrains/JetBrainsMono" target="_blank">JetBrains Mono</a> by The JetBrains Mono Project Authors (<a href="https://openfontlicense.org" target="_blank">SIL OFL 1.1</a>), <a href="http://viznut.fi/unscii/" target="_blank">Unscii</a> by viznut (public domain), and <a href="https://unifoundry.com/unifont/" target="_blank">GNU Unifont</a> by Roman Czyborra, Paul Hardy and others (<a href="https://openfontlicense.org" target="_blank">SIL OFL 1.1</a>)</li>
          <li>And the many authors, maintainers, and ANSI artists who have inspired me over the years -- too many to name</li>
        </ul>
        <p>Thanks to all of you for the inspiration, and for keeping the scene going.</p>

        <hr/>

        <div class="footer">
          <p>&copy; 2026 Phosphor Project</p>
          <p class="accent">Make Code Not War</p>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
div.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}

article.about-phosphor {
  position: relative;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  background: var(--surface-0);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  line-height: 1.6;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
}

div.content-container {
  height: 100%;
  overflow: auto;
  padding: 40px;
}

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
