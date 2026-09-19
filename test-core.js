const fs=require('fs');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const css=fs.readFileSync(__dirname+'/styles.css','utf8');
const checks=[
 ['photo input',/id="fileInput"/.test(html)],
 ['3-layer canvas',/id="photoCanvas"/.test(html)&&/id="outlineCanvas"/.test(html)&&/id="drawCanvas"/.test(html)],
 ['outline Sobel',/const gx=/.test(app)&&/const gy=/.test(app)],
 ['auto color',/state\.autoColor\?colorAt/.test(app)],
 ['manual eyedropper',/eyedropperMode/.test(app)],
 ['undo redo',/pushHistory/.test(app)&&/restoreHistory/.test(app)],
 ['export PNG',/toDataURL\('image\/png'\)/.test(app)],
 ['responsive css',/@media\(max-width:760px\)/.test(css)],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++}process.exitCode=failed?1:0;
