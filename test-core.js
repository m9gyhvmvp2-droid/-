const fs = require('fs');
const app = fs.readFileSync(__dirname + '/app.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const css = fs.readFileSync(__dirname + '/styles.css', 'utf8');
const checks = [
  ['5-layer canvas', /id="photoCanvas"/.test(html) && /id="outlineCanvas"/.test(html) && /id="fillCanvas"/.test(html) && /id="drawCanvas"/.test(html) && /id="textureCanvas"/.test(html)],
  ['move mode UI', /moveModeBtn/.test(html) && /zoomSlider/.test(html)],
  ['12 color palette board', /paletteBoard/.test(html) && /generatePalette\(imageData, 12\)/.test(app)],
  ['4 brushes', /data-brush="watercolor"/.test(html) && /data-brush="pencil"/.test(html) && /data-brush="crayon"/.test(html) && /data-brush="spray"/.test(html)],
  ['easy fill mode', /easyModeBtn/.test(html) && /floodFillRegion/.test(app)],
  ['paper texture', /textureCanvas/.test(html) && /drawWaterTexture/.test(app) && /drawSketchTexture/.test(app)],
  ['responsive css', /@media\(max-width:900px\)/.test(css) && /@media\(max-width:760px\)/.test(css)],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
process.exitCode = failed ? 1 : 0;
