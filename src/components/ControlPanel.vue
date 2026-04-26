<script>
import { mapWritableState, mapActions } from 'pinia';
import { useCurrentFileStore, allKeys as allCurrentFileKeys } from '@/store/CurrentFile';

export default {
  name: 'ControlPanel',
  computed: {
    ...mapWritableState(useCurrentFileStore, allCurrentFileKeys),
    year() {
      return new Date().getFullYear();
    },
    isMobile() {
      return this.mobileMode;
    },
    updateEvent() {
      return this.mobileMode ? 'change' : 'input';
    },
  },
  data() {
    return {
      mobileMode: false,
      localValues: {},
    };
  },
  mounted() {
    this.updateMobileMode();
    window.addEventListener('resize', this.updateMobileMode);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.updateMobileMode);
  },
  methods: {
    ...mapActions(useCurrentFileStore, [
      'randomizeSeed',
      'exportFile',
      'resetSliders',
      'resetTransform',
      'resetAdjust',
      'resetEffects',
      'updateCols',
      'updateRows',
    ]),
    updateMobileMode() {
      this.mobileMode = window.matchMedia('(max-width: 768px)').matches;
    },
    getDisplayValue(key) {
      return this.localValues[key] !== undefined ? this.localValues[key] : this[key];
    },
    getFormattedValue(key) {
      const val = parseFloat(this.getDisplayValue(key));
      if (isNaN(val)) return this.getDisplayValue(key);
      if (key === 'edges') return val.toFixed(2);
      if (key === 'edgeThickness') return val.toFixed(1);
      return Math.round(val).toString();
    },
    getPercent(key, min, max) {
      const val = this.getDisplayValue(key);
      return ((val - min) / (max - min)) * 100;
    },
    onInput(key, event) {
      this.localValues[key] = event.target.value;
    },
    commitUpdate(key, event) {
      this[key] = event.target.value;
      delete this.localValues[key];
    },
  },
};
</script>

