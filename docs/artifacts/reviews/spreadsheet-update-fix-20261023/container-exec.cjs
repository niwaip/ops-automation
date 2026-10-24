// Execute validation in the existing sandbox via the compose-managed broker.
const Docker = require('dockerode');
(async () => {
  const job = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  const docker = new Docker({socketPath:'/var/run/docker.sock'});
  const container = docker.getContainer(job.container);
  if (!(await container.inspect()).State.Running) await container.start();
  const exec = await container.exec({Cmd:job.cmd,Env:job.env||[],WorkingDir:job.cwd||'/workspace',AttachStdout:true,AttachStderr:true});
  const stream = await exec.start({});
  docker.modem.demuxStream(stream,process.stdout,process.stderr);
  await new Promise((resolve,reject)=>{stream.on('end',resolve);stream.on('error',reject)});
  process.exitCode=(await exec.inspect()).ExitCode||0;
})().catch(e=>{console.error(e.message);process.exitCode=1});
