import {lstatSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';

const app=process.argv[2]&&resolve(process.argv[2]);
if(!app?.endsWith('.app')||!lstatSync(app).isDirectory())throw new Error('Pass the built .app directory.');
const failures=[];
let checked=0;
function visit(path) {
  const stat=lstatSync(path);
  if(stat.isSymbolicLink())return;
  // productbuild installs files as root. Every user must be able to read the
  // signed resources and traverse directories to verify the app signature.
  const required=stat.isDirectory()?0o555:0o444;
  if((stat.mode&required)!==required)failures.push(`${relative(app,path)||'.'} (${(stat.mode&0o777).toString(8)})`);
  checked++;
  if(stat.isDirectory())for(const name of readdirSync(path))visit(join(path,name));
}
visit(app);
if(failures.length) {
  console.error(`Store bundle is not readable by all users:\n${failures.join('\n')}`);
  process.exitCode=1;
} else console.log(`Store bundle permissions OK (${checked} files/directories).`);