<template>
  <aside>
    <div class="logo"></div>
    <fieldset>
      <legend>Setup</legend>

      <div class="field">
        <label for="cols">Dimensions</label>
        <div class="row-inputs">
          <input
            type="number"
            id="cols"
            :value="cols"
            @input="updateCols($event.target.value)"
            @change="$event.target.value = cols"
            min="1"
            :max="maxCols"
            class="mono"
          >
          <button title="Lock Aspect Ratio" :class="{ active: aspectLock }" @click="aspectLock = !aspectLock">
            {{ aspectLock ? '🔒' : '🔓' }}
          </button>
          <input
            type="number"
            id="rows"
            :value="rows"
            @input="updateRows($event.target.value)"
            @change="$event.target.value = rows"
            min="1"
            :max="maxRows"
            class="mono"
          >
        </div>
      </div>

      <div class="field">
        <label for="chars">Characters</label>
        <input type="text" id="chars" v-model.lazy="chars" placeholder="characters" class="mono">
      </div>

      <div class="field">
        <label for="seed">Character Seed</label>
        <div class="row-inputs">
          <input type="text" id="seed" v-model.lazy="seed" placeholder="seed">
          <button @click="randomizeSeed" title="Randomize Seed">🎲</button>
        </div>
      </div>

      <div class="field">
        <label for="smoothing">Smoothing</label>
        <select id="smoothing" v-model="smoothing">
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </div>

      <div class="field">
        <label for="quantize">Color Palette</label>
        <select id="quantize" v-model="quantize">
          <option value="none">Full color (24-bit)</option>
          <option value="vga">VGA colors (8-bit)</option>
          <option value="cga">CGA colors (4-bit)</option>
          <option value="count">Number (24-bit)</option>
          <option value="palette">Color List (24-bit)</option>
        </select>
      </div>

      <div v-if="quantize === 'count'" class="field">
        <div class="label-row">
          <label for="color_count">Color Count</label>
          <span class="value">{{ getFormattedValue('colorCount') }}</span>
        </div>
        <div class="range-wrapper" :style="{ '--percent': getPercent('colorCount', 2, 255) }">
          <input type="range" id="color_count" min="2" max="255" :value="getDisplayValue('colorCount')" @input="onInput('colorCount', $event)" @[updateEvent]="commitUpdate('colorCount', $event)">
          <span class="value-tooltip">{{ getFormattedValue('colorCount') }}</span>
        </div>
      </div>
      <div v-else-if="quantize === 'palette'" class="field">
        <label for="palette">Palette Colors</label>
        <input type="text" id="palette" v-model.lazy="palette" placeholder="#FFFFFFF #000000">
      </div>
    </fieldset>

    <hr/>

    <fieldset>
      <legend>
        Transform
        <button @click="resetTransform" tabindex="-1">RESET</button>
      </legend>

      <div class="field">
        <div class="label-row">
          <label for="invert">Invert</label>
          <span class="value">{{ getFormattedValue('invert') }}%</span>
        </div>
        <div class="range-wrapper" :style="{ '--percent': getPercent('invert', 0, 100) }">
          <input type="range" id="invert" min="0" max="100" :value="getDisplayValue('invert')" @input="onInput('invert', $event)" @[updateEvent]="commitUpdate('invert', $event)">
          <span class="value-tooltip">{{ getFormattedValue('invert') }}%</span>
        </div>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="hue">Hue Rotation</label>
          <span class="value">{{ getFormattedValue('hue') }}°</span>
        </div>
        <div class="range-wrapper" :style="{ '--percent': getPercent('hue', 0, 360) }">
          <input type="range" id="hue" min="0" max="360" :value="getDisplayValue('hue')" @input="onInput('hue', $event)" @[updateEvent]="commitUpdate('hue', $event)">
          <span class="value-tooltip">{{ getFormattedValue('hue') }}°</span>
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>
        Adjust
        <button @click="resetAdjust" tabindex="-1">RESET</button>
      </legend>

      <div class="field">
        <div class="label-row">
          <label for="brightness">Brightness</label>
          <span class="value">{{ getFormattedValue('brightness') }}%</span>
        </div>
        <div class="range-wrapper" :style="{ '--percent': getPercent('brightness', 0, 500) }">
          <input type="range" id="brightness" min="0" max="500" :value="getDisplayValue('brightness')" @input="onInput('brightness', $event)" @[updateEvent]="commitUpdate('brightness', $event)" list="default-ticks">
          <span class="value-tooltip">{{ getFormattedValue('brightness') }}%</span>
        </div>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="contrast">Contrast</label>
          <span class="value">{{ getFormattedValue('contrast') }}%</span>
        </div>
        <div class="range-wrapper" :style="{ '--percent': getPercent('contrast', 0, 500) }">
          <input type="range" id="contrast" min="0" max="500" :value="getDisplayValue('contrast')" @input="onInput('contrast', $event)" @[updateEvent]="commitUpdate('contrast', $event)" list="default-ticks">
          <span class="value-tooltip">{{ getFormattedValue('contrast') }}%</span>
        </div>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="saturation">Saturation</label>
          <span class="value">{{ getFormattedValue('saturation') }}%</span>
        </div>
        <div class="range-wrapper" :style="{ '--percent': getPercent('saturation', 0, 500) }">
          <input type="range" id="saturation" min="0" max="500" :value="getDisplayValue('saturation')" @input="onInput('saturation', $event)" @[updateEvent]="commitUpdate('saturation', $event)" list="default-ticks">
          <span class="value-tooltip">{{ getFormattedValue('saturation') }}%</span>
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>
        Effects
        <button @click="resetEffects" tabindex="-1">RESET</button>
      </legend>

      <div class="field">
        <div class="label-row">
          <label for="sharpen">Sharpen</label>
          <span class="value">{{ getFormattedValue('sharpen') }}</span>
        </div>
        <div class="range-wrapper" :style="{ '--percent': getPercent('sharpen', 0, 100) }">
          <input type="range" id="sharpen" min="0" max="100" :value="getDisplayValue('sharpen')" @input="onInput('sharpen', $event)" @[updateEvent]="commitUpdate('sharpen', $event)" list="zero-ticks">
          <span class="value-tooltip">{{ getFormattedValue('sharpen') }}</span>
        </div>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="flatten">Flatten</label>
          <span class="value">{{ getFormattedValue('flatten') }}</span>
        </div>
        <div class="range-wrapper" :style="{ '--percent': getPercent('flatten', 0, 10) }">
          <input type="range" id="flatten" min="0" max="10" :value="getDisplayValue('flatten')" @input="onInput('flatten', $event)" @[updateEvent]="commitUpdate('flatten', $event)" list="zero-ticks">
          <span class="value-tooltip">{{ getFormattedValue('flatten') }}</span>
        </div>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="edges">Edges</label>
          <span class="value">{{ getFormattedValue('edges') }}</span>
        </div>
        <div class="row-inputs">
          <div class="range-wrapper" :style="{ '--percent': getPercent('edges', 0, 20) }">
            <input type="range" id="edges" min="0" max="20" step="0.01" :value="getDisplayValue('edges')" @input="onInput('edges', $event)" @[updateEvent]="commitUpdate('edges', $event)" list="zero-ticks">
            <span class="value-tooltip">{{ getFormattedValue('edges') }}</span>
          </div>
          <input type="color" v-model="edgeColor">
        </div>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="edges">Edge Thickness</label>
          <span class="value">{{ getFormattedValue('edgeThickness') }}</span>
        </div>
        <div class="range-wrapper" :style="{ '--percent': getPercent('edgeThickness', 0, 5) }">
          <input type="range" min="0" max="5" step="0.1" :value="getDisplayValue('edgeThickness')" @input="onInput('edgeThickness', $event)" @[updateEvent]="commitUpdate('edgeThickness', $event)">
          <span class="value-tooltip">{{ getFormattedValue('edgeThickness') }}</span>
        </div>
      </div>
    </fieldset>

    <button @click="resetSliders">RESET ALL</button>

    <hr/>

    <div class="export-actions">
      <button @click="exportFile('ans')" :disabled="!image" class="primary">Export .ans</button>
      <button @click="exportFile('utf8ans')" :disabled="!image" class="primary">Export .utf8ans</button>
    </div>

    <footer class="attribution">
      Brought to you by <a href="https://ishifishi.work" target="_blank">ishifishi.work</a>
      <div class="copyright">&copy; {{ year }} Phosphor</div>
    </footer>

    <datalist id="default-ticks">
      <option value="100"></option>
    </datalist>
    <datalist id="zero-ticks">
      <option value="0"></option>
    </datalist>
  </aside>
