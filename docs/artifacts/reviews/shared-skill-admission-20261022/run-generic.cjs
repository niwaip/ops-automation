const fs=require('fs');
const Docker=require('dockerode');
(async()=>{
 const root='/workspace/docs/artifacts/reviews/shared-skill-admission-20261022';
 const code=fs.readFileSync(root+'/live-generic.py','utf8');
 const container=new Docker().getContainer('ops-user-sandbox-e7fce333-a8f4-4097-9a53-f0a4c729da46');
 const exec=await container.exec({Cmd:['python3','-c',code],Tty:true,AttachStdout:true,AttachStderr:true,User:'sandbox'});
 const stream=await exec.start({hijack:true,stdin:false});let output='';
 stream.on('data',b=>{output+=b.toString();process.stdout.write(b)});
 await new Promise((ok,bad)=>{stream.on('end',ok);stream.on('error',bad)});
 const state=await exec.inspect();
 const line=output.split('GENERIC_RESULT=')[1];
 if(line) fs.writeFileSync(root+'/live-generic-results.json',JSON.stringify(JSON.parse(line.trim()),null,2));
 if(state.ExitCode) process.exitCode=state.ExitCode;
})().catch(e=>{console.error(e);process.exitCode=1});
