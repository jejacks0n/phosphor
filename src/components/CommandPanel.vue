<script>
import { mapWritableState, mapActions } from 'pinia';
import { useCurrentFileStore, allKeys as allCurrentFileKeys } from "@/store/CurrentFile";

export default {
  name: 'CommandPanel',
  computed: {
    ...mapWritableState(useCurrentFileStore, allCurrentFileKeys),
  },
  methods: {
    ...mapActions(useCurrentFileStore, [
      'setImageFromInput',
      'randomizeSeed',
      'undo',
      'redo',
      'exportFile',
    ]),
    exportAns() {
      this.exportFile('ans', { colorMode: 'cga' });
    },
    exportUtf8ans() {
      this.exportFile('utf8ans', { utf8: true, colorMode: 'none' });
    }
  },
};
</script>

<template>
  <section>
    <label for="seed">Seed</label>
    <input type="text" id="seed" v-model.lazy="seed" placeholder="seed">
    <button @click="randomizeSeed">randomize</button>

    <label for="cols">Columns / Rows</label>
    <input type="number" id="cols" v-model.lazy="cols" min="0" max="1000" placeholder="number of columns">
    <input type="number" id="rows" v-model.lazy="rows" min="0" max="1000" placeholder="number of rows">

    <label for="chars">Characters</label>
    <input type="text" id="chars" v-model.lazy="chars" placeholder="characters">

    <hr />

    <label for="image">Source Image</label>
    <input type="file" id="image" @change="setImageFromInput" accept="image/jpeg, image/png">

    <label for="smoothing">Smoothing</label>
    <select id="smoothing" v-model="smoothing">
      <option value="none">none</option>
      <option value="low">low</option>
      <option value="medium">medium</option>
      <option value="high">high</option>
    </select>

    <label for="invert">Invert</label>
    <input type="range" id="invert" min="0" max="100" v-model.lazy="invert">

    <label for="brightness">Brightness</label>
    <input type="range" id="brightness" min="0" max="500" v-model.lazy="brightness">

    <label for="contrast">Contrast</label>
    <input type="range" id="contrast" min="0" max="500" v-model.lazy="contrast">

    <label for="saturation">Saturation</label>
    <input type="range" id="saturation" min="0" max="500" v-model.lazy="saturation">

    <label for="hue">Hue rotation</label>
    <input type="range" id="hue" min="0" max="360" v-model.lazy="hue">

    <hr />

    <label for="quantize">Quantization</label>
    <select id="quantize" v-model="quantize">
      <option value="none">Full color (24-bit)</option>
      <option value="cga">CGA colors (4-bit)</option>
      <option value="vga">VGA colors (8-bit)</option>
      <option value="count">Number (24-bit)</option>
      <option value="palette">Color List (24-bit)</option>
    </select>

    <div v-if="quantize === 'count'">
      <label for="color_count">Quantize Color Count</label>
      <input type="range" id="color_count" min="2" max="255" v-model.lazy="colorCount">
    </div>
    <div v-else-if="quantize === 'palette'">
      <label for="palette">Quantize Palette</label>
      <input type="text" id="palette" v-model.lazy="palette" placeholder="#FFFFFFF #000000">
    </div>

    <hr />

    <button @click="undo">undo</button>
    <button @click="redo">redo</button>

    <hr />

    <button @click="exportAns">Export ans</button>
    <button @click="exportUtf8ans">Export utf8ans</button>
  </section>
</template>

<style scoped>
section {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 200px;
  background: #0000aa;
  border: 2px solid #55ffff;
}

label {
  color: #55ffff;
  display: block;
}

input {
  width: 100%;
  box-sizing: border-box;
}

input[type=checkbox] {
  margin-top: 10px;
  width: auto;
}

input#cols, input#rows {
  width: 80px;
}
</style>