</template>

<style scoped>
aside {
  display: flex;
  flex-direction: column;
  flex: 0 0 210px;
  gap: 8px;
  max-width: 210px;
  padding: 20px;
  overflow-y: auto;
}

div.logo {
  display: block;
  width: 100%;
  aspect-ratio: 210 / 150;
  margin-bottom: 10px;
  user-select: none;
  pointer-events: none;
  background-image: var(--logo);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

fieldset {
  margin: 10px 0 0;
  min-width: 0;
  padding: 0;
  border: 0;
}

legend {
  width: 100%;
  padding: 0 0 4px;
  margin: 10px 0 15px 0;
  opacity: 0.8;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text);
}

legend button {
  float: right;
  padding: 3px;
  border: none;
  box-shadow: none !important;
  background: transparent;
  font-size: 10px;
  color: var(--text-faint);
}

legend button:hover {
  transform: none;
  color: var(--accent-hot);
}

div.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

div.label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

div.row-inputs {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
}

div.row-inputs button {
  width: 38px;
  padding: 8px;
  flex-shrink: 0;
}

label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent-hot);
}

span.value {
  font-family: 'Simple Console', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

div.range-wrapper {
  position: relative;
  display: flex;
  width: 100%;
  align-items: center;
}

span.value-tooltip {
  position: absolute;
  bottom: 100%;
  /* Account for thumb width (17px + 2px border on each side = 21px) */
  left: calc(10.5px + (100% - 21px) * var(--percent, 0) / 100);
  transform: translateX(-50%) translateY(-12px);
  background: var(--black);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'Simple Console', monospace;
  font-size: 14px;
  font-weight: bold;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.1s ease-out, transform 0.1s ease-out;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}

span.value-tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: var(--black) transparent transparent transparent;
}

hr {
  width: 100%;
  margin: 12px 0;
  border: 0;
  border-top: 1px solid var(--border-subtle);
}

div.export-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

footer {
  margin: 12px 12px 50px;
  font-size: 10px;
  text-align: center;
  line-height: 1.6;
  color: var(--text);
}

footer a {
  text-decoration: none;
  font-weight: 600;
  color: var(--accent-hover);
}

footer a:hover {
  text-decoration: underline;
}

footer div.copyright {
  opacity: 0.5;
}

@media (max-width: 768px) {
  aside {
    height: 100dvh;
  }

  input[type=range]:active + span.value-tooltip {
    opacity: 1;
    visibility: visible;
  }

  span.value-tooltip {
    /* Account for thumb width (23px + 2px border on each side = 27px) */
    left: calc(13.5px + (100% - 27px) * var(--percent, 0) / 100);
  }
}
</style>