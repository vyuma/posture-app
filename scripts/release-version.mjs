import {readFile,writeFile} from 'node:fs/promises';
const tag=process.env.RELEASE_TAG??process.argv[2],version=tag?.replace(/^v/,'');
if(!version||!/^\d+\.\d+\.\d+$/.test(version))throw new Error('A stable vMAJOR.MINOR.PATCH release tag is required.');
const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]-y[i];}return 0;};
const paths=['package.json','src-tauri/tauri.conf.json','src-tauri/tauri.appstore.conf.json'];
for(const path of paths){const data=JSON.parse(await readFile(path,'utf8'));if(compare(version,data.version)<0)throw new Error(`${tag} would lower ${path} from ${data.version}.`);data.version=version;
  if(path.includes('appstore')) {const build=Number(process.env.GITHUB_RUN_NUMBER??0)+Number(data.bundle.macOS.bundleVersion)+1;data.bundle.macOS.bundleVersion=String(build);}
  await writeFile(path,JSON.stringify(data,null,2)+'\n');
}
const cargo=await readFile('src-tauri/Cargo.toml','utf8');await writeFile('src-tauri/Cargo.toml',cargo.replace(/(\[package\][\s\S]*?\nversion = )"[^"]+"/,`$1"${version}"`));
console.log(`Release version ${version}; identifiers and update keys unchanged.`);
