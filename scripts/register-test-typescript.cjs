// Test-only loader for environments where tsx cannot read the OS user profile.
// Uses the project's existing compiler; it never installs or fetches packages.
const fs=require('node:fs');
const esbuild=require('esbuild');
const {pathToFileURL}=require('node:url');
for(const extension of ['.ts','.tsx']){
  require.extensions[extension]=(module,filename)=>{
    const code=esbuild.transformSync(fs.readFileSync(filename,'utf8'),{
      loader:extension==='.tsx'?'tsx':'ts',format:'cjs',target:'node22',sourcefile:filename,jsx:'automatic',
      define:{'import.meta.url':JSON.stringify(pathToFileURL(filename).href)},
    }).code;
    module._compile(code,filename);
  };
}
