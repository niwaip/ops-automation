const fs = require('fs');
const zlib = require('zlib');
const Docker = require('dockerode');
const root = '/workspace/apps/backend/runtimes/personal-sandbox-runner';
const files = Object.fromEntries(['test_artifact_terminal_claims', 'test_dsh', 'test_small_model_protocol']
  .map((name) => [name, fs.readFileSync(`${root}/tests/${name}.py`, 'utf8')]));
const encoded = zlib.gzipSync(JSON.stringify(files)).toString('base64');
const code = `
import sys,types,json,gzip,base64,unittest,hashlib
from pathlib import Path
sys.path.insert(0,'/usr/local/bin')
sources=json.loads(gzip.decompress(base64.b64decode('${encoded}')))
mods={}
for name,source in sources.items():
    mod=types.ModuleType(name); mod.__file__='/tmp/skill-tests/tests/'+name+'.py'; sys.modules[name]=mod
    exec(compile(source,mod.__file__,'exec'),mod.__dict__); mods[name]=mod
suite=unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromModule(mods['test_artifact_terminal_claims']))
for name in ['test_detect_missing_claimed_artifacts_rejects_historical_other_task_file','test_missing_claimed_artifacts_sanitizes_sentence_prefixes']:
    suite.addTest(mods['test_dsh'].TestDshCoreModules(name))
for name in ['test_generation_guard_rejects_plan_only_web_game_response','test_metric_alignment_guard_intercepts_sheet_listing_parroting','test_guard_handles_assistant_messages_with_none_content']:
    suite.addTest(mods['test_small_model_protocol'].TestSmallModelProtocol(name))
result=unittest.TextTestRunner(verbosity=2).run(suite)
from dsh_modules.skills import get_available_skills
from dsh_modules.skill_router import SkillRouter
route=SkillRouter.route('用部门别有偿统计处理这份附件',files=['skill-validation-20261022.xlsx'])
summary={'testsRun':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),
    'skillFound':any(s['id']=='dept-summary' for s in get_available_skills()),'selectedSkill':route.skill_id,
    'skillSha256':hashlib.sha256(Path('/knowledge/skills/dept-summary/SKILL.md').read_bytes()).hexdigest(),
    'runtimeAgentLoopSha256':hashlib.sha256(Path('/usr/local/bin/dsh_modules/agent_loop.py').read_bytes()).hexdigest()}
print('SUMMARY_JSON='+json.dumps(summary))
sys.exit(0 if result.wasSuccessful() and summary['skillFound'] and route.skill_id=='dept-summary' else 1)
`;
(async () => {
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
  const container = docker.getContainer('ops-user-sandbox-e7fce333-a8f4-4097-9a53-f0a4c729da46');
  const exec = await container.exec({ Cmd: ['python3', '-c', code], User: '1001:1001',
    Env: ['PYTHONDONTWRITEBYTECODE=1'], AttachStdout: true, AttachStderr: true });
  const stream = await exec.start({});
  let output = '';
  const { Writable } = require('stream');
  const sink = new Writable({ write(chunk, encoding, cb) { output += chunk.toString(); cb(); } });
  docker.modem.demuxStream(stream, sink, sink);
  await new Promise((resolve, reject) => { stream.on('end', resolve); stream.on('error', reject); });
  const artifact = '/workspace/docs/artifacts/reviews/department-paid-skill-fix-20261022/python-results.txt';
  fs.writeFileSync(artifact, output);
  process.stdout.write(output);
  process.exitCode = (await exec.inspect()).ExitCode;
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
