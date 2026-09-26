import{readFile,mkdir,copyFile,writeFile,lstat,realpath}from'node:fs/promises';
import{resolve,dirname,relative,extname,join}from'node:path';import{fileURLToPath}from'node:url';
// Explicit owner-selected files only. The game never accepts paths from chat.
const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
if(!args.includes('--model')||!args.includes('--runtime')){console.log('Usage: npm run host:install -- --model /path/model.model3.json --runtime /path/runtime-directory\nRuntime directory: live2dcubismcore.min.js, pixi.min.js, unsafe-eval.min.js, cubism4.min.js\nInstall only assets you have permission to use. Restart/reload the preview afterwards.');process.exit(0);}
const model=resolve(value('--model')),source=dirname(model),root=fileURLToPath(new URL('../examples/whitebridge/modules/pixel-war/public/empress/',import.meta.url));
const base=await realpath(source);const manifest=JSON.parse(await readFile(model,'utf8'));if(manifest.Version!==3||!manifest.FileReferences?.Moc)throw Error('Expected a Cubism model3 manifest');
const files=new Set([model]);let bytes=0;const valid=new Set(['.json','.moc3','.png','.wav']);
async function collect(path){if(relative(base,await realpath(path)).startsWith('..'))throw Error('Model reference escapes through a symlink');const stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>100*1024**2)throw Error('Unsupported model file');bytes+=stat.size;if(bytes>350*1024**2)throw Error('Model exceeds 350 MiB');if(extname(path)!=='.json')return;const doc=JSON.parse(await readFile(path,'utf8'));function visit(v){if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit);else if(typeof v==='string'&&valid.has(extname(v))){const p=resolve(source,v);if(relative(source,p).startsWith('..')||v.includes(':'))throw Error('Model reference must stay in its folder');if(!files.has(p))files.add(p);}}visit(doc);}
for(const path of files)await collect(path);
const runtime=resolve(value('--runtime')),vendor=['live2dcubismcore.min.js','pixi.min.js','unsafe-eval.min.js','cubism4.min.js'];
for(const n of vendor){const s=await lstat(join(runtime,n));if(s.isSymbolicLink()||!s.isFile()||s.size>5*1024**2)throw Error('Invalid runtime file: '+n);}
for(const f of files){const target=join(root,'custom',relative(source,f));await mkdir(dirname(target),{recursive:true});await copyFile(f,target);}
await mkdir(join(root,'vendor'),{recursive:true});for(const n of vendor)await copyFile(join(runtime,n),join(root,'vendor',n));
await writeFile(join(root,'config.json'),JSON.stringify({enabled:true,model:'/empress/custom/'+relative(source,model).split('\\').join('/'),height:900,offsetY:0},null,2)+'\n');
console.log('Host installed locally:',files.size,'model files. Adjust height/offsetY in empress/config.json for your model.');
