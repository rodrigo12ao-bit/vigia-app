const fs=require('node:fs');
const path=require('node:path');

// Windows cloud-synced folders may support ordinary reads/writes but reject
// CopyFile's optimized path. Keep the original bytes in that case.
function copyPublicAssets(source,destination,io=fs){
  io.mkdirSync(destination,{recursive:true});
  for(const entry of io.readdirSync(source,{withFileTypes:true})){
    const from=path.join(source,entry.name),to=path.join(destination,entry.name);
    // OneDrive can classify a regular hydrated file as a link in readdir.
    // lstat identifies that file without following a genuine symbolic link.
    const kind=entry.isDirectory()||entry.isFile()?entry:io.lstatSync(from);
    if(kind.isDirectory())copyPublicAssets(from,to,io);
    else if(kind.isFile()){
      try{io.copyFileSync(from,to);}
      catch{io.writeFileSync(to,io.readFileSync(from));}
    }else throw Error('Unsupported public asset: '+entry.name);
  }
}
module.exports={copyPublicAssets};
